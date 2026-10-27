import type { PopoverDOM } from 'driver.js';

export function renderOnboardingPopover(popover: PopoverDOM): void {
  popover.wrapper.setAttribute('aria-live', 'polite');
  popover.wrapper.setAttribute('aria-label', 'Tutorial do painel de administração');
  popover.closeButton.setAttribute('title', 'Fechar tutorial');
}