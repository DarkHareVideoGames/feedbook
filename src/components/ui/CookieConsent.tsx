import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { useI18n } from '../../i18n';

// Chave onde guardamos a escolha de consentimento. Enquanto não existir,
// o banner aparece; depois de aceitar/recusar, não volta a incomodar.
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

  useEffect(() => {
    // Mostra o banner apenas se ainda não houve escolha.
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  const decide = (choice: Consent) => {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setVisible(false);
  };

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-live="polite"
      aria-label={translations.cookies.title}
    >
      <Cookie className="cookie-banner-icon" size={22} aria-hidden="true" />
      <div className="cookie-banner-copy">
        <strong>{translations.cookies.title}</strong>
        <p>{translations.cookies.message}</p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="secondary-button" onClick={() => decide('essential')}>
          {translations.cookies.reject}
        </button>
        <button type="button" className="primary-button" onClick={() => decide('accepted')}>
          {translations.cookies.accept}
        </button>
      </div>
    </div>
  );
}
