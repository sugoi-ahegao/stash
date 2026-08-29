import React from "react";
import { Helmet } from "react-helmet";
import { useTitleProps } from "src/hooks/title";
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
      <SceneList view={View.Landing} />
    </div>
  );
};

export default Landing;
