package sqlite

// This fork's own schema migrations, tracked separately from upstream's.
//
// golang-migrate records a single version per migrations table. If the fork's
// migrations shared upstream's table, a database migrated by the fork would
// sit at a version past any migration upstream adds later, and those would
// never run. So the fork keeps its migrations in migrations_fork/, numbered
// from 1, and records them in their own table, fork_schema_migrations.
//
// Upstream's migrator is left as upstream wrote it: it migrates
// schema_migrations, and the fork's migrations run afterwards, whenever the
// database is initialised. The rules fork migrations follow are in
// migrations_fork/README.md.

import (
	"embed"
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"github.com/golang-migrate/migrate/v4"
	sqlite3mig "github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/stashapp/stash/pkg/logger"
)

var forkSchemaVersion uint = 1

const forkMigrationsTable = "fork_schema_migrations"

//go:embed migrations_fork/*.sql
var forkMigrationsBox embed.FS

// Before fork_schema_migrations existed, fork migrations were numbered from 185
// in upstream's table, and upstream was at 85. A database still carrying such a
// version is moved over to the two tables by prepareForkMigrations.
const (
	legacyForkVersionBase  = 185
	legacyUpstreamVersion  = 85
	legacyForkVersionDelta = legacyForkVersionBase - 1
)

// MismatchedForkSchemaVersionError indicates that the database has fork
// migrations this binary doesn't know about, so it was migrated by a newer one.
type MismatchedForkSchemaVersionError struct {
	CurrentSchemaVersion  uint
	RequiredSchemaVersion uint
}

func (e *MismatchedForkSchemaVersionError) Error() string {
	return fmt.Sprintf("database fork schema version %d is newer than this build's fork schema version %d; run a newer build or restore an older backup", e.CurrentSchemaVersion, e.RequiredSchemaVersion)
}

func (db *Database) ForkSchemaVersion() uint {
	return forkSchemaVersion
}

func (db *Database) newForkMigrate() (*migrate.Migrate, error) {
	const disableForeignKeys = true
	const writable = true
	conn, err := db.open(disableForeignKeys, writable)
	if err != nil {
		return nil, err
	}

	migrations, err := iofs.New(forkMigrationsBox, "migrations_fork")
	if err != nil {
		conn.Close()
		return nil, err
	}

	// the driver creates the table on first use. Its unique index is named
	// version_unique for every table, so on this one the CREATE INDEX IF NOT
	// EXISTS is a no-op. The driver replaces the single row on each write,
	// so the index isn't needed.
	driver, err := sqlite3mig.WithInstance(conn.DB, &sqlite3mig.Config{MigrationsTable: forkMigrationsTable})
	if err != nil {
		conn.Close()
		return nil, err
	}

	// closing the returned instance closes the connection
	return migrate.NewWithInstance("iofs", migrations, db.dbPath, driver)
}

func forkVersion(m *migrate.Migrate) (version uint, dirty bool, err error) {
	version, dirty, err = m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		return 0, false, nil
	}

	return version, dirty, err
}

// prepareForkMigrations runs when the database is opened, before upstream's
// schema version is read. It notes whether the database is new, so that
// runForkMigrations doesn't back up an empty database. And it moves a database
// migrated under the old numbering (fork migrations from 185 in
// schema_migrations) onto fork_schema_migrations, setting schema_migrations
// back to the upstream version the database really has.
func (db *Database) prepareForkMigrations() error {
	upstream, err := NewMigrator(db)
	if err != nil {
		return err
	}
	defer upstream.Close()

	version := upstream.CurrentSchemaVersion()
	db.forkIsNew = version == 0

	if version < legacyForkVersionBase {
		return nil
	}

	fork, err := db.newForkMigrate()
	if err != nil {
		return err
	}
	defer fork.Close()

	// fork first, so that a failure in between leaves schema_migrations at the
	// legacy version and this runs again on the next start
	newForkVersion := version - legacyForkVersionDelta
	logger.Infof("Moving fork schema version %d to %s as version %d, and upstream schema version to %d", version, forkMigrationsTable, newForkVersion, legacyUpstreamVersion)

	if err := fork.Force(int(newForkVersion)); err != nil {
		return fmt.Errorf("setting fork schema version: %w", err)
	}

	if err := upstream.m.Force(legacyUpstreamVersion); err != nil {
		return fmt.Errorf("setting upstream schema version: %w", err)
	}

	return nil
}

// runForkMigrations brings the fork's migrations up to forkSchemaVersion. It runs
// once upstream's schema is current. An existing database is backed up beside
// itself first, and restored from that backup if a migration fails.
func (db *Database) runForkMigrations() error {
	m, err := db.newForkMigrate()
	if err != nil {
		return fmt.Errorf("opening fork migrations: %w", err)
	}

	current, dirty, err := forkVersion(m)
	if err != nil {
		m.Close()
		return fmt.Errorf("getting fork schema version: %w", err)
	}

	switch {
	case dirty:
		m.Close()
		return fmt.Errorf("fork migration %d did not complete; restore the database from its backup", current)
	case current > forkSchemaVersion:
		m.Close()
		return &MismatchedForkSchemaVersionError{
			CurrentSchemaVersion:  current,
			RequiredSchemaVersion: forkSchemaVersion,
		}
	case current == forkSchemaVersion:
		m.Close()
		return nil
	}

	if db.forkIsNew {
		defer m.Close()
		if err := m.Migrate(forkSchemaVersion); err != nil {
			return fmt.Errorf("running fork migrations: %w", err)
		}
		return nil
	}

	backupPath := filepath.Join(filepath.Dir(db.dbPath), fmt.Sprintf("%s.fork%d.%s", filepath.Base(db.dbPath), current, time.Now().Format("20060102_150405")))
	if err := db.Backup(backupPath); err != nil {
		m.Close()
		return fmt.Errorf("backing up database before fork migrations: %w", err)
	}

	logger.Infof("Migrating database from fork schema version %d to %d", current, forkSchemaVersion)
	err = m.Migrate(forkSchemaVersion)

	// the connection must be closed before the backup can replace the file
	m.Close()

	if err != nil {
		if restoreErr := db.RestoreFromBackup(backupPath); restoreErr != nil {
			return fmt.Errorf("running fork migrations: %w; restoring backup %s also failed: %v", err, backupPath, restoreErr)
		}

		return fmt.Errorf("running fork migrations (database restored from backup): %w", err)
	}

	logger.Infof("Fork migrations complete; the database from before them is kept at %s", backupPath)

	return nil
}
