package api

// fork: the view history fields of Scene. A view is the scene being surfaced to
// the user, apart from plays. See docs/decisions/0004-views-apart-from-plays.md.

import (
	"context"
	"time"

	"github.com/stashapp/stash/internal/api/loaders"
	"github.com/stashapp/stash/pkg/models"
)

func (r *sceneResolver) LastViewedAt(ctx context.Context, obj *models.Scene) (*time.Time, error) {
	ret, err := loaders.From(ctx).SceneLastViewed.Load(obj.ID)
	if err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *sceneResolver) ViewCount(ctx context.Context, obj *models.Scene) (*int, error) {
	ret, err := loaders.From(ctx).SceneViewCount.Load(obj.ID)
	if err != nil {
		return nil, err
	}

	return &ret, nil
}

func (r *sceneResolver) ViewHistory(ctx context.Context, obj *models.Scene) ([]*time.Time, error) {
	ret, err := loaders.From(ctx).SceneViewHistory.Load(obj.ID)
	if err != nil {
		return nil, err
	}

	// convert to pointer slice
	ptrRet := make([]*time.Time, len(ret))
	for i, t := range ret {
		tt := t
		ptrRet[i] = &tt
	}

	return ptrRet, nil
}
