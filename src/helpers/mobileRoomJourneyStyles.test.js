import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../components/ui/MobileRoomJourney.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('../components/ui/MobileRoomJourney.tsx', import.meta.url), 'utf8');

describe('mobile room stage motion and layout', () => {
  it('animates room changes only for users who allow motion, without zooming photos', () => {
    const motion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: no-preference)'), styles.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(motion).toContain('animation: room-journey-enter');
    expect(motion).toContain('animation: room-journey-leave');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).not.toMatch(/scale\(/);
  });

  it('shows one room at a time in a fixed stage', () => {
    expect(styles).toMatch(/\.room-journey \{[^}]*height: var\(--stage-height/);
    expect(styles).toMatch(/\.room-journey-chapter \{[^}]*position: absolute/);
    expect(styles).not.toContain('position: sticky');
    expect(component).toContain("toggleAttribute('inert', !active)");
  });

  it('changes rooms on swipe and wheel only while the stage is in view, leaving the page scroll otherwise', () => {
    expect(component).toContain("addEventListener('wheel', onWheel, { passive: false })");
    expect(component).toContain("addEventListener('touchmove', onTouchMove, { passive: false })");
    expect(component).toContain('roomStageTarget(');
    expect(component).toContain('detailsCanScroll(');
  });
});
