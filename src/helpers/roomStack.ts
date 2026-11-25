// Geometry and gesture rules for the mobile room stage: one room at a time in a
// fixed place; a swipe, wheel or the arrow swaps it for the next room in place.

export const STACK_GAP = 12;
// Space kept below the card for the "more below" arrow: the arrow sits in the
// middle of it, with the same distance to the card and to the footer.
export const STACK_CUE_SPACE = 38;
// Below this the card would be unusable; it then takes the space under the
// sticky heading instead (seen whole once the logo scrolls away).
export const STAGE_MIN_HEIGHT = 260;
// Finger travel needed to change room, so taps and small drags do nothing.
export const SWIPE_THRESHOLD = 40;

// Stage height: from where the stage sits at page load (below the logo) down
// to the arrow space, or the space under the sticky heading on tiny screens.
export function roomStageHeight(stageTopAtLoad: number, viewportBottom: number, underHeading: number): number {
  const fit = viewportBottom - STACK_CUE_SPACE - stageTopAtLoad;
  return Math.round(fit >= STAGE_MIN_HEIGHT ? fit : Math.max(STAGE_MIN_HEIGHT, underHeading - STACK_GAP - STACK_CUE_SPACE));
}

// Vertical centre of the arrow: halfway between the bottom of the card and the
// top of the footer content, so both gaps are equal.
export function roomStackCueCentre(cardBottom: number, footerContentTop: number): number {
  return (cardBottom + footerContentTop) / 2;
}

// Which room a gesture leads to, or undefined to leave it to the normal page
// scroll. `delta` > 0 means moving forward (finger/wheel up). The stage must
// be fully in view; past the last room the page simply keeps scrolling.
export function roomStageTarget(active: number, count: number, delta: number, stageInView: boolean): number | undefined {
  if (!stageInView || delta === 0) return undefined;
  const next = active + (delta > 0 ? 1 : -1);
  return next >= 0 && next < count ? next : undefined;
}
