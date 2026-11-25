// Geometry for the mobile "deck" of room cards: each card sticks below the
// heading and the next one slides over it.

export const STACK_PEEK = 10;
export const STACK_GAP = 12;

// Where a card sticks. Short cards stick near the top, stepped by `index` so
// earlier cards peek out behind. Cards taller than the viewport stick by their
// bottom edge instead, so their whole content scrolls into view first.
export function roomStackTop(index: number, headingOffset: number, viewportHeight: number, cardHeight: number): number {
  const deckTop = headingOffset + STACK_GAP + index * STACK_PEEK;
  return Math.min(deckTop, viewportHeight - cardHeight - STACK_GAP);
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
