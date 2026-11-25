import { describe, expect, it } from 'vitest';
import { roomStackProgress, roomStackTop } from './roomStack';

describe('room stack geometry', () => {
  it('steps short cards below the sticky heading so earlier cards peek out', () => {
    expect(roomStackTop(0, 60, 800, 500)).toBe(72);
    expect(roomStackTop(2, 60, 800, 500)).toBe(92);
  });

  it('sticks tall cards by their bottom edge so all content stays reachable', () => {
    expect(roomStackTop(0, 60, 800, 1300)).toBe(800 - 1300 - 12);
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
