import { faCircleUp } from "@fortawesome/free-solid-svg-icons";
import React, { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import * as GQL from "src/core/generated-graphql";
import { Icon } from "./Shared/Icon";

// The navbar's notice that a newer stash release is out. The check goes to GitHub, whose
// anonymous limit is 60 requests an hour, so the answer is kept for a while. It's kept per
// build, so shipping a sync clears the notice straight away.
const STORAGE_KEY = "fork.updateCheck";
const CHECK_EVERY = 6 * 60 * 60 * 1000;

interface IUpdateCheck {
  build: string;
  checkedAt: number;
  newVersion: string | null;
}

const thisBuild = import.meta.env.VITE_APP_STASH_VERSION ?? "";

function readCheck(): IUpdateCheck | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;
    const check: IUpdateCheck = JSON.parse(stored);
    const fresh = Date.now() - check.checkedAt < CHECK_EVERY;
    return check.build === thisBuild && fresh ? check : undefined;
  } catch {
    return undefined;
  }
}

function writeCheck(check: IUpdateCheck) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(check));
  } catch {
    // only costs an extra check next time
  }
}

export const UpdateBadge: React.FC = () => {
  const [stored] = useState(readCheck);
  const { data } = GQL.useLatestVersionQuery({
    skip: stored !== undefined,
    errorPolicy: "ignore",
  });

  const latest = data?.latestversion;
  useEffect(() => {
    if (!latest) return;
    writeCheck({
      build: thisBuild,
      checkedAt: Date.now(),
      newVersion: latest.update_available ? latest.version : null,
    });
  }, [latest]);

  const newVersion =
    stored?.newVersion ?? (latest?.update_available ? latest.version : null);
  if (!newVersion) return null;

  const title = `Stash ${newVersion} is available`;
  return (
    <Link to="/settings?tab=about" className="update-badge" title={title}>
      <Button className="minimal d-flex align-items-center h-100" title={title}>
        <Icon icon={faCircleUp} color="#48aff0" />
      </Button>
    </Link>
  );
};
