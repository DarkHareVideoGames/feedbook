type WelcomeModalProps = {
  busy: boolean;
  onStart: () => void;
  onLater: () => void;
};

function WelcomeModal({ busy, onStart, onLater }: WelcomeModalProps) {
  return (
    <div className="admin-modal-backdrop onboarding-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title">
      <section className="card admin-modal-card onboarding-welcome-modal">
        <p className="eyebrow">Administração</p>
        <h2 id="onboarding-welcome-title">Queres ver o tutorial?</h2>
        <p>Vamos mostrar automaticamente as principais funcionalidades da administração.</p>
        <div className="admin-modal-actions onboarding-welcome-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onLater}>
            {busy ? 'A preparar...' : 'Ver mais tarde'}
          </button>
          <button type="button" className="primary-button" disabled={busy} onClick={onStart}>
            {busy ? 'A preparar...' : 'Ver tutorial'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default WelcomeModal;