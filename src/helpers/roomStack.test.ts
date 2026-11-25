import { describe, expect, it } from 'vitest';
import { roomStackAvailable, roomStackHeight, roomStackProgress, roomStackTop } from './roomStack';

describe('room stack geometry', () => {
  it('gives each card the whole area between the heading and the bottom of the screen', () => {
    expect(roomStackAvailable(60, 800)).toBe(800 - 60 - 24);
    expect(roomStackAvailable(900, 800)).toBe(0);
  });

  it('sticks a card that fits right below the sticky heading', () => {
    expect(roomStackTop(60, 800, 716)).toBe(72);
    expect(roomStackTop(60, 800, 500)).toBe(72);
  });

  it('sticks tall cards by their bottom edge so all content stays reachable', () => {
    expect(roomStackTop(60, 800, 1300)).toBe(800 - 1300 - 12);
  });

  it('fixes every card to the available height, fitting the first one under the logo', () => {
    expect(roomStackHeight(680)).toBe(680);
    expect(roomStackHeight(680, 560)).toBe(548);
    expect(roomStackHeight(680, 900)).toBe(680);
    expect(roomStackHeight(680, 300)).toBe(680);
    expect(roomStackHeight(470, 339)).toBe(327);
  });

  it('reports how much of the visible card the next card covers', () => {
    expect(roomStackProgress(72, 572, undefined, 0, 800)).toBe(0);
    expect(roomStackProgress(1130, 1550, 1552, 0, 800)).toBe(0);
    expect(roomStackProgress(72, 572, 900, 0, 800)).toBe(0);
    expect(roomStackProgress(72, 572, 322, 0, 800)).toBe(0.5);
    expect(roomStackProgress(72, 572, 82, 0, 800)).toBeCloseTo(0.98);
    expect(roomStackProgress(-500, 788, 400, 0, 800)).toBeCloseTo(388 / 788);
  });
});
