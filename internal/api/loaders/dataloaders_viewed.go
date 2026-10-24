// fork: the loaders behind view history (Scene.view_count, view_history,
// last_viewed_at). Kept out of dataloaders.go, which is upstream's; that file
// only gains the three Loaders fields and their construction.
// See docs/decisions/0004-views-apart-from-plays.md.

//go:generate go run github.com/vektah/dataloaden SceneViewCountLoader int int
//go:generate go run github.com/vektah/dataloaden SceneViewHistoryLoader int []time.Time
//go:generate go run github.com/vektah/dataloaden SceneLastViewedLoader int *time.Time

package loaders

import (
	"context"
	"time"
)

func (m Middleware) fetchScenesViewCount(ctx context.Context) func(keys []int) ([]int, []error) {
	return func(keys []int) (ret []int, errs []error) {
		err := m.Repository.WithDB(ctx, func(ctx context.Context) error {
			var err error
			ret, err = m.Repository.Scene.GetManyViewedCount(ctx, keys)
			return err
		})
		return ret, toErrorSlice(err)
	}
}

func (m Middleware) fetchScenesViewHistory(ctx context.Context) func(keys []int) ([][]time.Time, []error) {
	return func(keys []int) (ret [][]time.Time, errs []error) {
		err := m.Repository.WithDB(ctx, func(ctx context.Context) error {
			var err error
			ret, err = m.Repository.Scene.GetManyViewedDates(ctx, keys)
			return err
		})
		return ret, toErrorSlice(err)
	}
}

func (m Middleware) fetchScenesLastViewed(ctx context.Context) func(keys []int) ([]*time.Time, []error) {
	return func(keys []int) (ret []*time.Time, errs []error) {
		err := m.Repository.WithDB(ctx, func(ctx context.Context) error {
			var err error
			ret, err = m.Repository.Scene.GetManyLastViewedAt(ctx, keys)
			return err
		})
		return ret, toErrorSlice(err)
	}
}
