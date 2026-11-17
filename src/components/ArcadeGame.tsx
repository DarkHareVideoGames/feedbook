import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { collides, difficulty, GRAVITY, JUMP, PLAYER_X, validNick } from '../helpers/arcade';
import './arcade.css';
import { playArcadeAudio, stopArcadeAudio } from '../helpers/arcadeAudio';

type Entry = { nick: string; score: number };
const copy = {
  'pt-PT': {
    start: 'Jogar', jump: 'Saltar', again: 'Tentar de novo', points: 'Pontos',
    instructions: 'Salta os amplificadores com Espaço, ↑ ou toque. A velocidade aumenta!',
    board: 'TOP 10 · HIGHSCORES', loading: 'A carregar ranking…', empty: 'A primeira lenda podes ser tu.',
    unavailable: 'Ranking indisponível. Podes continuar a jogar.', nick: 'Nick público',
    hint: '3–12 caracteres: A–Z, 0–9, _ ou -. Não uses dados pessoais.',
    save: 'Guardar pontuação', saving: 'A guardar…', saved: 'Pontuação guardada!',
    failed: 'Não foi possível guardar. Tenta novamente.', rate: 'Demasiados envios. Aguarda um minuto.',
    offline: 'Esta partida não está ligada ao ranking. Joga novamente para tentar ligar.',
    sound: 'Som',
  },
  en: {
    start: 'Play', jump: 'Jump', again: 'Try again', points: 'Score',
    instructions: 'Jump over the amps with Space, ↑ or touch. Speed increases!',
    board: 'TOP 10 · HIGHSCORES', loading: 'Loading leaderboard…', empty: 'Be the first legend.',
    unavailable: 'Leaderboard unavailable. You can still play.', nick: 'Public nickname',
    hint: '3–12 characters: A–Z, 0–9, _ or -. Do not use personal information.',
    save: 'Save score', saving: 'Saving…', saved: 'Score saved!',
    failed: 'Could not save. Please try again.', rate: 'Too many submissions. Wait a minute.',
    offline: 'This run is not connected to the leaderboard. Play again to reconnect.',
    sound: 'Sound',
  },
};

