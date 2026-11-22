import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pt from '../locales/pt-PT.json';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('initial public page HTML', () => {
  it('only presents the static description when JavaScript is disabled', () => {
    const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/)[1];
    const fallback = root.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];

    expect(fallback).toContain('<h1>Salas de ensaio no Montijo</h1>');
    expect(fallback).toContain('Na Feedback Studios podes reservar');
    expect(fallback).toContain('Ativa o JavaScript para consultar a disponibilidade e reservar.');
    expect(root.replace(/<noscript>[\s\S]*?<\/noscript>/, '').trim()).toBe('');
  });

  it('sets a dark canvas before loading the application module', () => {
    const head = html.split('</head>')[0];

    expect(head).toMatch(/html, body\s*\{[^}]*background: #000000;/);
  });

  it('retains SEO metadata and structured data outside the fallback', () => {
    const head = html.split('</head>')[0];

    expect(head).toContain(`<title>${pt.meta.title}</title>`);
    expect(head).toContain(`<meta name="description" content="${pt.meta.description}" />`);
    expect(head).toContain('application/ld+json');
    expect(head).toContain('"@type": "LocalBusiness"');
  });
});