import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../components/ui/MobileRoomJourney.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('../components/ui/MobileRoomJourney.tsx', import.meta.url), 'utf8');

describe('mobile room journey motion and layout', () => {
  it('limits entry animations to users who allow motion and never zooms cards', () => {
    const motion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toContain('var(--phase-entry, 0) * 28px');
    expect(styles).not.toMatch(/scale\(/);
    expect(styles.slice(0, styles.indexOf('@media'))).not.toContain('transform: translateY');
  });

  it('keeps native scrolling rather than trapping wheel or touch gestures', () => {
    expect(component).not.toContain('onWheel');
    expect(component).not.toContain('onTouchMove');
    expect(component).toContain("scroller.addEventListener('scroll', schedule, { passive: true })");
    expect(component).toContain('cancelAnimationFrame(frame)');
  });

  it('stacks whole cards, one per screen, dimming the covered one', () => {
    expect(styles).toMatch(/\.room-journey-chapter \{[^}]*position: sticky/);
    expect(styles).toContain('brightness(calc(1 - var(--stack-progress, 0)');
    expect(styles).toContain('height: var(--stack-height, auto)');
    expect(styles).toMatch(/\.room-journey-details \{[^}]*overflow-y: auto/);
    expect(component).toContain("details.classList.toggle('is-scrollable', scrollable)");
    expect(component).toContain('new ResizeObserver(schedule)');
    expect(styles).not.toContain('grid-template-rows: 0fr');
  });
});
