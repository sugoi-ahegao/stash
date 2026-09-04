package api

import (
	"context"
	"strconv"
	"time"

	"github.com/stashapp/stash/internal/manager"
	"github.com/stashapp/stash/pkg/logger"
	"github.com/stashapp/stash/pkg/models"
)

// The featured group drives the landing page carousel. These are kept in sync
// with ui/v2.5/src/components/Landing/featuredGroup.ts - there's no config
// setting to choose the featured group yet.
const featuredGroupID = 25

const (
	// stamped on a scene when it's added to the featured group, so the
	// carousel can see when that happened.
	featuredAddedAtField = "featured_added_at"
	// stamped on a scene when its carousel slide is unlocked. Cleared along
	// with featuredAddedAtField when the scene leaves the group.
	featureUnlockedAtField = "feature_unlocked_at"
)

// sceneIsFeatured returns true if the scene is in the featured group.
func sceneIsFeatured(ctx context.Context, l models.SceneGroupLoader, sceneID int) (bool, error) {
	groups, err := l.GetGroups(ctx, sceneID)
	if err != nil {
		return false, err
	}

	for _, g := range groups {
		if g.GroupID == featuredGroupID {
			return true, nil
		}
	}

	return false, nil
}

// applyFeaturedChange stamps or clears the featured custom fields for a scene
// whose featured group membership may have changed during an update. wasFeatured
// is the membership as read before the update. It returns true if the scene was
// newly added to the featured group, in which case generated content should be
// created for it.
//
// Must be called after any custom fields from the update input have been
// applied, so that a full replacement doesn't wipe the stamp.
func (r *mutationResolver) applyFeaturedChange(ctx context.Context, sceneID int, wasFeatured bool) (bool, error) {
	qb := r.repository.Scene

	isFeatured, err := sceneIsFeatured(ctx, qb, sceneID)
	if err != nil {
		return false, err
	}

	if isFeatured == wasFeatured {
		return false, nil
	}

	var fields models.CustomFieldsInput
	if isFeatured {
		fields.Partial = map[string]interface{}{
			featuredAddedAtField: time.Now().UTC().Format(time.RFC3339),
		}
	} else {
		fields.Remove = []string{featuredAddedAtField, featureUnlockedAtField}
	}

	if err := qb.SetCustomFields(ctx, sceneID, fields); err != nil {
		return false, err
	}

	return isFeatured, nil
}

// generateForFeatured queues generation for scenes newly added to the featured
// group. Overwrite is left unset, so existing covers/previews/etc. are kept.
// PreviewOptions is left nil so that the configured preview settings are used -
// passing zeroed segment options produces an empty preview concat list.
// Failures are logged rather than returned - the scene update itself succeeded.
func generateForFeatured(ctx context.Context, sceneIDs []int) {
	if len(sceneIDs) == 0 {
		return
	}

	ids := make([]string, len(sceneIDs))
	for i, id := range sceneIDs {
		ids[i] = strconv.Itoa(id)
	}

	if _, err := manager.GetInstance().Generate(ctx, manager.GenerateMetadataInput{
		SceneIDs: ids,
		Covers:   true,
		Sprites:  true,
		Previews: true,
		Markers:  true,
		Phashes:  true,
	}); err != nil {
		logger.Errorf("error generating for newly featured scenes: %v", err)
	}
}
