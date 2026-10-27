import { HelpCircle } from 'lucide-react';

type OnboardingHelpTriggerProps = {
  busy: boolean;
  onStart: () => void;
};

function OnboardingHelpTrigger({ busy, onStart }: OnboardingHelpTriggerProps) {
  return (
    <button
      type="button"
      className="secondary-button onboarding-help-trigger"
      disabled={busy}
      onClick={onStart}
      aria-label="Recomeçar tutorial do painel"
      title="Ajuda: recomeçar tutorial"
    >
      <HelpCircle aria-hidden="true" size={16} />
      {busy ? 'A preparar...' : 'Ajuda'}
    </button>
  );
}

export default OnboardingHelpTrigger;