// Dwelling on a scene card records a view, the same as opening the scene page
// does. Only the landing page does this - browsing the scenes list is meant to
// stay free of consequence.
//
// A view is not a play: it never touches play count, play duration or resume
// time. See docs/decisions/0004-views-apart-from-plays.md.
//
// How long the cursor has to stay on the card before the view is recorded.
// Long enough that sweeping the cursor across the grid on the way somewhere
// else doesn't rack up views.
export const hoverViewDelay = 3000;
