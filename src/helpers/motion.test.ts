import { afterEach, describe, expect, it, vi } from 'vitest';
import { getScrollBehavior, prefersReducedMotion } from './motion';

afterEach(() => vi.unstubAllGlobals());

describe('motion preferences', () => {
  it('preserva scroll suave sem preferência de movimento reduzido', () => {
    const matchMedia = vi.fn(() => ({ matches: false }));
    vi.stubGlobal('window', { matchMedia });
    expect(prefersReducedMotion()).toBe(false);
    expect(getScrollBehavior()).toBe('smooth');
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('usa instant em vez de herdar scroll suave do CSS', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(prefersReducedMotion()).toBe(true);
    expect(getScrollBehavior()).toBe('instant');
  });

  it('consulta novamente a preferência em cada ação', () => {
    let reduced = false;
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
    expect(getScrollBehavior()).toBe('smooth');
    reduced = true;
    expect(getScrollBehavior()).toBe('instant');
    reduced = false;
    expect(getScrollBehavior()).toBe('smooth');
  });

  it('funciona sem window', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(false);
    expect(getScrollBehavior()).toBe('smooth');
  });

  it('funciona sem matchMedia', () => {
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);
    expect(getScrollBehavior()).toBe('smooth');
  });
});