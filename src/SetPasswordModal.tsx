import { FormEvent, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

type SetPasswordState = 'form' | 'saving' | 'done';

// Modal "Define a tua password" — aberto quando o utilizador clica no link de
// convite/recovery (evento PASSWORD_RECOVERY do Supabase). Montado no Root
// (main.tsx), por isso funciona em qualquer página (site público ou admin).
export default function SetPasswordModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SetPasswordState>('form');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const resetAndOpen = () => {
    setState('form');
    setPassword('');
    setConfirm('');
    setError('');
    setOpen(true);
  };

  useEffect(() => {
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) {
        resetAndOpen();
      }
    });

    // Redde de segurança: o link de recuperação pode aterrar no próprio
    // carregamento da página (o evento dispara antes de este subscribe).
    // Nesse caso, a sessão de recuperação tem recovery_at recente.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // recovery_at não está nas types de User desta versão do supabase-js.
        const recoveryAt = (data.session?.user as { recovery_at?: string } | undefined)?.recovery_at;
        const isRecentRecovery = Boolean(recoveryAt) && Date.now() - Date.parse(String(recoveryAt)) < 15 * 60 * 1000;
        if (active && isRecentRecovery) {
          resetAndOpen();
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
    setError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 6) {
      setError('A password precisa de pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As passwords nao coincidem.');
      return;
    }

    setState('saving');
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setState('form');
      setError(updateError.message || 'Nao foi possivel definir a password. O link pode ter expirado — pede um novo convite.');
      return;
    }

    // Fecha a sessão de recuperação: a partir daqui o utilizador entra
    // normalmente com a password que acabou de definir.
    await supabase.auth.signOut();
    setState('done');
  };

  if (!open) {
    return null;
  }

  return (
    <div className="set-password-overlay" role="dialog" aria-modal="true" aria-labelledby="set-password-title">
      <div className="set-password-card">
        {state === 'done' ? (
          <>
            <h2 id="set-password-title">Password definida ✅</h2>
            <p className="admin-helper-note">
              A tua password foi guardada com sucesso. Ja podes entrar na plataforma com o teu email e a nova password.
            </p>
            <button type="button" className="primary-button" onClick={close}>
              Fechar
            </button>
          </>
        ) : (
          <form className="set-password-form" onSubmit={handleSubmit}>
            <h2 id="set-password-title">Define a tua password</h2>
            <p className="admin-helper-note">
              A tua conta foi criada na plataforma. Escolhe a password que queres usar para entrar.
            </p>
            <label>
              Nova password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              Confirmar password
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            {error ? (
              <p className="set-password-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="admin-user-form-actions">
              <button type="submit" className="primary-button" disabled={state === 'saving'}>
                {state === 'saving' ? 'A guardar...' : 'Guardar password'}
              </button>
              <button type="button" className="secondary-button" onClick={close}>
                Agora nao
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}