import React from "react";
import cx from "classnames";
import { Button, Spinner } from "react-bootstrap";
import { Icon } from "src/components/Shared/Icon";
import { defineMessages, useIntl } from "react-intl";
import { faFire } from "@fortawesome/free-solid-svg-icons";

export interface IGoldenButtonProps {
  loading: boolean;
  golden: boolean;
  onClick: () => void;
}

export const GoldenButton: React.FC<IGoldenButtonProps> = (
  props: IGoldenButtonProps
) => {
  const intl = useIntl();
  const messages = defineMessages({
    golden: {
      id: "golden",
      defaultMessage: "Golden",
    },
  });

  if (props.loading) return <Spinner animation="border" role="status" />;

  return (
    <Button
      variant="secondary"
      title={intl.formatMessage(messages.golden)}
      className={cx(
        "minimal",
        "golden-button",
        props.golden ? "golden" : "not-golden"
      )}
      onClick={props.onClick}
    >
      <Icon icon={faFire} />
    </Button>
  );
};
