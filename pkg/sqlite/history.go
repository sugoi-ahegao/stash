package sqlite

import (
	"context"
	"time"
)

type viewDateManager struct {
	tableMgr *viewHistoryTable
}

func (qb *viewDateManager) GetViewDates(ctx context.Context, id int) ([]time.Time, error) {
	return qb.tableMgr.getDates(ctx, id)
}

func (qb *viewDateManager) GetManyViewDates(ctx context.Context, ids []int) ([][]time.Time, error) {
	return qb.tableMgr.getManyDates(ctx, ids)
}

func (qb *viewDateManager) CountViews(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.getCount(ctx, id)
}

func (qb *viewDateManager) GetManyViewCount(ctx context.Context, ids []int) ([]int, error) {
	return qb.tableMgr.getManyCount(ctx, ids)
}

func (qb *viewDateManager) CountAllViews(ctx context.Context) (int, error) {
	return qb.tableMgr.getAllCount(ctx)
}

func (qb *viewDateManager) CountUniqueViews(ctx context.Context) (int, error) {
	return qb.tableMgr.getUniqueCount(ctx)
}

func (qb *viewDateManager) LastView(ctx context.Context, id int) (*time.Time, error) {
	return qb.tableMgr.getLastDate(ctx, id)
}

func (qb *viewDateManager) GetManyLastViewed(ctx context.Context, ids []int) ([]*time.Time, error) {
	return qb.tableMgr.getManyLastDate(ctx, ids)

}

func (qb *viewDateManager) AddViews(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.addDates(ctx, id, dates)
}

func (qb *viewDateManager) DeleteViews(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.deleteDates(ctx, id, dates)
}

func (qb *viewDateManager) DeleteAllViews(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.deleteAllDates(ctx, id)
}

// viewedDateManager backs VIEW history - the scene being surfaced to the user (page
// opened, card dwelled on, marked viewed by hand). It is a separate table from
// viewDateManager above, which despite its name backs PLAY history and is driven by the
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

type oDateManager struct {
	tableMgr *viewHistoryTable
}

func (qb *oDateManager) GetODates(ctx context.Context, id int) ([]time.Time, error) {
	return qb.tableMgr.getDates(ctx, id)
}

func (qb *oDateManager) GetManyODates(ctx context.Context, ids []int) ([][]time.Time, error) {
	return qb.tableMgr.getManyDates(ctx, ids)
}

func (qb *oDateManager) GetOCount(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.getCount(ctx, id)
}

func (qb *oDateManager) GetManyOCount(ctx context.Context, ids []int) ([]int, error) {
	return qb.tableMgr.getManyCount(ctx, ids)
}

func (qb *oDateManager) GetAllOCount(ctx context.Context) (int, error) {
	return qb.tableMgr.getAllCount(ctx)
}

func (qb *oDateManager) GetUniqueOCount(ctx context.Context) (int, error) {
	return qb.tableMgr.getUniqueCount(ctx)
}

func (qb *oDateManager) AddO(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.addDates(ctx, id, dates)
}

func (qb *oDateManager) DeleteO(ctx context.Context, id int, dates []time.Time) ([]time.Time, error) {
	return qb.tableMgr.deleteDates(ctx, id, dates)
}

func (qb *oDateManager) ResetO(ctx context.Context, id int) (int, error) {
	return qb.tableMgr.deleteAllDates(ctx, id)
}
