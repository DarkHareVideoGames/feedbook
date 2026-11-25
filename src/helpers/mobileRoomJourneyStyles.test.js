import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../components/ui/MobileRoomJourney.css', import.meta.url), 'utf8');

describe('mobile room journey motion and layout', () => {
  it('limits reveal and arrow animations to users who allow motion', () => {
    const motion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toContain('animation: room-journey-nudge');
    expect(motion).toContain('transform: translateY(24px)');
    expect(motion).toContain('.room-journey-details:focus-within');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps native scrolling rather than trapping wheel or touch gestures', () => {
    const component = readFileSync(new URL('../components/ui/MobileRoomJourney.tsx', import.meta.url), 'utf8');
    expect(component).not.toContain('onWheel');
    expect(component).not.toContain('onTouchMove');
    expect(component).toContain("details.toggleAttribute('inert', !revealed)");
    expect(styles).toContain('grid-template-rows: 0fr');
    expect(styles).toContain('grid-template-rows: 1fr');
    expect(styles).toContain('room-journey-scan');
    expect(component).toContain("scroller.addEventListener('scroll', schedule, { passive: true })");
    expect(component).toContain('cancelAnimationFrame(frame)');
  });

  it('stacks the room cards as a sticky deck that dims covered cards', () => {
    const component = readFileSync(new URL('../components/ui/MobileRoomJourney.tsx', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.room-journey-chapter \{[^}]*position: sticky/);
    expect(styles).toContain('brightness(calc(1 - var(--stack-progress, 0)');
    const motion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toContain('var(--stack-progress, 0) * 0.08');
    expect(component).toContain('new ResizeObserver(schedule)');
    expect(component).toContain('covered === 0');
  });
});
