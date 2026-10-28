type CompletionModalProps = {
  busy: boolean;
  onConfirm: () => void;
};

function CompletionModal({ busy, onConfirm }: CompletionModalProps) {
  return (
    <div className="admin-modal-backdrop onboarding-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-completion-title">
      <section className="card admin-modal-card onboarding-welcome-modal">
        <p className="eyebrow">Tutorial concluído</p>
        <h2 id="onboarding-completion-title">Já conheces o essencial</h2>
        <p>Podes rever esta demonstração a qualquer momento através do botão Ajuda.</p>
        <div className="admin-modal-actions onboarding-welcome-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>
            {busy ? 'A guardar...' : 'Entendi!'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default CompletionModal;