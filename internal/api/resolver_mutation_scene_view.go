package api

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/sliceutil"
	"github.com/stashapp/stash/pkg/sliceutil/stringslice"
)

// View history is recorded independently of play history and never touches
// play_duration or resume_time.
func (r *mutationResolver) SceneAddView(ctx context.Context, id string, t []*time.Time) (*HistoryMutationResult, error) {
	sceneID, err := strconv.Atoi(id)
	if err != nil {
		return nil, fmt.Errorf("converting id: %w", err)
	}

	var times []time.Time

	// convert time to local time, so that sorting is consistent
	for _, tt := range t {
		times = append(times, tt.Local())
	}

	var updatedTimes []time.Time

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Scene

		updatedTimes, err = qb.AddViewed(ctx, sceneID, times)
		return err
	}); err != nil {
		return nil, err
	}

	return &HistoryMutationResult{
		Count:   len(updatedTimes),
		History: sliceutil.ValuesToPtrs(updatedTimes),
	}, nil
}

func (r *mutationResolver) SceneDeleteView(ctx context.Context, id string, t []*time.Time) (*HistoryMutationResult, error) {
	sceneID, err := strconv.Atoi(id)
	if err != nil {
		return nil, err
	}

	var times []time.Time

	for _, tt := range t {
		times = append(times, *tt)
	}

	var updatedTimes []time.Time

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Scene

		updatedTimes, err = qb.DeleteViewed(ctx, sceneID, times)
		return err
	}); err != nil {
		return nil, err
	}

	return &HistoryMutationResult{
		Count:   len(updatedTimes),
		History: sliceutil.ValuesToPtrs(updatedTimes),
	}, nil
}

func (r *mutationResolver) SceneResetViewCount(ctx context.Context, id string) (ret int, err error) {
	sceneID, err := strconv.Atoi(id)
	if err != nil {
		return 0, err
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Scene

		ret, err = qb.DeleteAllViewed(ctx, sceneID)
		return err
	}); err != nil {
		return 0, err
	}

	return ret, nil
}

// Marks a page of scenes viewed in one go: one view each, all at the same
// moment, in a single transaction. Returns the scenes so the client's cache
// picks up their new view_count and last_viewed_at without a refetch.
func (r *mutationResolver) ScenesAddView(ctx context.Context, ids []string) ([]*models.Scene, error) {
	sceneIDs, err := stringslice.StringSliceToIntSlice(ids)
	if err != nil {
		return nil, fmt.Errorf("converting ids: %w", err)
	}

	now := []time.Time{time.Now()}

	var ret []*models.Scene

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		qb := r.repository.Scene

		for _, id := range sceneIDs {
			if _, err := qb.AddViewed(ctx, id, now); err != nil {
				return err
			}
		}

		ret, err = qb.FindMany(ctx, sceneIDs)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}
