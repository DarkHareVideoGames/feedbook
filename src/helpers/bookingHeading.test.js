import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pt from '../locales/pt-PT.json';
import en from '../locales/en.json';

describe('room booking heading', () => {
  it('uses a booking invitation independently of the Portuguese SEO title', () => {
    expect(pt.booking.roomTitle).toBe('Reserva a tua sala');
    expect(pt.meta.title).toBe('Salas de ensaio no Montijo | Feedback Studios');
  });

  it('translates the invitation without changing the English SEO title', () => {
    expect(en.booking.roomTitle).toBe('Book your room');
    expect(en.meta.title).toBe('Rehearsal rooms in Montijo | Feedback Studios');
  });

  it('preserves the initial HTML SEO and social titles', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    expect(html).toContain(`<title>${pt.meta.title}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${pt.meta.title}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${pt.meta.title}" />`);
  });
});