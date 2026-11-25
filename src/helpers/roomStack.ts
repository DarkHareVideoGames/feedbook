// Geometry for the mobile deck of room cards: one card at a time fills the
// screen below the heading, and the next card slides over it.

export const STACK_GAP = 12;
export const STACK_MIN_PHOTO = 180;

// Height left for a card between the sticky heading and the bottom of the screen.
export function roomStackAvailable(headingOffset: number, viewportHeight: number): number {
  return Math.max(0, viewportHeight - headingOffset - STACK_GAP * 2);
}

// Where a card sticks. A card that fits sticks right below the heading. A card
// taller than the screen (details open) sticks by its bottom edge instead, so
// all of its content scrolls into view before the next card covers it.
export function roomStackTop(headingOffset: number, viewportHeight: number, cardHeight: number): number {
  return Math.min(headingOffset + STACK_GAP, viewportHeight - cardHeight - STACK_GAP);
}

// Photo height that makes the collapsed card fill the available area. `rest`
// is everything in the card except the photo and the details.
export function roomStackPhotoHeight(available: number, rest: number): number {
  return Math.max(STACK_MIN_PHOTO, Math.round(available - rest));
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
