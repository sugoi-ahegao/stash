import React from "react";
import { useForkConfig } from "src/core/forkConfig";
import { GroupIDSelect } from "src/components/Groups/GroupSelect";
import { TagIDSelect } from "src/components/Tags/TagSelect";
import { BooleanSetting, Setting, StringSetting } from "../Inputs";
import { SettingSection } from "../SettingSection";
import { useSettings } from "../context";

// The fork's settings, stored in the UI config and read through
// src/core/forkConfig.ts: which group, tag and folder its features use, and
// where hovering a scene card records a view.
export const ForkSettings: React.FC = () => {
  const { ui, saveUI } = useSettings();
  const { recordViews } = useForkConfig();

  return (
    <SettingSection
      headingID="config.ui.this_library.heading"
      subHeadingID="config.ui.this_library.description"
    >
      <Setting
        id="featured-group"
        className="fork-select-setting"
        headingID="config.ui.this_library.featured_group.heading"
        subHeadingID="config.ui.this_library.featured_group.description"
      >
        <GroupIDSelect
          isClearable
          ids={ui.featuredGroupId ? [ui.featuredGroupId] : []}
          onSelect={(items) => saveUI({ featuredGroupId: items[0]?.id ?? "" })}
        />
      </Setting>
      <Setting
        id="golden-tag"
        className="fork-select-setting"
        headingID="config.ui.this_library.golden_tag.heading"
        subHeadingID="config.ui.this_library.golden_tag.description"
      >
        <TagIDSelect
          isClearable
          ids={ui.goldenTagId ? [ui.goldenTagId] : []}
          onSelect={(items) => saveUI({ goldenTagId: items[0]?.id ?? "" })}
        />
      </Setting>
      <StringSetting
        id="collections-folder"
        headingID="config.ui.this_library.collections_folder.heading"
        subHeadingID="config.ui.this_library.collections_folder.description"
        value={ui.collectionsFolder ?? undefined}
        onChange={(v) => saveUI({ collectionsFolder: v.trim() })}
      />
      <BooleanSetting
        id="view-on-hover-landing"
        headingID="config.ui.this_library.view_on_hover.landing"
        subHeadingID="config.ui.this_library.view_on_hover.description"
        checked={ui.viewOnHoverLanding ?? true}
        disabled={!recordViews}
        onChange={(v) => saveUI({ viewOnHoverLanding: v })}
      />
      <BooleanSetting
        id="view-on-hover-scenes"
        headingID="config.ui.this_library.view_on_hover.scenes"
        subHeadingID="config.ui.this_library.view_on_hover.description"
        checked={ui.viewOnHoverScenes ?? false}
        disabled={!recordViews}
        onChange={(v) => saveUI({ viewOnHoverScenes: v })}
      />
    </SettingSection>
  );
};
