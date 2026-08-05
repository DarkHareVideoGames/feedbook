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

  return 'pt-PT';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
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
