import React, { useState, useEffect, useRef, useCallback } from 'react';

const NotFoundPage: React.FC = () => {
  const [logoVisible, setLogoVisible] = useState(true);

  // Mini-jogo: guitarrista que salta
  const gameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const stateRef = useRef({
    y: 0,
    vy: 0,
    obstacles: [] as { x: number }[],
    score: 0,
    running: false,
    raf: 0,
    lastTime: 0,
    spawnTimer: 0,
  });

  const GROUND = 0;
  const GRAVITY = 1800;
  const JUMP = 620;
  const SPEED = 260;

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.y = 0;
    s.vy = 0;
    s.obstacles = [];
    s.score = 0;
    s.spawnTimer = 0;
    setScore(0);
    setGameOver(false);
  }, []);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.y === 0) {
      s.vy = JUMP;
    }
  }, []);

  const start = useCallback(() => {
    reset();
    const s = stateRef.current;
    s.running = true;
    setPlaying(true);
    s.lastTime = performance.now();
    const loop = (now: number) => {
      const s = stateRef.current;
      if (!s.running) return;
      const dt = Math.min((now - s.lastTime) / 1000, 0.033);
      s.lastTime = now;

      // física
      s.vy -= GRAVITY * dt;
      s.y += s.vy * dt;
      if (s.y < 0) {
        s.y = 0;
        s.vy = 0;
      }

      // spawn obstáculos
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) {
        s.obstacles.push({ x: 600 });
        s.spawnTimer = 1.2 + Math.random() * 0.8;
      }

      // mover obstáculos
      for (const o of s.obstacles) o.x -= SPEED * dt;
      s.obstacles = s.obstacles.filter((o) => o.x > -40);

      // colisão
      const playerX = 60;
      const playerW = 34;
      const playerH = 46;
      const playerBottom = s.y;
      for (const o of s.obstacles) {
        const obsW = 22;
        const obsH = 38;
        if (
          playerX + playerW > o.x &&
          playerX < o.x + obsW &&
          playerBottom < obsH
        ) {
          s.running = false;
          setPlaying(false);
          setGameOver(true);
          return;
        }
      }

      // pontuação
      s.score += dt * 10;
      setScore(Math.floor(s.score));

      // render
      const el = gameRef.current;
      if (el) {
        const player = el.querySelector('.game-player') as HTMLDivElement | null;
        const obsContainer = el.querySelector('.game-obstacles') as HTMLDivElement | null;
        if (player) player.style.bottom = `${40 + s.y}px`;
        if (obsContainer) {
          obsContainer.innerHTML = s.obstacles
            .map((o) => `<div class="game-obstacle" style="left:${o.x}px"></div>`)
            .join('');
        }
      }

      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
  }, [reset]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(stateRef.current.raf);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!playing && !gameOver) start();
        else jump();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, gameOver, start, jump]);

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
            style={{ fontSize: '1.5rem', letterSpacing: '0.2em', opacity: 0.6 }}
          >
            404
          </p>
          <h1
            id="not-found-title"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', marginTop: '0.25rem', lineHeight: 1.05 }}
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

          {/* Mini-jogo */}
          <div
            ref={gameRef}
            className="not-found-game"
            onClick={() => {
              if (!playing && !gameOver) start();
              else jump();
            }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 600,
              height: 200,
              margin: '2rem auto 0',
              border: '2px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(20,20,30,0.6), rgba(10,10,15,0.9))',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 40,
                background: 'rgba(255,255,255,0.06)',
                borderTop: '1px solid rgba(255,255,255,0.12)',
              }}
            />
            <div
              className="game-player"
              style={{
                position: 'absolute',
                left: 60,
                bottom: 40,
                width: 34,
                height: 46,
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              🎸
            </div>
            <div className="game-obstacles" style={{ position: 'absolute', inset: 0 }} />
            <div
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                fontSize: 14,
                opacity: 0.8,
                fontWeight: 600,
              }}
            >
              Pontos: {score}
            </div>
            {!playing && !gameOver && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 6,
                  background: 'rgba(0,0,0,0.35)',
                }}
              >
                <strong>Clica ou pressiona Espaço para jogar</strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Faz o guitarrista saltar os amplificadores</span>
              </div>
            )}
            {gameOver && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'rgba(0,0,0,0.5)',
                }}
              >
                <strong>Game over — {score} pontos</strong>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    start();
                  }}
                >
                  Tentar de novo
                </button>
              </div>
            )}
          </div>

          <style>{`
            .game-obstacle {
              position: absolute;
              bottom: 40px;
              width: 22px;
              height: 38px;
              background: linear-gradient(135deg, #6b7280, #374151);
              border-radius: 4px;
            }
          `}</style>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
            <a className="primary-button" href="/" style={{ textDecoration: 'none' }}>
              Voltar ao palco principal
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
