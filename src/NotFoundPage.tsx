import React, { useState } from 'react';

const NotFoundPage: React.FC = () => {
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
          style={{ textAlign: 'center', padding: '4rem 1rem', maxWidth: 720, margin: '0 auto' }}
        >
          <p className="eyebrow" style={{ fontSize: '1.25rem', letterSpacing: '0.2em' }}>404</p>
          <h1 id="not-found-title" style={{ fontSize: '2rem', marginTop: '0.5rem' }}>
            Esta página fez um stage dive e ninguém a apanhou.
          </h1>
          <p style={{ marginTop: '1.5rem', lineHeight: 1.6 }}>
            Procurámos nos bastidores, debaixo da mesa de mistura e até no camarim. Nada. Nem um cabo XLR esquecido.
          </p>
          <p style={{ marginTop: '1rem', lineHeight: 1.6 }}>
            Pode ter sido apagada, movida ou nunca ter existido. Às vezes o URL é só um riff mal tocado.
          </p>
          <p style={{ marginTop: '1.5rem', fontWeight: 600 }}>Mas o espetáculo continua.</p>

          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="primary-button" href="/" style={{ textDecoration: 'none' }}>
              Voltar ao palco principal
            </a>
            <a className="secondary-button" href="/" style={{ textDecoration: 'none' }}>
              Ver o que está a rebentar agora
            </a>
          </div>

          <p style={{ marginTop: '2.5rem', fontSize: '0.9rem', opacity: 0.7 }}>
            Se acreditas que isto é um erro, avisa-nos. Prometemos não partir nenhuma guitarra.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="site-footer-credit">Feedback - Ensaios</p>
        </div>
      </footer>
    </div>
  );
};

export default NotFoundPage;
