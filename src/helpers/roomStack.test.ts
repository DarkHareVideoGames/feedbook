import { describe, expect, it } from 'vitest';
import { roomStackCueCentre, roomStageHeight, roomStageTarget } from './roomStack';

describe('room stage geometry', () => {
  it('fits the stage between its place at page load and the arrow space', () => {
    expect(roomStageHeight(235, 794, 600)).toBe(794 - 38 - 235);
  });

  it('falls back to the space under the heading on very small screens', () => {
    expect(roomStageHeight(400, 590, 500)).toBe(500 - 12 - 38);
    expect(roomStageHeight(400, 590, 200)).toBe(260);
  });

  it('centres the arrow between the card and the footer', () => {
    // Card ends at 762, footer content starts at 806 → centre 784 (22px each side).
    expect(roomStackCueCentre(762, 806)).toBe(784);
  });
});

describe('room stage gestures', () => {
  it('moves one room forward or back while the stage is in view', () => {
    expect(roomStageTarget(0, 4, 1, true)).toBe(1);
    expect(roomStageTarget(2, 4, -1, true)).toBe(1);
  });

  it('leaves the gesture to the page past the ends or when the stage is not in view', () => {
    expect(roomStageTarget(3, 4, 1, true)).toBeUndefined();
    expect(roomStageTarget(0, 4, -1, true)).toBeUndefined();
    expect(roomStageTarget(1, 4, 1, false)).toBeUndefined();
    expect(roomStageTarget(1, 4, 0, true)).toBeUndefined();
  });
});
