import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import en from './locales/en.json';
import ptPT from './locales/pt-PT.json';

export type Locale = 'pt-PT' | 'en';

type Translations = typeof ptPT;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  translations: Translations;
};

const STORAGE_KEY = 'feedbook-locale';

const dictionaries: Record<Locale, Translations> = {
  'pt-PT': ptPT,
  en,
};

// Formato Open Graph usa sublinhado (pt_PT, en_US).
const ogLocale: Record<Locale, string> = {
  'pt-PT': 'pt_PT',
  en: 'en_US',
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value === 'pt-PT' || value === 'en';
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'pt-PT';
  }

  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (isLocale(storedLocale)) {
    return storedLocale;
  }

  // Deteção inicial pelo idioma do browser, com PT como omissão.
  const browserLocale = window.navigator.language.toLowerCase();
  if (browserLocale.startsWith('en')) {
    return 'en';
  }

  return 'pt-PT';
}

// Obtém ou cria uma meta tag pelo atributo `name` ou `property`.
function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Sincroniza o <head> com o idioma activo: lang, title, description
// e as meta tags de SEO/Redes Sociais. Evita dependências como
// react-helme-async — o controlo vive aqui, perto do i18n.
function applyHead(locale: Locale) {
  const t = dictionaries[locale];
  document.documentElement.lang = locale === 'en' ? 'en' : 'pt-PT';
  document.title = t.meta.title;
  upsertMeta('name', 'description', t.meta.description);
  upsertMeta('property', 'og:title', t.meta.title);
  upsertMeta('property', 'og:description', t.meta.description);
  upsertMeta('property', 'og:locale', ogLocale[locale]);
  upsertMeta('name', 'twitter:title', t.meta.title);
  upsertMeta('name', 'twitter:description', t.meta.description);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    applyHead(locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      translations: dictionaries[locale],
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
}
