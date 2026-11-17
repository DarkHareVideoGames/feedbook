import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import InstallPwaPrompt from './InstallPwaPrompt';
import AdminSetupDiagnostics from './AdminSetupDiagnostics';

afterEach(() => vi.unstubAllGlobals());

describe('admin visual components', () => {
  function browser(ios: boolean, standalone = false) {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: standalone }), navigator: { standalone } });
    vi.stubGlobal('navigator', { userAgent: ios ? 'iPhone' : 'Desktop' });
  }

  it('não apresenta um convite falso sem evento de instalação no desktop', () => {
    browser(false);
    expect(renderToStaticMarkup(<InstallPwaPrompt />)).toBe('');
  });

  it('não apresenta o convite quando já está instalada', () => {
    browser(true, true);
    expect(renderToStaticMarkup(<InstallPwaPrompt />)).toBe('');
  });

  it('apresenta instruções iOS com classes locais e nome acessível', () => {
    browser(true);
    const html = renderToStaticMarkup(<InstallPwaPrompt />);
    expect(html).toContain('<aside class="admin-install-prompt" aria-label="Instalar Feedbook Admin">');
    expect(html).toContain('Ver instruções');
    expect(html).toContain('admin-install-prompt-close');
    expect(html).not.toContain('class="fixed ');
  });

  it('mantém ações e toggle de diagnóstico sem classes utilitárias nem estilos inline', () => {
    const html = renderToStaticMarkup(<AdminSetupDiagnostics token="" userId="" />);
    expect(html).toContain('Reverificar');
    expect(html).toContain('Ativar notificações');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('admin-diagnostics-button');
    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/class="[^"]*(?:text-\[|space-y-|h-3|flex )/);
  });

});