import React, { useState } from 'react';
import ArcadeGame from './components/ArcadeGame';
import { useI18n } from './i18n';
import { FOOTER_LINKS } from './constants/footerLinks';

const NotFoundPage: React.FC = () => {
  const { translations } = useI18n();
  const [logoVisible, setLogoVisible] = useState(true);

  return (
    <div className="page-shell">
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
          style={{ textAlign: 'center', padding: '2rem 1rem', maxWidth: 820, margin: '0 auto' }}
        >
          <p
            className="eyebrow"
            style={{ fontSize: 'clamp(4rem, 12vw, 8rem)', letterSpacing: '0.1em', opacity: 0.9, lineHeight: 1, margin: 0 }}
          >
            404
          </p>
          <h1
            id="not-found-title"
            style={{ fontSize: 'clamp(1.25rem, 4vw, 2rem)', marginTop: '1rem', lineHeight: 1.2 }}
          >
            Esta página fez um stage dive e ninguém a apanhou.
          </h1>
          <p style={{ marginTop: '1.5rem', lineHeight: 1.6, maxWidth: 640, marginInline: 'auto' }}>
            Procurámos nos bastidores, debaixo da mesa de mistura e até no camarim. Nada. Nem um cabo XLR esquecido.
          </p>
          <p style={{ marginTop: '1rem', lineHeight: 1.6, maxWidth: 640, marginInline: 'auto' }}>
            Pode ter sido apagada, movida ou nunca ter existido. Às vezes o URL é só um riff mal tocado.
          </p>
          <p style={{ marginTop: '1.5rem', fontWeight: 600 }}>Mas o espetáculo continua.</p>

          <ArcadeGame />

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
            <a className="primary-button" href="/" style={{ textDecoration: 'none' }}>
              Voltar às salas de ensaio
            </a>
          </div>

          <p style={{ marginTop: '2.5rem', fontSize: '0.9rem', opacity: 0.7 }}>
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
