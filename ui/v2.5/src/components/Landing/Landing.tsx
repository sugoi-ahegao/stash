import React from "react";
import { Helmet } from "react-helmet";
import { useTitleProps } from "src/hooks/title";
import { DisplayMode } from "src/models/list-filter/types";
import { lazyComponent } from "src/utils/lazyComponent";
import { View } from "../List/views";
import { FeaturedCarousel } from "./FeaturedCarousel";

const SceneList = lazyComponent(() => import("../Scenes/SceneList"));

const Landing: React.FC = () => {
  const titleProps = useTitleProps("Landing");
  return (
    <div id="landing-page">
      <Helmet {...titleProps} />
      <FeaturedCarousel />
      {/* the landing list opens in Collections; the view remembers any other choice */}
      <SceneList
        view={View.Landing}
        defaultDisplayMode={DisplayMode.Collections}
      />
    </div>
  );
};

export default Landing;
