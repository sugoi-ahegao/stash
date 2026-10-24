package sqlite

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/jmoiron/sqlx"
)

// openForkTestDatabase opens (creating if needed) the database at path.
func openForkTestDatabase(t *testing.T, path string) (*Database, error) {
	t.Helper()
	db := NewDatabase()
	err := db.Open(path)
	if err == nil {
		t.Cleanup(func() { _ = db.Close() })
	}
	return db, err
}

// execRaw runs statements against the database file with no migration logic involved.
func execRaw(t *testing.T, path string, stmts ...string) {
	t.Helper()
	conn, err := sqlx.Connect(sqlite3Driver, "file:"+path)
	if err != nil {
		t.Fatalf("opening %s: %v", path, err)
	}
	defer conn.Close()

	for _, stmt := range stmts {
		if _, err := conn.Exec(stmt); err != nil {
			t.Fatalf("executing %q: %v", stmt, err)
		}
	}
}

func queryUint(t *testing.T, path string, query string) uint {
	t.Helper()
	conn, err := sqlx.Connect(sqlite3Driver, "file:"+path)
	if err != nil {
		t.Fatalf("opening %s: %v", path, err)
	}
	defer conn.Close()

	var ret uint
	if err := conn.Get(&ret, query); err != nil {
		t.Fatalf("querying %q: %v", query, err)
	}
	return ret
}

func assertVersions(t *testing.T, path string, wantUpstream, wantFork uint) {
	t.Helper()
	if got := queryUint(t, path, "SELECT version FROM schema_migrations"); got != wantUpstream {
		t.Errorf("upstream schema version = %d, want %d", got, wantUpstream)
	}
	if got := queryUint(t, path, "SELECT version FROM "+forkMigrationsTable); got != wantFork {
		t.Errorf("fork schema version = %d, want %d", got, wantFork)
	}
}

func assertForkTables(t *testing.T, path string) {
	t.Helper()
	if got := queryUint(t, path, "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'scenes_viewed_dates'"); got != 1 {
		t.Errorf("scenes_viewed_dates table missing")
	}
}

func TestForkMigrations_NewDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stash-go.sqlite")

	if _, err := openForkTestDatabase(t, path); err != nil {
		t.Fatalf("Open: %v", err)
	}

	assertVersions(t, path, appSchemaVersion, forkSchemaVersion)
	assertForkTables(t, path)

	// an empty database has nothing worth backing up
	if backups, _ := filepath.Glob(path + ".fork*"); len(backups) != 0 {
		t.Errorf("new database was backed up: %v", backups)
	}
}

// A database migrated before the fork had its own table carries the fork
// migration as upstream version 185, and no fork table.
func TestForkMigrations_AdoptsLegacyVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stash-go.sqlite")

	db, err := openForkTestDatabase(t, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = db.Close()

	execRaw(t, path,
		"UPDATE schema_migrations SET version = 185",
		"DROP TABLE "+forkMigrationsTable,
	)

	// the database really is at the upstream version legacy versioning was used
	// with. If upstream has migrated since, the database is told to catch up.
	_, err = openForkTestDatabase(t, path)
	var needed *MigrationNeededError
	switch {
	case appSchemaVersion == legacyUpstreamVersion && err != nil:
		t.Fatalf("Open after legacy versioning: %v", err)
	case appSchemaVersion > legacyUpstreamVersion && !errors.As(err, &needed):
		t.Fatalf("Open after legacy versioning: error = %v, want MigrationNeededError", err)
	}

	assertVersions(t, path, legacyUpstreamVersion, 1)
	assertForkTables(t, path)
}

// The reason fork migrations have their own table: when upstream adds a
// migration after the fork's, a fork-migrated database must still be asked to
// run it, rather than being treated as current.
func TestForkMigrations_UpstreamMigrationAfterForkStillRuns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stash-go.sqlite")

	db, err := openForkTestDatabase(t, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = db.Close()

	// pretend this build has one more upstream migration than the database
	defer func(v uint) { appSchemaVersion = v }(appSchemaVersion)
	appSchemaVersion++

	_, err = openForkTestDatabase(t, path)
	var needed *MigrationNeededError
	if !errors.As(err, &needed) {
		t.Fatalf("Open error = %v, want MigrationNeededError", err)
	}

	// the fork's version is untouched by upstream's pending migration
	assertVersions(t, path, appSchemaVersion-1, forkSchemaVersion)
}

func TestForkMigrations_RunsPendingForkMigrations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stash-go.sqlite")

	db, err := openForkTestDatabase(t, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = db.Close()

	// an upstream-only database: upstream schema current, no fork migrations yet
	execRaw(t, path,
		"DROP TABLE scenes_viewed_dates",
		"DROP TABLE "+forkMigrationsTable,
	)

	if _, err := openForkTestDatabase(t, path); err != nil {
		t.Fatalf("Open: %v", err)
	}

	assertVersions(t, path, appSchemaVersion, forkSchemaVersion)
	assertForkTables(t, path)

	backups, _ := filepath.Glob(path + ".fork0.*")
	if len(backups) != 1 {
		t.Errorf("found %d backups from before the fork migrations, want 1", len(backups))
	}
}

func TestForkMigrations_RefusesNewerForkVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stash-go.sqlite")

	db, err := openForkTestDatabase(t, path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = db.Close()

	execRaw(t, path, "UPDATE "+forkMigrationsTable+" SET version = version + 1")

	_, err = openForkTestDatabase(t, path)
	var mismatched *MismatchedForkSchemaVersionError
	if !errors.As(err, &mismatched) {
		t.Fatalf("Open error = %v, want MismatchedForkSchemaVersionError", err)
	}
}
