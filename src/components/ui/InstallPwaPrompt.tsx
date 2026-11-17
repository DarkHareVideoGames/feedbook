import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export default function InstallPwaPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (installed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installedHandler = () => setInstalled(true);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [installed]);

  if (installed || dismissed) return null;

  const ios = isIOS();

  if (!ios && deferred) {
    return (
      <aside className="admin-install-prompt" aria-label="Instalar Feedbook Admin">
        <div className="admin-install-prompt-layout">
          <Download className="admin-install-prompt-icon" aria-hidden="true" />
          <div className="admin-install-prompt-body">
            <p className="admin-install-prompt-title">Instalar Feedbook Admin</p>
            <p className="admin-install-prompt-description">
              Adiciona a aplicação ao ecrã inicial para acesso rápido.
            </p>
            <div className="admin-install-prompt-actions">
              <button
                type="button"
                onClick={async () => {
                  if (!deferred) return;
                  await deferred.prompt();
                  const choice = await deferred.userChoice;
                  if (choice.outcome === 'accepted') setInstalled(true);
                  setDeferred(null);
                }}
                className="primary-button admin-install-prompt-button"
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="secondary-button admin-install-prompt-button"
              >
                Agora não
              </button>
            </div>
          </div>
          <button type="button" className="admin-install-prompt-close" onClick={() => setDismissed(true)} aria-label="Fechar">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  }

  if (ios) {
    return (
      <aside className="admin-install-prompt" aria-label="Instalar Feedbook Admin">
        <div className="admin-install-prompt-layout">
          <Share className="admin-install-prompt-icon" aria-hidden="true" />
          <div className="admin-install-prompt-body">
            <p className="admin-install-prompt-title">Instalar Feedbook Admin</p>
            {showIosHelp ? (
              <ol className="admin-install-prompt-instructions">
                <li>Toque no ícone de Partilhar do Safari.</li>
                <li>Escolha "Adicionar ao Ecrã Principal".</li>
                <li>Confirme com "Adicionar".</li>
              </ol>
            ) : (
              <p className="admin-install-prompt-description">
                No iPhone, use o menu Partilhar do Safari para adicionar ao ecrã principal.
              </p>
            )}
            <div className="admin-install-prompt-actions">
              <button
                type="button"
                onClick={() => setShowIosHelp((v) => !v)}
                className="primary-button admin-install-prompt-button"
              >
                {showIosHelp ? 'Ocultar instruções' : 'Ver instruções'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="secondary-button admin-install-prompt-button"
              >
                Fechar
              </button>
            </div>
          </div>
          <button type="button" className="admin-install-prompt-close" onClick={() => setDismissed(true)} aria-label="Fechar">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>
    );
  }

  // Desktop sem beforeinstallprompt disponível: não mostrar botão falso
  return null;
}