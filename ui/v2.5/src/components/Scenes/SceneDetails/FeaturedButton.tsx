import React, { useState } from "react";
import cx from "classnames";
import { Button, Spinner } from "react-bootstrap";
import { Icon } from "src/components/Shared/Icon";
import { defineMessages, useIntl } from "react-intl";
import { faCrown } from "@fortawesome/free-solid-svg-icons";
import * as GQL from "src/core/generated-graphql";
import { useSceneUpdate } from "src/core/StashService";
import { useForkConfig } from "src/core/forkConfig";
import { isFeatured, withFeatured } from "src/core/featured";
import { useToast } from "src/hooks/Toast";

// Adds the scene to the featured group, or takes it out, on the scene page.
// Hidden while no featured group is set.
//
// It's a plain scene update: the server sees the scene join the group, stamps
// featured_added_at and queues generation (internal/api/scene_featured.go).
export const FeaturedButton: React.FC<{ scene: GQL.SceneDataFragment }> = ({
  scene,
}) => {
  const intl = useIntl();
  const Toast = useToast();
  const { featuredGroupId } = useForkConfig();
  const [updateScene] = useSceneUpdate();
  const [loading, setLoading] = useState(false);

  const messages = defineMessages({
    featured: {
      id: "featured",
      defaultMessage: "Featured",
    },
  });

  if (!featuredGroupId) return null;
  if (loading) return <Spinner animation="border" role="status" />;

  const featured = isFeatured(scene, featuredGroupId);

  async function onClick() {
    if (!featuredGroupId) return;

    try {
      setLoading(true);
      await updateScene({
        variables: {
          input: {
            id: scene.id,
            groups: withFeatured(scene, !featured, featuredGroupId),
          },
        },
      });
    } catch (e) {
      Toast.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      title={intl.formatMessage(messages.featured)}
      className={cx(
        "minimal",
        "featured-button",
        featured ? "featured" : "not-featured"
      )}
      onClick={onClick}
    >
      <Icon icon={faCrown} />
    </Button>
  );
};