async function request(body?: object) {
  const response = await fetch('/api/arcade', {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export default function ArcadeGame() {
  const { locale } = useI18n();
  const t = copy[locale];
  const arena = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const obstacles = useRef<HTMLDivElement>(null);
  const music = useRef<HTMLAudioElement>(null);
  const jumpSound = useRef<HTMLAudioElement>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const state = useRef({ running: false, y: 0, vy: 0, score: 0, last: 0, spawn: 1, raf: 0, xs: [] as number[] });
  const runId = useRef(0);
  const savingRef = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [score, setScore] = useState(0);
  const [token, setToken] = useState('');
  const [nick, setNick] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [board, setBoard] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'rate'>('idle');

  const loadBoard = useCallback(async () => {
    try {
      const data = await request();
      setEntries(data.scores);
      setBoard('ready');
    } catch { setBoard('error'); }
  }, []);

  useEffect(() => { void loadBoard(); }, [loadBoard]);
  useEffect(() => {
    const background = music.current;
    const effect = jumpSound.current;
    if (background) background.volume = 0.3;
    if (effect) effect.volume = 0.6;
    return () => { stopArcadeAudio(background); stopArcadeAudio(effect); };
  }, []);
  useEffect(() => () => {
    state.current.running = false;
    cancelAnimationFrame(state.current.raf);
    runId.current += 1;
  }, []);

  const start = useCallback(() => {
    stopArcadeAudio(jumpSound.current);
    if (!mutedRef.current) playArcadeAudio(music.current, true);
    cancelAnimationFrame(state.current.raf);
    const id = ++runId.current;
    Object.assign(state.current, { running: true, y: 0, vy: 0, score: 0, last: performance.now(), spawn: 1, xs: [] });
    setScore(0); setPhase('playing'); setToken(''); setSaveState('idle');
    if (player.current) player.current.style.transform = 'translateY(0)';
    if (obstacles.current) obstacles.current.replaceChildren();
    void request({ action: 'start' }).then(data => {
      if (runId.current === id) setToken(data.token);
    }).catch(() => {});
    const loop = (now: number) => {
      const s = state.current;
      if (!s.running) return;
      const dt = Math.min(Math.max(0, (now - s.last) / 1000), 0.033);
      s.last = now;
      const width = arena.current?.clientWidth || 600;
      const d = difficulty(s.score, width);
      s.vy -= GRAVITY * dt;
      s.y = Math.max(0, s.y + s.vy * dt);
      if (s.y === 0) s.vy = 0;
      s.spawn -= dt;
      if (s.spawn <= 0) {
        s.xs.push(width + 30);
        s.spawn = d.interval + Math.random() * 0.3;
      }
      s.xs = s.xs.map(x => x - d.speed * dt).filter(x => x > -40);
      s.score += dt * 10;
      setScore(previous => previous === Math.floor(s.score) ? previous : Math.floor(s.score));
      if (player.current) player.current.style.transform = `translateY(${-s.y}px)`;
      if (obstacles.current) {
        // Reuse nodes: no HTML parsing or image reload on each frame.
        while (obstacles.current.children.length > s.xs.length) obstacles.current.lastChild?.remove();
        s.xs.forEach((x, i) => {
          let el = obstacles.current!.children[i] as HTMLDivElement | undefined;
          if (!el) {
            el = document.createElement('div'); el.className = 'arcade-amp';
            obstacles.current!.append(el);
          }
          el.style.transform = `translateX(${x}px)`;
        });
      }
      if (s.xs.some(x => collides(x, s.y))) {
        stopArcadeAudio(music.current);
        stopArcadeAudio(jumpSound.current);
        s.running = false; setPhase('over'); return;
      }
      s.raf = requestAnimationFrame(loop);
    };
    state.current.raf = requestAnimationFrame(loop);
  }, []);

  const jump = useCallback(() => {
    if (state.current.running && state.current.y === 0) {
      state.current.vy = JUMP;
      if (!mutedRef.current) playArcadeAudio(jumpSound.current, true);
    }
  }, []);

  useEffect(() => {
    const pause = () => {
      state.current.last = performance.now();
      if (document.hidden) {
        music.current?.pause();
        stopArcadeAudio(jumpSound.current);
      } else if (state.current.running && !mutedRef.current) playArcadeAudio(music.current);
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  async function save() {
    if (savingRef.current || saveState === 'saved' || !validNick(nick) || !token) return;
    const id = runId.current;
    savingRef.current = true; setSaveState('saving');
    try {
      await request({ token, nick, score });
      if (runId.current !== id) return;
      setSaveState('saved'); void loadBoard();
    } catch (error) {
      if (runId.current !== id) return;
      // A lost success response is safe to retry: a session can only be saved once.
      if (error instanceof Error && error.message === '409') { setSaveState('saved'); void loadBoard(); }
      else setSaveState(error instanceof Error && error.message === '429' ? 'rate' : 'error');
    } finally { savingRef.current = false; }
  }

  return <section className={`arcade${phase === 'over' ? ' arcade-over' : ''}`} aria-label="404 Arcade">
    <audio ref={music} src="/feedbook_404_arcade_loop.ogg" loop preload="none" aria-hidden="true" />
    <audio ref={jumpSound} src="/feedbook_404_jump.ogg" preload="none" aria-hidden="true" />
    <p id="arcade-instructions">{t.instructions}</p>
    <button type="button" className="secondary-button" aria-pressed={!muted} onClick={() => {
      const next = !mutedRef.current;
      mutedRef.current = next;
      setMuted(next);
      if (next) {
        music.current?.pause();
        stopArcadeAudio(jumpSound.current);
      } else if (state.current.running) playArcadeAudio(music.current);
    }}>{t.sound}: {muted ? 'OFF' : 'ON'}</button>
    <div className="arcade-stage">
    <div className="arcade-arena" ref={arena} tabIndex={0} role="group" aria-label="404 Arcade"
      aria-describedby="arcade-instructions"
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.repeat || !['Space', 'ArrowUp'].includes(event.code)) return;
        event.preventDefault();
        if (phase === 'idle') start(); else jump();
      }}
      onPointerDown={event => {
        if ((event.target as HTMLElement).closest('button')) return;
        event.currentTarget.focus();
        if (phase === 'idle') start(); else jump();
      }}>
      <div className="arcade-floor" />
      <div className="arcade-player" ref={player} style={{ left: PLAYER_X }} aria-hidden="true">
        <img src="/guitarrist.png" alt="" onError={event => {
          event.currentTarget.style.display = 'none';
          event.currentTarget.parentElement?.classList.add('arcade-player-fallback');
        }} />
      </div>
      <div ref={obstacles} aria-hidden="true" />
      <div className="arcade-score">{t.points}: {score}</div>
      {phase !== 'playing' && <div className="arcade-overlay">
        {phase === 'over' && <strong role="status">GAME OVER · {score}</strong>}
        <button type="button" className="primary-button" onClick={() => { start(); arena.current?.focus(); }}>
          {phase === 'over' ? t.again : t.start}
        </button>
      </div>}
    </div>
    {phase === 'over' && score > 0 && <form className="arcade-entry" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="arcade-nick">{t.nick}</label>
      <input id="arcade-nick" value={nick} maxLength={12} minLength={3} required pattern={'[A-Z0-9_\\-]{3,12}'}
        autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="arcade-nick-hint"
        disabled={saveState === 'saving' || saveState === 'saved'}
        onChange={event => setNick(event.target.value.toUpperCase())} />
      <small id="arcade-nick-hint">{t.hint}</small>
      <button type="submit" className="primary-button" disabled={!token || !validNick(nick) || saveState === 'saving' || saveState === 'saved'}>
        {saveState === 'saving' ? t.saving : t.save}
      </button>
      <p role="status">{!token ? t.offline : saveState === 'saved' ? t.saved : saveState === 'error' ? t.failed : saveState === 'rate' ? t.rate : ''}</p>
    </form>}
    </div>
    <button type="button" className="secondary-button arcade-jump" disabled={phase !== 'playing'} onClick={jump}>{t.jump} ↑</button>
    <details className="arcade-board">
      <summary>{t.board}</summary>
      {board !== 'ready' ? <p role="status">{board === 'loading' ? t.loading : t.unavailable}</p>
        : entries.length === 0 ? <p>{t.empty}</p>
        : <ol>{entries.map((entry, i) => <li key={i}><span>{entry.nick}</span><strong>{entry.score.toString().padStart(6, '0')}</strong></li>)}</ol>}
    </details>
  </section>;
}