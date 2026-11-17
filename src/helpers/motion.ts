/** Consultar no momento da ação permite respeitar alterações da preferência. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export function getScrollBehavior(): ScrollBehavior {
  // "auto" pode herdar scroll suave do CSS; "instant" evita essa animação.
  return prefersReducedMotion() ? 'instant' : 'smooth';
}