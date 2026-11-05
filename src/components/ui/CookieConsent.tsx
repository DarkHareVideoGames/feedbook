import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { useI18n } from '../../i18n';

const CONSENT_KEY = 'feedbook-cookie-consent';

type Consent = 'accepted' | 'essential';

function readConsent(): Consent | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(CONSENT_KEY);
  return stored === 'accepted' || stored === 'essential' ? stored : null;
}

export default function CookieConsent() {
  const { translations } = useI18n();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const shouldShow = readConsent() === null;
    setVisible(shouldShow);
    const t = window.setTimeout(() => setMounted(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const decide = (choice: Consent) => {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setMounted(false);
    window.setTimeout(() => setVisible(false), 250);
  };

  return (
    <div
      className={`cookie-banner ${mounted ? 'cookie-banner--visible' : ''}`}
      role="dialog"
      aria-live="polite"
      aria-label={translations.cookies.title}
    >
      <div className="cookie-banner-inner">
        <div className="cookie-banner-header">
          <span className="cookie-banner-icon-wrap" aria-hidden="true">
            <Cookie className="cookie-banner-icon" size={18} />
          </span>
          <strong className="cookie-banner-title">{translations.cookies.title}</strong>
        </div>
        <p className="cookie-banner-message">{translations.cookies.message}</p>
        <div className="cookie-banner-actions">
          <button type="button" className="cookie-banner-btn cookie-banner-btn--primary" onClick={() => decide('accepted')}>
            {translations.cookies.accept}
          </button>
          <button type="button" className="cookie-banner-btn cookie-banner-btn--secondary" onClick={() => decide('essential')}>
            {translations.cookies.reject}
          </button>
        </div>
      </div>
    </div>
  );
}
