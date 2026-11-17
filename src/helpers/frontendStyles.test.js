import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOOTER_LINKS } from '../constants/footerLinks';

const styles = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

// These class names are composed at runtime, so a literal-only CSS purge
// cannot distinguish them from unused selectors.
describe('frontend styles retained after legacy cleanup', () => {
  it.each(['superuser', 'admin', 'collaborator', 'technician'])(
    'preserves both dynamically generated role styles for %s', (role) => {
      expect(styles).toContain(`.admin-role-${role}`);
      expect(styles).toContain(`.admin-user-role-${role}`);
    },
  );

  it.each(['pending', 'contacted', 'closed', 'confirmed'])(
    'preserves dynamically generated availability status %s', (status) => {
      expect(styles).toContain(`.is-${status}`);
    },
  );

  it.each(FOOTER_LINKS.map(({ id }) => id))(
    'preserves the footer style generated from link id %s', (id) => {
      expect(styles).toContain(`.site-footer-link-${id}`);
    },
  );

  it.each(['pending', 'rejected'])(
    'preserves dynamically generated history state %s', (status) => {
      expect(styles).toContain(`.history-row-${status}`);
    },
  );

  it('preserves third-party onboarding selectors', () => {
    expect(styles).toContain('.feedbook-onboarding-popover.driver-popover');
    expect(styles).toContain('.driver-popover-title');
    expect(styles).toContain('.driver-popover-close-btn');
  });

  it('preserves live selectors from lists that also contained legacy selectors', () => {
    for (const selector of [
      '.gear-list', '.booking-form', '.primary-button', '.secondary-button',
      '.extra-toggle', '.admin-message-error', '.booking-detail-email', '.about-scroll-cue',
    ]) {
      expect(styles).toContain(selector);
    }
  });

  it('preserves scroll, sticky heading and open-dialog rules', () => {
    expect(styles).toContain('html.public-booking-page:has(dialog[open])');
    expect(styles).toContain('.public-booking-frame:has(dialog[open]) > .page-shell');
    expect(styles).toContain('.public-explore .booking-heading');
    expect(styles).toContain('.public-booking-frame .about-header::before');
    expect(styles).toContain('overscroll-behavior-y: auto');
  });

  it('keeps reduced-motion overrides after desktop scroll and card overrides', () => {
    const reducedMotion = styles.slice(styles.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotion).toMatch(/html\.public-explore\s*\{\s*scroll-behavior: auto;/);
    expect(reducedMotion).toMatch(/\.public-explore \.room-card\s*\{\s*transition: none;/);
    expect(reducedMotion).toMatch(/\.booking-step\s*\{\s*animation: none;/);
    expect(styles.lastIndexOf('scroll-behavior: smooth')).toBeLessThan(styles.lastIndexOf('scroll-behavior: auto'));
  });
});