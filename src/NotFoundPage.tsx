import React, { useState } from 'react';
import ArcadeGame from './components/ArcadeGame';
import { useI18n } from './i18n';
import { FOOTER_LINKS } from './constants/footerLinks';

const NotFoundPage: React.FC = () => {
  const { translations } = useI18n();
  const [logoVisible, setLogoVisible] = useState(true);

  return (
    <div className="page-shell not-found-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar public-topbar">
        <a className="brand-wrap" href="/" aria-label="Ir para a pagina inicial">
          {logoVisible ? (
            <img
              className="brand-logo"
              src="/feedbook-logo.png"
              alt="Feedback - Ensaios"
              onError={() => setLogoVisible(false)}
            />
          ) : null}
        </a>
      </header>

      <main className="layout">
        <section
          className="not-found"
          aria-labelledby="not-found-title"
        >
          <p
            className="eyebrow"
          >
            404
          </p>
          <h1
            id="not-found-title"
          >
            Esta página fez um stage dive e ninguém a apanhou.
          </h1>

          <ArcadeGame />

          <div className="not-found-return">
            <a className="primary-button" href="/" style={{ textDecoration: 'none' }}>
              Voltar às salas de ensaio
            </a>
          </div>

          <p className="not-found-note">
            Se acreditas que isto é um erro, avisa-nos. Prometemos não partir nenhuma guitarra.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <nav className="site-footer-links" aria-label={translations.footer.linksLabel}>
            {FOOTER_LINKS.map(({ id, href, labelKey, Icon }) => (
              <a
                key={id}
                className={`site-footer-link site-footer-link-${id}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{translations.footer[labelKey]}</span>
              </a>
            ))}
          </nav>
          <p className="site-footer-credit">{translations.footer.credit}</p>
        </div>
      </footer>
    </div>
  );
};

export default NotFoundPage;
