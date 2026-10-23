import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Bell, RefreshCw } from 'lucide-react';

type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'pending';

type DiagnosticItem = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
};

type AdminSetupDiagnosticsProps = {
  token: string;
  userId: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const STATUS_CLASS: Record<DiagnosticStatus, string> = {
  ok: 'admin-diagnostic-status-ok',
  warning: 'admin-diagnostic-status-warning',
  error: 'admin-diagnostic-status-error',
  pending: 'admin-diagnostic-status-pending',
};

export default function AdminSetupDiagnostics({ token, userId }: AdminSetupDiagnosticsProps) {
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [overall, setOverall] = useState<'ready' | 'needs_permission' | 'needs_config' | 'unavailable'>('needs_config');
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [message, setMessage] = useState('');

  async function runDiagnostics() {
    setLoading(true);
    setMessage('');
    const next: DiagnosticItem[] = [];

    let swRegistration: ServiceWorkerRegistration | null = null;
    if ('serviceWorker' in navigator) {
      try {
        const found = await navigator.serviceWorker.getRegistration('/admin');
swRegistration = found ?? (await navigator.serviceWorker.getRegistration()) ?? null;
        next.push({
          id: 'sw',
          label: 'Service Worker (escopo /admin)',
          status: swRegistration ? 'ok' : 'warning',
          detail: swRegistration ? 'Registado e disponível.' : 'Ainda não registado; será registado ao carregar /admin.',
        });
      } catch {
        next.push({ id: 'sw', label: 'Service Worker (escopo /admin)', status: 'error', detail: 'Não foi possível verificar o registo.' });
      }
    } else {
      next.push({ id: 'sw', label: 'Service Worker (escopo /admin)', status: 'error', detail: 'Browser não suporta Service Worker.' });
    }

    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    let manifestStatus: DiagnosticStatus = 'warning';
    let manifestDetail = 'Manifest não encontrado no head.';
    if (manifestLink?.href) {
      try {
        const response = await fetch(manifestLink.href, { cache: 'no-store' });
        if (response.ok) {
          const json = await response.json();
          manifestStatus = json?.name && json?.icons?.length ? 'ok' : 'warning';
          manifestDetail = manifestStatus === 'ok' ? 'Manifest válido e com ícones.' : 'Manifest incompleto (nome/ícones).';
        } else {
          manifestDetail = `Manifest respondeu com ${response.status}.`;
        }
      } catch {
        manifestDetail = 'Não foi possível carregar o manifest.';
      }
    }
    next.push({ id: 'manifest', label: 'Manifest PWA', status: manifestStatus, detail: manifestDetail });

    next.push({
      id: 'auth',
      label: 'Autenticação admin',
      status: token ? 'ok' : 'error',
      detail: token ? 'Sessão admin ativa.' : 'Sem token de sessão.',
    });

    let permissionStatus: DiagnosticStatus = 'warning';
    let permissionDetail = 'API de notificações não suportada.';
    if ('Notification' in window) {
      const permission = Notification.permission;
      permissionStatus = permission === 'granted' ? 'ok' : permission === 'denied' ? 'error' : 'warning';
      permissionDetail = permission === 'granted' ? 'Permissão concedida.' : permission === 'denied' ? 'Permissão bloqueada no browser.' : 'Permissão ainda não pedida.';
    }
    next.push({ id: 'permission', label: 'Permissão de notificações', status: permissionStatus, detail: permissionDetail });

    let vapidPublicKey = '';
    try {
      const response = await fetch('/api/push/config');
      if (response.ok) {
        const json = await response.json();
        vapidPublicKey = String(json?.publicKey || '');
        next.push({
          id: 'config',
          label: 'Configuração Web Push (backend)',
          status: vapidPublicKey ? 'ok' : 'warning',
          detail: vapidPublicKey ? 'Chave pública VAPID disponível.' : 'Backend sem VAPID configurado.',
        });
      } else {
        next.push({ id: 'config', label: 'Configuração Web Push (backend)', status: 'warning', detail: 'Endpoint /api/push/config indisponível.' });
      }
    } catch {
      next.push({ id: 'config', label: 'Configuração Web Push (backend)', status: 'warning', detail: 'Não foi possível contactar o backend.' });
    }

    let subscriptionStatus: DiagnosticStatus = 'warning';
    let subscriptionDetail = 'Sem subscrição ativa.';
    if (swRegistration && 'pushManager' in swRegistration) {
      try {
        const existing = await swRegistration.pushManager.getSubscription();
        if (existing) {
          subscriptionStatus = 'ok';
          subscriptionDetail = 'Subscrição Web Push ativa.';
        }
      } catch {
        subscriptionDetail = 'Não foi possível verificar subscrição.';
      }
    }
    next.push({ id: 'subscription', label: 'Subscrição Web Push', status: subscriptionStatus, detail: subscriptionDetail });

    setItems(next);

    const hasError = next.some((item) => item.status === 'error');
    const permission = next.find((item) => item.id === 'permission')?.status;
    const config = next.find((item) => item.id === 'config')?.status;
    const subscription = next.find((item) => item.id === 'subscription')?.status;

    if (hasError && permission === 'error') setOverall('unavailable');
    else if (permission !== 'ok') setOverall('needs_permission');
    else if (config !== 'ok' || subscription !== 'ok') setOverall('needs_config');
    else setOverall('ready');

    (window as any).__feedbookVapidPublicKey = vapidPublicKey;
    setHasRun(true);
    setLoading(false);
  }

  useEffect(() => {
    void runDiagnostics();
  }, [token]);

  useEffect(() => {
    if (!hasRun) return;
    setExpanded(overall !== 'ready');
  }, [overall, hasRun]);

  async function enablePush() {
    setPushLoading(true);
    setMessage('');
    try {
      if (!('Notification' in window)) throw new Error('Notificações não suportadas.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = String((window as any).__feedbookVapidPublicKey || '');
      if (!vapidPublicKey) throw new Error('Chave VAPID não disponível. Configura VAPID_PUBLIC_KEY no backend.');

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, subscription }),
      });
      if (!response.ok) throw new Error('Falha ao guardar subscrição no backend.');

      setMessage('Notificações ativadas com sucesso.');
      await runDiagnostics();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao ativar notificações.');
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <>
      <div className="admin-diagnostics-header">
        <div className="admin-diagnostics-title">
          <h3 className="text-[11px] font-semibold text-[var(--text-main)]">Diagnóstico de configuração</h3>
          {overall === 'ready' ? (
            <CheckCircle2 className="h-3.5 w-3.5 admin-diagnostic-status-ok" />
          ) : (
            <AlertTriangle className={`h-3.5 w-3.5 ${overall === 'unavailable' ? 'admin-diagnostic-status-error' : 'admin-diagnostic-status-warning'}`} />
          )}
        </div>
        <div className="admin-diagnostics-actions">
          <button
            type="button"
            onClick={() => void runDiagnostics()}
            disabled={loading}
            className="secondary-button"
            style={{ padding: '4px 8px', fontSize: '10px' }}
          >
            <RefreshCw className="mr-1 inline h-2.5 w-2.5" />
            {loading ? 'A verificar...' : 'Reverificar'}
          </button>
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={pushLoading || overall === 'unavailable'}
            className="primary-button"
            style={{ padding: '4px 8px', fontSize: '10px' }}
          >
            <Bell className="mr-1 inline h-2.5 w-2.5" />
            {pushLoading ? 'A ativar...' : 'Ativar notificações'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="card flex items-start gap-1.5" style={{ padding: '6px', borderRadius: '8px', boxShadow: 'none' }}>
              {item.status === 'ok' ? (
                <CheckCircle2 className={`mt-0.5 h-3 w-3 ${STATUS_CLASS[item.status]}`} />
              ) : (
                <AlertTriangle className={`mt-0.5 h-3 w-3 ${STATUS_CLASS[item.status]}`} />
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[var(--text-main)]">{item.label}</p>
                <p className="text-[9px] text-[var(--text-muted)]">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[9px] text-[var(--text-muted)]"
        >
          {expanded ? 'Ocultar' : 'Ver detalhes'}
        </button>
      </div>

      {message ? <p className="mt-1 text-[10px] text-[var(--text-muted)]">{message}</p> : null}

      <p className="mt-1 text-[9px] text-[var(--text-muted)]">
        As permissões do browser só são pedidas após clicar em “Ativar notificações”. Nenhuma permissão protegida é concedida automaticamente.
      </p>
    </>
  );
}
