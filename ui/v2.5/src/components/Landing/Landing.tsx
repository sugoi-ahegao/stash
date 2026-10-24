import React from "react";
import { Helmet } from "react-helmet";
import { useTitleProps } from "src/hooks/title";
import { DisplayMode } from "src/models/list-filter/types";
import { lazyComponent } from "src/utils/lazyComponent";
import { View } from "../List/views";
import { FeaturedCarousel } from "./FeaturedCarousel";
import { ViewOnHover } from "../Scenes/sceneViews";

const SceneList = lazyComponent(() => import("../Scenes/SceneList"));

const Landing: React.FC = () => {
  const titleProps = useTitleProps("Landing");
  return (
    <div id="landing-page">
      <Helmet {...titleProps} />
      <FeaturedCarousel />
      {/* the landing list opens in Collections; the view remembers any other choice */}
      <ViewOnHover page="landing">
        <SceneList
          view={View.Landing}
          defaultDisplayMode={DisplayMode.Collections}
        />
      </ViewOnHover>
    </div>
  );
};

export default Landing;
