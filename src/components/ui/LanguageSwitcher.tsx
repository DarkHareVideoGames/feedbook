import { useI18n } from '../../i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale, translations } = useI18n();

  const changeLocale = (next: 'pt-PT' | 'en') => {
    setLocale(next);
  };

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={translations.topbar.languageLabel}
    >
      <div className="language-switcher-buttons">
        {(['pt-PT', 'en'] as const).map((language) => (
          <button
            key={language}
            type="button"
            className={`language-button ${locale === language ? 'language-button-active' : ''}`}
            aria-pressed={locale === language}
            onClick={() => changeLocale(language)}
          >
            {translations.languages[language]}
          </button>
        ))}
      </div>
    </div>
  );
}
