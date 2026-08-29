import React from "react";
import Slider from "@ant-design/react-slick";
import { Link } from "react-router-dom";
import * as GQL from "src/core/generated-graphql";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { objectTitle } from "src/core/files";

const FEATURED_COUNT = 10;

export const FeaturedCarousel: React.FC = () => {
  const { data, loading } = GQL.useFindScenesQuery({
    variables: {
      filter: {
        sort: "rating",
        direction: GQL.SortDirectionEnum.Desc,
        per_page: FEATURED_COUNT,
      },
    },
  });

  const scenes = data?.findScenes.scenes ?? [];

  if (loading) {
    return <LoadingIndicator />;
  }

  if (!scenes.length) {
    return null;
  }

  return (
    <div className="featured-carousel">
      <Slider
        dots
        arrows
        infinite
        autoplay
        autoplaySpeed={6000}
        speed={600}
        fade
        pauseOnHover
        slidesToShow={1}
        slidesToScroll={1}
      >
        {scenes.map((scene) => (
          // react-slick clones this outer element and injects its own
          // width/display inline styles onto it - nest the real slide
          // markup one level deeper so those styles don't clobber ours.
          <div key={scene.id}>
            <div className="featured-slide">
              <Link to={`/scenes/${scene.id}`} className="featured-slide-link">
                <div
                  className="featured-slide-image"
                  style={
                    scene.paths.screenshot
                      ? { backgroundImage: `url(${scene.paths.screenshot})` }
                      : undefined
                  }
                />
                <div className="featured-slide-overlay" />
                <div className="featured-slide-info">
                  {scene.studio && (
                    <div className="featured-slide-studio">
                      {scene.studio.name}
                    </div>
                  )}
                  <h2 className="featured-slide-title">
                    {objectTitle(scene)}
                  </h2>
                  {scene.date && (
                    <div className="featured-slide-date">{scene.date}</div>
                  )}
                </div>
              </Link>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
};
