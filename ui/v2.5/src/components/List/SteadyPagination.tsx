// fork: the scene list's pagers, always there (steady-pagination.scss).
// Upstream's Pagination renders nothing for one page and "1 2 3" buttons for
// two or three, so the cards below it jump as the result count changes. This
// one is always « < N of M > », its buttons disabled when there's nowhere to
// go: "1 of 1" for one page, "0 of 0" for no results. While the very first
// results load it keeps its room but stays hidden, rather than flash "0 of 0".
import React from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import { Placement } from "react-bootstrap/esm/Overlay";
import { useIntl } from "react-intl";
import cx from "classnames";
import { PageCount } from "./Pagination";

export const SteadyPagination: React.FC<{
  itemsPerPage: number;
  currentPage: number;
  totalItems: number;
  loading: boolean;
  onChangePage: (page: number) => void;
  pagePopupPlacement?: Placement;
}> = ({
  itemsPerPage,
  currentPage,
  totalItems,
  loading,
  onChangePage,
  pagePopupPlacement,
}) => {
  const intl = useIntl();
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const page = totalPages === 0 ? 0 : currentPage;
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <ButtonGroup
      className={cx("pagination", "steady-pagination", {
        invisible: loading && totalItems === 0,
      })}
    >
      <Button
        variant="secondary"
        disabled={atStart}
        onClick={() => onChangePage(1)}
        title={intl.formatMessage({ id: "pagination.first" })}
      >
        <span>«</span>
      </Button>
      <Button
        variant="secondary"
        disabled={atStart}
        onClick={() => onChangePage(page - 1)}
        title={intl.formatMessage({ id: "pagination.previous" })}
      >
        &lt;
      </Button>
      {/* one page or none: nothing to pick, so the count is disabled too */}
      <fieldset className="steady-pagination-count" disabled={totalPages <= 1}>
        <PageCount
          totalPages={totalPages}
          currentPage={page}
          onChangePage={onChangePage}
          pagePopupPlacement={pagePopupPlacement}
        />
      </fieldset>
      <Button
        variant="secondary"
        disabled={atEnd}
        onClick={() => onChangePage(page + 1)}
        title={intl.formatMessage({ id: "pagination.next" })}
      >
        &gt;
      </Button>
      <Button
        variant="secondary"
        disabled={atEnd}
        onClick={() => onChangePage(totalPages)}
        title={intl.formatMessage({ id: "pagination.last" })}
      >
        <span>»</span>
      </Button>
    </ButtonGroup>
  );
};
