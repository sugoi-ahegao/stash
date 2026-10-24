package models

// fork: view history, apart from play history. SceneReader and SceneWriter
// embed these. See docs/decisions/0004-views-apart-from-plays.md.

import (
	"context"
	"time"
)

// ViewedDateReader reads VIEW history - the scene being surfaced to the user. Separate
// from ViewDateReader (repository_scene.go), which despite its name reads PLAY history.
type ViewedDateReader interface {
	CountViewed(ctx context.Context, id int) (int, error)
	CountAllViewed(ctx context.Context) (int, error)
	CountUniqueViewed(ctx context.Context) (int, error)
	GetManyViewedCount(ctx context.Context, ids []int) ([]int, error)
	GetViewedDates(ctx context.Context, relatedID int) ([]time.Time, error)
	GetManyViewedDates(ctx context.Context, ids []int) ([][]time.Time, error)
	GetManyLastViewedAt(ctx context.Context, ids []int) ([]*time.Time, error)
}

// ViewedHistoryWriter writes VIEW history. Separate from ViewHistoryWriter
// (repository_scene.go), which
// despite its name writes PLAY history.
type ViewedHistoryWriter interface {
	AddViewed(ctx context.Context, sceneID int, dates []time.Time) ([]time.Time, error)
	DeleteViewed(ctx context.Context, id int, dates []time.Time) ([]time.Time, error)
	DeleteAllViewed(ctx context.Context, id int) (int, error)
}
