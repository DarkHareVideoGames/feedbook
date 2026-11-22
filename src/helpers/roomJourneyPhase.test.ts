import { describe, expect, it } from 'vitest';
import { roomJourneyPhase } from './roomJourneyPhase';

describe('reversible room journey', () => {
  it('opens when scrolling past the card', () => {
    expect(roomJourneyPhase(10, 180, 650, 0, 800)).toBe(true);
  });
  it('collapses when returning above the card', () => {
    expect(roomJourneyPhase(-10, 400, 850, 0, 800)).toBe(false);
  });
  it('preserves the phase within the gap between thresholds', () => {
    expect(roomJourneyPhase(-1, 230, 700, 0, 800)).toBeUndefined();
    expect(roomJourneyPhase(1, 230, 700, 0, 800)).toBeUndefined();
  });
  it('does not collapse while reading long details or on resize', () => {
    expect(roomJourneyPhase(-10, -900, -450, 0, 800)).toBeUndefined();
    expect(roomJourneyPhase(0, 400, 850, 0, 800)).toBeUndefined();
  });
  it('uses the scroll container offset and waits until the card fits', () => {
    expect(roomJourneyPhase(-10, 500, 950, 100, 800)).toBe(false);
    expect(roomJourneyPhase(10, 200, 790, 0, 800)).toBeUndefined();
  });
});