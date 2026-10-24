import React, { useState } from "react";
import cx from "classnames";
import { Button, Spinner } from "react-bootstrap";
import { Icon } from "src/components/Shared/Icon";
import { defineMessages, useIntl } from "react-intl";
import { faFire } from "@fortawesome/free-solid-svg-icons";
import * as GQL from "src/core/generated-graphql";
import { useSceneUpdate } from "src/core/StashService";
import { useForkConfig } from "src/core/forkConfig";
import { isGolden, withGolden } from "src/core/golden";
import { useToast } from "src/hooks/Toast";

// Toggles the golden tag on the scene page. Hidden while no golden tag is set.
export const GoldenButton: React.FC<{ scene: GQL.SceneDataFragment }> = ({
  scene,
}) => {
  const intl = useIntl();
  const Toast = useToast();
  const { goldenTagId } = useForkConfig();
  const [updateScene] = useSceneUpdate();
  const [loading, setLoading] = useState(false);

  const messages = defineMessages({
    golden: {
      id: "golden",
      defaultMessage: "Golden",
    },
  });

  if (!goldenTagId) return null;
  if (loading) return <Spinner animation="border" role="status" />;

  const golden = isGolden(scene, goldenTagId);

  async function onClick() {
    if (!goldenTagId) return;

    try {
      setLoading(true);
      await updateScene({
        variables: {
          input: {
            id: scene.id,
            tag_ids: withGolden(scene, !golden, goldenTagId),
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
      title={intl.formatMessage(messages.golden)}
      className={cx(
        "minimal",
        "golden-button",
        golden ? "golden" : "not-golden"
      )}
      onClick={onClick}
    >
      <Icon icon={faFire} />
    </Button>
  );
};
