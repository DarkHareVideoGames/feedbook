type WelcomeModalProps = {
  busy: boolean;
  onStart: () => void;
  onSkip: () => void;
};

function WelcomeModal({ busy, onStart, onSkip }: WelcomeModalProps) {
  return (
    <div className="admin-modal-backdrop onboarding-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title">
      <section className="card admin-modal-card onboarding-welcome-modal">
        <p className="eyebrow">Bem-vindo!</p>
        <h2 id="onboarding-welcome-title">Welcome to hell!</h2>
        <p>
          Faz uma visita guiada às áreas principais para começares a gerir ensaios, pedidos e configurações com confiança.
        </p>
        <div className="admin-modal-actions onboarding-welcome-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onSkip}>
            {busy ? 'A guardar...' : 'Mais tarde'}
          </button>
          <button type="button" className="primary-button" disabled={busy} onClick={onStart}>
            {busy ? 'A preparar...' : 'Começar tutorial'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default WelcomeModal;