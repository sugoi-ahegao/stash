-- View history: a record of the scene being *surfaced* to the user - opening its page,
-- dwelling on its card, or marking it viewed by hand.
--
-- This is deliberately separate from play history, which lives in `scenes_view_dates`
-- despite the name and is driven by the player. Nothing here touches `play_duration`.
CREATE TABLE `scenes_viewed_dates` (
  `scene_id` integer not null,
  `viewed_date` datetime not null,
  foreign key(`scene_id`) references `scenes`(`id`) on delete CASCADE
);

-- Seed view history from the existing play history, so an upgrading library starts with
-- a view record for everything it had already played rather than an empty slate. The two
-- are fully independent from this point on: nothing copies between them again.
INSERT INTO `scenes_viewed_dates` (`scene_id`, `viewed_date`)
  SELECT `scene_id`, `view_date` FROM `scenes_view_dates`;

-- created after the bulk insert so the seed does not pay to maintain it row by row
CREATE INDEX `index_scenes_viewed_dates` ON `scenes_viewed_dates` (`scene_id`);
