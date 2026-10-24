package api

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/stashapp/stash/pkg/sliceutil"
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
