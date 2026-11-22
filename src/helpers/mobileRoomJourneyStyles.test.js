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
    expect(component).toContain("root: details.closest('.page-shell')");
    expect(component).toContain('observer.disconnect()');
    expect(component).toContain('threshold: 0');
    expect(component).toContain("scroller.addEventListener('scroll', schedule, { passive: true })");
    expect(component).toContain('cancelAnimationFrame(frame)');
  });
});