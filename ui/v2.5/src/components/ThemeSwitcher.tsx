import React, { useState } from "react";
import { Dropdown } from "react-bootstrap";
import { useIntl } from "react-intl";
import { faCheck, faPalette } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "src/components/Shared/Icon";
import {
  applyTheme,
  getStoredTheme,
  storeTheme,
  themes,
} from "src/utils/theme";

export const ThemeSwitcher: React.FC = () => {
  const intl = useIntl();
  const [current, setCurrent] = useState(getStoredTheme);

  function select(id: string) {
    applyTheme(id);
    storeTheme(id);
    setCurrent(id);
  }

  return (
    <Dropdown className="nav-utility theme-switcher" alignRight>
      <Dropdown.Toggle
        variant="minimal"
        className="minimal d-flex align-items-center h-100"
        title={intl.formatMessage({ id: "theme" })}
      >
        <Icon icon={faPalette} />
      </Dropdown.Toggle>
      <Dropdown.Menu className="bg-secondary">
        {themes.map((t) => (
          <Dropdown.Item
            key={t.id}
            className="bg-secondary text-white"
            active={t.id === current}
            onClick={() => select(t.id)}
          >
            <Icon
              icon={faCheck}
              className={t.id === current ? "mr-2" : "mr-2 invisible"}
            />
            {t.name}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
};
