package sqlite

// fork: view history, kept in a table of its own (migrations_fork/1). The
// SceneStore embeds viewedDateManager; scene.go's sort and scene_filter.go's
// criteria hold the only other references.
// See docs/decisions/0004-views-apart-from-plays.md.

import (
	"context"
	"time"

	"github.com/doug-martin/goqu/v9"
)

// ⚠️ upstream's scenes_view_dates (scenesViewDatesTable) backs PLAY history, not
// view history - its name predates upstream's rename of "views" to "plays".
const (
	scenesViewedDatesTable = "scenes_viewed_dates"
	sceneViewedDateColumn  = "viewed_date"
)

var scenesViewedTableMgr = &viewHistoryTable{
	table: table{
		table:    goqu.T(scenesViewedDatesTable),
		idColumn: goqu.T(scenesViewedDatesTable).Col(sceneIDColumn),
	},
	dateColumn: goqu.T(scenesViewedDatesTable).Col(sceneViewedDateColumn),
}

// viewedDateManager backs VIEW history - the scene being surfaced to the user (page
// opened, card dwelled on, marked viewed by hand). It is a separate table from
// viewDateManager in history.go, which despite its name backs PLAY history and is driven by the
// player. Nothing here touches play_duration.
type viewedDateManager struct {
	tableMgr *viewHistoryTable
}

func (qb *viewedDateManager) GetViewedDates(ctx context.Context, id int) ([]time.Time, error) {
	return qb.tableMgr.getDates(ctx, id)
}

func (qb *viewedDateManager) GetManyViewedDates(ctx context.Context, ids []int) ([][]time.Time, error) {
	return qb.tableMgr.getManyDates(ctx, ids)
}

func (qb *viewedDateManager) CountViewed(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.getCount(ctx, id)
}

func (qb *viewedDateManager) GetManyViewedCount(ctx context.Context, ids []int) ([]int, error) {
	return qb.tableMgr.getManyCount(ctx, ids)
}

func (qb *viewedDateManager) CountAllViewed(ctx context.Context) (int, error) {
	return qb.tableMgr.getAllCount(ctx)
}

func (qb *viewedDateManager) CountUniqueViewed(ctx context.Context) (int, error) {
	return qb.tableMgr.getUniqueCount(ctx)
}

func (qb *viewedDateManager) LastViewed(ctx context.Context, id int) (*time.Time, error) {
	return qb.tableMgr.getLastDate(ctx, id)
}

func (qb *viewedDateManager) GetManyLastViewedAt(ctx context.Context, ids []int) ([]*time.Time, error) {
	return qb.tableMgr.getManyLastDate(ctx, ids)
}

func (qb *viewedDateManager) AddViewed(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.addDates(ctx, id, dates)
}

func (qb *viewedDateManager) DeleteViewed(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.deleteDates(ctx, id, dates)
}

func (qb *viewedDateManager) DeleteAllViewed(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.deleteAllDates(ctx, id)
}
