import React from "react";
import { Helmet } from "react-helmet";
import { useTitleProps } from "src/hooks/title";
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
      <ViewOnHover page="landing">
        <SceneList view={View.Landing} />
      </ViewOnHover>
    </div>
  );
};

export default Landing;
