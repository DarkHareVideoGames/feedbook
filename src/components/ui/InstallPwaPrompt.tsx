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
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#1a1d24] p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-white" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Instalar Feedbook Admin</p>
            <p className="mt-1 text-xs text-white/70">
              Adiciona a aplicação ao ecrã inicial para acesso rápido.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!deferred) return;
                  await deferred.prompt();
                  const choice = await deferred.userChoice;
                  if (choice.outcome === 'accepted') setInstalled(true);
                  setDeferred(null);
                }}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#12141a]"
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80"
              >
                Agora não
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Fechar">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>
      </div>
    );
  }

  if (ios) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#1a1d24] p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <Share className="mt-0.5 h-5 w-5 shrink-0 text-white" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Instalar Feedbook Admin</p>
            {showIosHelp ? (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-white/70">
                <li>Toque no ícone de Partilhar do Safari.</li>
                <li>Escolha "Adicionar ao Ecrã Principal".</li>
                <li>Confirme com "Adicionar".</li>
              </ol>
            ) : (
              <p className="mt-1 text-xs text-white/70">
                No iPhone, use o menu Partilhar do Safari para adicionar ao ecrã principal.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowIosHelp((v) => !v)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#12141a]"
              >
                {showIosHelp ? 'Ocultar instruções' : 'Ver instruções'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80"
              >
                Fechar
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Fechar">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>
      </div>
    );
  }

  // Desktop sem beforeinstallprompt disponível: não mostrar botão falso
  return null;
}