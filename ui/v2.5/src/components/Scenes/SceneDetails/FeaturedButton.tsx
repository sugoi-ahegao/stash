import React from "react";
import cx from "classnames";
import { Button, Spinner } from "react-bootstrap";
import { Icon } from "src/components/Shared/Icon";
import { defineMessages, useIntl } from "react-intl";
import { faCrown } from "@fortawesome/free-solid-svg-icons";

export interface IFeaturedButtonProps {
  loading: boolean;
  featured: boolean;
  onClick: () => void;
}

export const FeaturedButton: React.FC<IFeaturedButtonProps> = (
  props: IFeaturedButtonProps
) => {
  const intl = useIntl();
  const messages = defineMessages({
    featured: {
      id: "featured",
      defaultMessage: "Featured",
    },
  });

  if (props.loading) return <Spinner animation="border" role="status" />;

  return (
    <Button
      variant="secondary"
      title={intl.formatMessage(messages.featured)}
      className={cx(
        "minimal",
        "featured-button",
        props.featured ? "featured" : "not-featured"
      )}
      onClick={props.onClick}
    >
      <Icon icon={faCrown} />
    </Button>
  );
};
