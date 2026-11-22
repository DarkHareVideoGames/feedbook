// Separate thresholds keep small scroll reversals from flickering the details.
export function roomJourneyPhase(
  direction: number,
  coverTop: number,
  coverBottom: number,
  viewportTop: number,
  viewportHeight: number,
  scrollTop: number,
): boolean | undefined {
  // The first card may never reach the geometric threshold on tall screens.
  if (direction < 0 && scrollTop <= 1) return false;
  if (direction < 0 && coverTop > viewportTop + viewportHeight * 0.32) return false;
  if (direction > 0 && coverTop < viewportTop + viewportHeight * 0.25
    && coverBottom < viewportTop + viewportHeight - 36) return true;
  return undefined;
}