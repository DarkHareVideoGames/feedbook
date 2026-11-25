// Geometry for the mobile deck of room cards: one card at a time fills the
// screen below the heading, and the next card slides over it.

export const STACK_GAP = 12;
// Space kept below each card for the "more below" arrow: the arrow sits in the
// middle of it, with the same distance to the card and to the footer.
export const STACK_CUE_SPACE = 38;
// Below this, a first card squeezed under the logo would be unusable; it then
// takes the full height straight away.
export const STACK_MIN_FIRST = 300;

// Height left for a card between the sticky heading and the bottom of the screen.
export function roomStackAvailable(headingOffset: number, viewportHeight: number): number {
  return Math.max(0, viewportHeight - headingOffset - STACK_GAP - STACK_CUE_SPACE);
}

// Where a card sticks. A card that fits sticks right below the heading. A card
// taller than the screen (details open) sticks by its bottom edge instead, so
// all of its content scrolls into view before the next card covers it.
export function roomStackTop(headingOffset: number, viewportHeight: number, cardHeight: number): number {
  return Math.min(headingOffset + STACK_GAP, viewportHeight - cardHeight - STACK_CUE_SPACE);
}

// Card height. Every card fills the space under the heading; the first one is
// capped by the space left below the logo at page load (`firstSpace`), so it
// is whole there too. Constant while scrolling, so photos never resize.
export function roomStackHeight(available: number, firstSpace?: number): number {
  if (firstSpace === undefined) return Math.round(available);
  const fit = firstSpace - STACK_CUE_SPACE;
  return Math.round(fit >= STACK_MIN_FIRST ? Math.min(available, fit) : available);
}

// Vertical centre of the arrow: halfway between the bottom of the cards and
// the top of the footer content, so both gaps are equal.
export function roomStackCueCentre(viewportBottom: number, footerContentTop: number): number {
  return (viewportBottom - STACK_CUE_SPACE + footerContentTop) / 2;
}

// How much of the card's visible area the next card already covers (0..1).
export function roomStackProgress(cardTop: number, cardBottom: number, nextTop: number | undefined, viewportTop: number, viewportBottom: number): number {
  if (nextTop === undefined || cardTop >= viewportBottom) return 0;
  const visibleTop = Math.max(cardTop, viewportTop);
  const visibleBottom = Math.min(cardBottom, viewportBottom);
  const visible = visibleBottom - visibleTop;
  if (visible <= 0) return 1;
  return Math.min(1, Math.max(0, (visibleBottom - nextTop) / visible));
}
