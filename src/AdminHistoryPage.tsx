import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, MessageCircle, Wallet } from 'lucide-react';
import * as api from './api';

type Role = 'superuser' | 'admin' | 'collaborator' | 'technician';

type StaffFunction =
  | 'diretor-producao'
  | 'diretor-tecnico'
  | 'produtor-executivo'
  | 'gestor-operativo'
  | 'gestor-manutencao'
  | 'tecnico';

const staffFunctionLabels: Record<StaffFunction, string> = {
  'diretor-producao': 'Diretor de Produção',
  'diretor-tecnico': 'Diretor Técnico',
  'produtor-executivo': 'Produtor Executivo',
  'gestor-operativo': 'Gestor Operativo',
  'gestor-manutencao': 'Gestor de Manutenção',
  tecnico: 'Técnico',
};

const roleLabel: Record<Role, string> = {
  superuser: 'Superuser',
  admin: 'Admin',
  collaborator: 'Colab',
  technician: 'Técnico',
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  function: StaffFunction | null;
  createdAt: string;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

type PastBooking = {
  id: string;
  roomName: string;
  roomId?: string;
  status: BookingStatus;
  date: string;
  time: string;
  duration: number;
  participants?: number;
  bandName: string;
  contactName: string;
  contactPhone?: string;
  email: string;
  paymentMethod?: 'on-site';
  paymentStatus?: string;
  amount?: number;
  extras?: string[];
  assignedCollaborator?: {
    id: string;
    name: string;
  };
  confirmedBy?: { id: string; name: string; role: string; at: string };
  rejectedBy?: { id: string; name: string; role: string; at: string };
  cancelledBy?: { id: string; name: string; role: string; at: string };
  refundedBy?: { id: string; name: string; role: string; at: string };
  rescheduledBy?: { id: string; name: string; role: string; at: string };
  paymentConfirmedBy?: { id: string; name: string; role: string; at: string };
  paymentConfirmedAt?: string;
};

type FinanceBooking = {
  id: string;
  bandName: string;
  roomName: string;
  date: string;
  amount: number;
  paymentStatus: string;
  extras?: string[];
  extrasBreakdown?: Array<{ key: string; amount: number }>;
  confirmedBy?: { id: string; name: string; role: string; at: string };
};

type FinanceMonthSummary = {
  month: string;
  totalReceived: number;
  totalRefunded: number;
  netTotal: number;
  bookingCount: number;
  bookings: FinanceBooking[];
};

const TOKEN_KEY = 'feedbook-admin-token';

const statusLabel: Record<BookingStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
};

// Filtros da lista de historico, pela ordem apresentada na UI.
const HISTORY_FILTER_OPTIONS: Array<{ value: HistoryFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Por confirmar' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'rejected', label: 'Desmarcados' },
  { value: 'rescheduled', label: 'Reagendados' },
  { value: 'cancelled', label: 'Anulados' },
];

// Escopos de arquivo: limitam registos passados; futuro/hoje fica sempre visivel.
const PERIOD_SCOPE_OPTIONS: Array<{ value: PeriodScope; label: string }> = [
  { value: 'month', label: 'Mes corrente' },
  { value: '3m', label: 'Ultimos 3 meses' },
  { value: '6m', label: 'Ultimos 6 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Tudo' },
];

type HistoryFilter = 'all' | 'pending' | 'confirmed' | 'rescheduled' | 'cancelled' | 'rejected';

// Escopo temporal: limita quantos registos passados sao mostrados.
// Futuro/hoje fica sempre visivel; 'all' mostra o historico completo.
type PeriodScope = 'month' | '3m' | '6m' | 'year' | 'all';

type AdminPanel = 'unified' | 'users' | 'rooms' | 'services';

type NewUserDraft = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  function: StaffFunction | null;
};

type EditUserDraft = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  function: StaffFunction | null;
};

type RoomFormDraft = {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
  maxMembers: string;
  pricePerMemberHour: string;
  imageUrl: string;
  gear: string;
  gearEn: string;
  accent: string;
  active: boolean;
};

type ServiceFormDraft = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  price: string;
  active: boolean;
};

const emptyRoomForm: RoomFormDraft = {
  id: '',
  name: '',
  description: '',
  descriptionEn: '',
  maxMembers: '4',
  pricePerMemberHour: '',
  imageUrl: '',
  gear: '',
  gearEn: '',
  accent: 'var(--room-red)',
  active: true,
};

const emptyServiceForm: ServiceFormDraft = {
  id: '',
  name: '',
  nameEn: '',
  description: '',
  price: '',
  active: true,
};

function roomToForm(room: api.ApiRoom): RoomFormDraft {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    descriptionEn: room.descriptionEn,
    maxMembers: String(room.maxMembers),
    pricePerMemberHour:
      room.pricePerMemberHour === null || room.pricePerMemberHour === undefined ? '' : String(room.pricePerMemberHour),
    imageUrl: room.imageUrl ?? '',
    gear: (room.gear ?? []).join('\n'),
    gearEn: (room.gearEn ?? []).join('\n'),
    accent: room.accent || 'var(--room-red)',
    active: room.active !== false,
  };
}

function serviceToForm(service: api.ApiService): ServiceFormDraft {
  return {
    id: service.id,
    name: service.name,
    nameEn: service.nameEn,
    description: service.description,
    price: String(service.price),
    active: service.active !== false,
  };
}

type RescheduleDraft = {
  bookingId: string;
  date: string;
  time: string;
  duration: string;
};

type PaymentDraft = {
  bookingId: string;
  // Valor esperado (string para edicao no input) e valor recebido confirmado.
  expected: string;
  received: string;
};

function isPastConfirmed(booking: PastBooking): boolean {
  if (booking.status !== 'confirmed') return false;
  const d = new Date(`${booking.date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function isFutureOrTodayConfirmed(booking: PastBooking): boolean {
  if (booking.status !== 'confirmed') return false;
  const d = new Date(`${booking.date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function canReschedule(booking: PastBooking): boolean {
  const payment = String(booking.paymentStatus || '').toLowerCase();
  return booking.status !== 'cancelled' && booking.status !== 'rejected' && payment !== 'refunded';
}

function formatContactPhone(phone?: string): string {
  return String(phone || '').trim().replace(/^(?:\+|00)351[\s.-]*/, '');
}

// O checkmark de WhatsApp so faz sentido enquanto existir uma acao que notifica o
// cliente (confirmar/desmarcar/reagendar/anular). Desaparece nos estados terminais:
// desmarcado, anulado, devolvido ou pagamento ja recebido.
function podeUsarCheckmarkWhatsApp(booking: PastBooking): boolean {
  const payment = String(booking.paymentStatus || '').toLowerCase();
  if (booking.status === 'cancelled') return false;
  if (booking.status === 'rejected') return false;
  if (payment === 'refunded') return false;
  if (payment === 'received' || payment === 'paid') return false;
  if (booking.status === 'pending') return true;
  return isFutureOrTodayConfirmed(booking);
}

function bookingMainTag(booking: PastBooking): { label: string; tone: string } {
  if (booking.status === 'pending') return { label: 'Por confirmar', tone: 'state-pending' };
  if (booking.status === 'cancelled') return { label: 'Anulado', tone: 'state-cancelled' };
  if (booking.status === 'rejected') return { label: 'Desmarcado', tone: 'state-rejected' };
  if (isPastConfirmed(booking)) return { label: 'Passado', tone: 'state-past' };
  if (booking.status === 'confirmed') return { label: 'Confirmado', tone: 'state-confirmed' };
  return { label: statusLabel[booking.status] || booking.status, tone: 'state-pending' };
}

function bookingSortRank(booking: PastBooking): number {
  if (booking.status === 'pending') return 0;
  if (isFutureOrTodayConfirmed(booking)) return 1;
  if (isPastConfirmed(booking)) return 2;
  if (booking.status === 'cancelled') return 3;
  if (booking.status === 'rejected') return 4;
  return 5;
}

function bookingDateTimeValue(booking: PastBooking): number {
  const dt = new Date(`${booking.date}T${booking.time || '00:00'}:00`);
  return Number.isNaN(dt.getTime()) ? Number.MAX_SAFE_INTEGER : dt.getTime();
}

// Inicio do escopo temporal: regimentos anteriores a esta data sao ocultados.
// Registos futuros/hoje nunca sao ocultados por este escopo.
function periodScopeStart(scope: PeriodScope): Date | null {
  if (scope === 'all') return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (scope === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (scope === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }

  const monthsBack = scope === '6m' ? 6 : 3;
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  return start;
}

function isWithinPeriodScope(booking: PastBooking, scope: PeriodScope): boolean {
  const start = periodScopeStart(scope);
  if (!start) return true;

  const bookingDate = new Date(`${booking.date}T00:00:00`);
  if (Number.isNaN(bookingDate.getTime())) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Futuro e hoje ficam sempre visiveis; so limitamos o passado.
  if (bookingDate >= today) return true;

  return bookingDate >= start;
}

function summarizeFinanceEntries(entries: FinanceBooking[], extractor: (entry: FinanceBooking) => string) {
  const totals = new Map<string, { total: number; count: number }>();

  for (const entry of entries) {
    const label = extractor(entry).trim() || 'Sem identificação';
    const current = totals.get(label) || { total: 0, count: 0 };
    current.total += Number(entry.amount || 0);
    current.count += 1;
    totals.set(label, current);
  }

  return Array.from(totals.entries())
    .map(([name, summary]) => ({ name, total: summary.total, count: summary.count }))
    .sort((left, right) => right.total - left.total);
}

function financeRoomTone(roomName: string): string {
  const normalized = String(roomName || '').toLowerCase();
  if (normalized.includes('red')) return 'finance-room-red';
  if (normalized.includes('grey') || normalized.includes('gray')) return 'finance-room-grey';
  return 'finance-room-neutral';
}

function roomToneClass(booking: PastBooking): string {
  const id = booking.roomId || '';
  if (id === 'sala-red') return 'room-tone-red';
  if (id === 'sala-grey') return 'room-tone-grey';

  const roomName = String(booking.roomName || '').toLowerCase();
  if (roomName.includes('red')) return 'room-tone-red';
  if (roomName.includes('grey') || roomName.includes('gray')) return 'room-tone-grey';
  return '';
}

function formatFinanceMonthLabel(monthKey: string): string {
  const raw = String(monthKey || '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return raw;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return raw;

  const label = new Intl.DateTimeFormat('pt-PT', {
    month: 'long',
    year: 'numeric',
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDateDayMonthYear(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

// Data no formato Dia/Mês/Ano + dia da semana, ex.: "14/05/2024 (Ter)".
function formatDateWithWeekday(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;

  const datePart = new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
  const weekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' }).format(parsed);

  return `${datePart} (${weekday})`;
}

function formatExtraLabel(extraKey: string): string {
  const normalized = String(extraKey || '').trim();
  if (!normalized) return 'Sem extra';

  const knownLabels: Record<string, string> = {
    engineer: 'Tecnico de sessao',
    recording: 'Captacao stereo',
    backline: 'Backline',
  };

  if (knownLabels[normalized]) return knownLabels[normalized];
  return normalized
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getPdfRoomPalette(roomName: string): { header: [number, number, number]; stripe: [number, number, number]; text: [number, number, number] } {
  const normalized = String(roomName || '').toLowerCase();
  if (normalized.includes('red')) {
    return {
      header: [233, 172, 172],
      stripe: [253, 244, 244],
      text: [127, 29, 29],
    };
  }

  if (normalized.includes('grey') || normalized.includes('gray')) {
    return {
      header: [186, 193, 204],
      stripe: [246, 248, 251],
      text: [51, 65, 85],
    };
  }

  return {
    header: [173, 206, 246],
    stripe: [242, 249, 255],
    text: [30, 64, 175],
  };
}

function normalizarNumeroWhatsApp(numero: string): string {
  return String(numero || '').replace(/\D/g, '');
}

type TipoMensagemWhatsApp = 'confirm' | 'cancel' | 'refund' | 'reschedule';

function abrirWhatsAppMensagem(
  booking: PastBooking,
  colaboradorNome: string,
  tipo: TipoMensagemWhatsApp,
  overrides?: { date?: string; time?: string; duration?: number },
): boolean {
  const numeroNormalizado = normalizarNumeroWhatsApp(booking.contactPhone || '');
  if (!numeroNormalizado) {
    return false;
  }

  const nomeContato = booking.contactName || booking.bandName || 'Utilizador';
  const data = overrides?.date || booking.date;
  const hora = overrides?.time || booking.time;
  const duracao = overrides?.duration ?? booking.duration;

  const contexto = [
    `Data: ${data}`,
    `Hora: ${hora}`,
    `Sala: ${booking.roomName}`,
    `Duração: ${duracao}h`,
  ];

  let corpo = '';
  if (tipo === 'confirm') {
    corpo = [
      `O meu nome é ${colaboradorNome}.`,
      `A marcação da banda ${booking.bandName || nomeContato} foi confirmada com sucesso.`,
      'Vamos preparar a sessão com todo o material e equipa necessários.',
    ].join('\n');
  }

  if (tipo === 'cancel') {
    corpo = [
      `O meu nome é ${colaboradorNome}.`,
      `A marcação da banda ${booking.bandName || nomeContato} foi anulada pela equipa.`,
      'Se quiseres, podemos ajudar a reagendar para outro horário.',
    ].join('\n');
  }

  if (tipo === 'refund') {
    corpo = [
      `O meu nome é ${colaboradorNome}.`,
      `Foi registada a devolução do pagamento da banda ${booking.bandName || nomeContato}.`,
      'Se precisares de ajuda adicional, estamos disponíveis.',
    ].join('\n');
  }

  if (tipo === 'reschedule') {
    corpo = [
      `O meu nome é ${colaboradorNome}.`,
      `A marcação da banda ${booking.bandName || nomeContato} foi reagendada para ${data} às ${hora}.`,
      `Duração: ${duracao}h.`,
      'Se houver qualquer ajuste, entra em contacto connosco.',
    ].join('\n');
  }

  const mensagem = [`Olá ${nomeContato}!`, corpo, ...contexto, 'Obrigado por escolheres o Feedback - Ensaios.'].join('\n');
  const linkWhatsApp = `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensagem)}`;
  window.open(linkWhatsApp, '_blank', 'noopener,noreferrer');
  return true;
}

function consegueAbrirWhatsApp(booking: PastBooking): boolean {
  return normalizarNumeroWhatsApp(booking.contactPhone || '').length > 0;
}

function AdminHistoryPage() {
  const [bookings, setBookings] = useState<PastBooking[]>([]);
  const [adminLogoVisible, setAdminLogoVisible] = useState(true);
  const [betaEnabled, setBetaEnabled] = useState(true);
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('admin@feedbook.local');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [viewFilter, setViewFilter] = useState<HistoryFilter>('all');
  // Escopo de arquivo: por defeito limita ao mes corrente para nao
  // acumular uma lista interminavel. O admin pode alargar ate "Tudo".
  const [periodScope, setPeriodScope] = useState<PeriodScope>('month');
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft | null>(null);
  // Modal de confirmacao de pagamento (substitui o window.confirm nativo):
  // mostra o valor esperado e deixa confirmar/ajustar o valor recebido.
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  // Opt-in por marcacao: so abre o WhatsApp quando o checkmark esta ativo.
  const [whatsappOptIn, setWhatsappOptIn] = useState<Record<string, boolean>>({});
  // Escolha do responsavel pelo ensaio (apenas admin/superuser escolhe no dropdown).
  const [assigneeChoice, setAssigneeChoice] = useState<Record<string, string>>({});
  const [financeData, setFinanceData] = useState<FinanceMonthSummary[]>([]);
  const [financeExtrasCatalog, setFinanceExtrasCatalog] = useState<Record<string, number>>({});
  const [showFinance, setShowFinance] = useState(false);
  const [activePanel, setActivePanel] = useState<AdminPanel>('unified');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<api.ApiRoom[]>([]);
  const [services, setServices] = useState<api.ApiService[]>([]);
  const [globalRate, setGlobalRate] = useState('');
  const [roomForm, setRoomForm] = useState<RoomFormDraft>(emptyRoomForm);
  const [roomImageFile, setRoomImageFile] = useState<File | null>(null);
  const [roomImageUploading, setRoomImageUploading] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormDraft>(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [clearBookingsLoading, setClearBookingsLoading] = useState(false);
  const [clearBookingsModalOpen, setClearBookingsModalOpen] = useState(false);
  const [clearBookingsConfirmation, setClearBookingsConfirmation] = useState('');
  const [extrasVisible, setExtrasVisible] = useState<Record<string, boolean>>({});
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'collaborator',
    function: null,
  });
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft | null>(null);
  // Superuser e admin têm acesso total (utilizadores, salas, serviços, preços, contas).
  const isPrivilegedRole = (role: Role | null | undefined) => role === 'admin' || role === 'superuser';
  const isPrivileged = isPrivilegedRole(currentUser?.role);
  const isSuperuser = currentUser?.role === 'superuser';
  const toggleBetaMode = async () => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || actionLoading['beta']) return;
    const nextEnabled = !betaEnabled;
    // Atualiza de imediato (otimista) e persiste no Supabase (estado global).
    setBetaEnabled(nextEnabled);
    setError('');
    try {
      await withActionLock('beta', async () => {
        await api.updateAppSettings(sessionToken, { betaEnabled: nextEnabled });
      });
    } catch (err) {
      // Reverte em caso de falha para não divergir do servidor.
      setBetaEnabled(!nextEnabled);
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel atualizar o modo Beta.');
    }
  };
  // Dropdown "Perfil": apenas Administradores e Colaboradores.
  // O superuser não é escolhível (é detetado pelo login) e "Técnico" passou para o campo Função.
  // Em edição, um perfil legado (technician/superuser) mantém-se como opção para não
  // alterar silenciosamente o role ao guardar.
  const baseRoleOptions: { value: Role; label: string }[] = [
    { value: 'admin', label: 'Administradores' },
    { value: 'collaborator', label: 'Colaboradores' },
  ];
  const selectedRole = editUserDraft ? editUserDraft.role : newUserDraft.role;
  const roleOptions = baseRoleOptions.some((option) => option.value === selectedRole)
    ? baseRoleOptions
    : [...baseRoleOptions, { value: selectedRole, label: roleLabel[selectedRole] }];

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const paymentStatusLabel = (booking: PastBooking) => {
    const status = String(booking.paymentStatus || '').toLowerCase();
    if (status === 'refunded') return 'Devolvido';
    // Ensaio desmarcado/anulado sem pagamento recebido: o pagamento fica sem efeito.
    if ((booking.status === 'rejected' || booking.status === 'cancelled') && status !== 'received') {
      return 'Sem efeito';
    }
    if (status === 'paid' || status === 'received') return 'Recebido';
    if (status === 'pay-on-site') return 'No local';
    if (status === 'pending_mbway' || status === 'pending-mbway' || status === 'pending_confirmation' || status === 'pending-confirmation' || status === 'pending') {
      return 'Pendente';
    }

    return booking.paymentStatus || '-';
  };

  const paymentStatusTone = (booking: PastBooking) => {
    const status = String(booking.paymentStatus || '').toLowerCase();
    if (status === 'refunded') return 'status-refunded';
    if ((booking.status === 'rejected' || booking.status === 'cancelled') && status !== 'received') {
      return 'status-void';
    }
    if (status === 'paid' || status === 'received' || status === 'pay-on-site') return 'status-paid';
    return 'status-pending';
  };

  // Checkmark reutilizavel: ativa o envio de WhatsApp ao confirmar/desmarcar/reagendar.
  const renderWhatsAppOptIn = (bookingId: string, canSend: boolean) => {
    const active = Boolean(whatsappOptIn[bookingId]);
    return (
      <button
        type="button"
        className={`wa-optin ${active ? 'wa-optin-active' : ''}`}
        aria-pressed={active}
        aria-label={active ? 'Enviar mensagem por WhatsApp' : 'Não enviar mensagem por WhatsApp'}
        title={
          canSend
            ? 'Enviar tambem mensagem por WhatsApp ao confirmar/desmarcar/reagendar'
            : 'Sem telemovel valido para WhatsApp'
        }
        disabled={!canSend || Boolean(actionLoading[bookingId])}
        onClick={() =>
          setWhatsappOptIn((prev) => ({ ...prev, [bookingId]: !active }))
        }
      >
        <MessageCircle aria-hidden="true" size={14} strokeWidth={2.25} />
        <span>WhatsApp</span>
        {active ? <Check aria-hidden="true" size={13} strokeWidth={2.5} /> : null}
      </button>
    );
  };

  // Dropdown de responsavel pelo ensaio — visivel apenas para admin/superuser.
  // Mostra todos os utilizadores registados, por defeito o proprio admin logado.
  const renderAssigneeSelect = (booking: PastBooking) => {
    if (!isPrivileged || booking.status !== 'pending') return null;
    if (!currentUser) return null;

    const selectedId = assigneeChoice[booking.id] || currentUser.id;

    return (
      <label className="assignee-select-wrap" title="Quem ira assegurar o ensaio">
        <span className="assignee-select-label">Assegura:</span>
        <select
          className="assignee-select"
          value={selectedId}
          disabled={Boolean(actionLoading[booking.id])}
          onChange={(event) =>
            setAssigneeChoice((prev) => ({ ...prev, [booking.id]: event.target.value }))
          }
        >
          {!users.some((user) => user.id === currentUser.id) ? (
            <option value={currentUser.id}>{currentUser.name}</option>
          ) : null}
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
    );
  };

  // Chip de estado com o responsavel atribuido, ex.: "Confirmado" + "Ana" (badge do tom).
  const renderStatusWithAssignee = (booking: PastBooking) => {
    const tag = bookingMainTag(booking);
    const assignee = booking.assignedCollaborator?.name;

    return (
      <span className="status-stack">
        <span className={`status-chip ${tag.tone}`}>{tag.label}</span>
        {assignee ? (
          <span className={`status-assignee-chip ${tag.tone}`}>{assignee}</span>
        ) : null}
      </span>
    );
  };

  const canConfirmPaymentReceipt = (booking: PastBooking) => {
    if (
      currentUser?.role !== 'superuser' &&
      currentUser?.role !== 'admin' &&
      currentUser?.role !== 'collaborator' &&
      currentUser?.role !== 'technician'
    ) {
      return false;
    }

    const paymentStatus = String(booking.paymentStatus || '').toLowerCase();
    return booking.status === 'confirmed' && paymentStatus !== 'received' && paymentStatus !== 'refunded';
  };

  const filteredBookings = useMemo(() => {
    let scoped: PastBooking[];

    if (viewFilter === 'pending') {
      scoped = bookings.filter((booking) => booking.status === 'pending');
    } else if (viewFilter === 'confirmed') {
      scoped = bookings.filter((booking) => isFutureOrTodayConfirmed(booking));
    } else if (viewFilter === 'rejected') {
      scoped = bookings.filter((booking) => booking.status === 'rejected');
    } else if (viewFilter === 'rescheduled') {
      scoped = bookings.filter((booking) => Boolean(booking.rescheduledBy));
    } else if (viewFilter === 'cancelled') {
      scoped = bookings.filter((booking) => booking.status === 'cancelled');
    } else {
      scoped = bookings;
    }

    // Escopo de arquivo: oculta registos passados antigos para a lista nao
    // ficar interminavel. Aplica-se a todos os filtros (inclusive "Todos").
    const withinScope = scoped.filter((booking) => isWithinPeriodScope(booking, periodScope));

    return [...withinScope].sort((a, b) => {
      const rankDiff = bookingSortRank(a) - bookingSortRank(b);
      if (rankDiff !== 0) return rankDiff;

      const timeDiff = bookingDateTimeValue(a) - bookingDateTimeValue(b);
      if (timeDiff !== 0) return timeDiff;

      return a.id.localeCompare(b.id);
    });
  }, [bookings, viewFilter, periodScope]);

  const historyCountLabel = filteredBookings.length === 1 ? '1 registo' : `${filteredBookings.length} registos`;

  const loadHistory = async (token: string) => {
    try {
      const payload = await api.adminBookings(token);
      setBookings(payload.bookings as PastBooking[]);
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 403) {
        // Sessao valida mas sem permissoes — nao e uma sessao expirada.
        setError('Sem permissoes para aceder aos ensaios. Contacta o administrador.');
        return;
      }
      if (err instanceof api.ApiError && err.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setCurrentUser(null);
        setBookings([]);
        setAuthError('Sessao expirada. Inicia sessao novamente.');
        return;
      }
      throw err;
    }
  };

  const loadFinance = async (token: string) => {
    try {
      const payload = await api.adminFinance(token);
      setFinanceData((payload.months || []) as FinanceMonthSummary[]);

      if (payload.extrasCatalog && Object.keys(payload.extrasCatalog).length > 0) {
        setFinanceExtrasCatalog(payload.extrasCatalog);
        return;
      }

      try {
        const pricingPayload = await api.pricing();
        setFinanceExtrasCatalog(pricingPayload.pricing?.extras || {});
      } catch {
        setFinanceExtrasCatalog({});
      }
    } catch (err) {
      if (err instanceof api.ApiError && (err.status === 401 || err.status === 403)) {
        setFinanceData([]);
        return;
      }
      throw err;
    }
  };

  const loadCatalogs = async () => {
    setCatalogLoading(true);
    try {
      const [roomsPayload, servicesPayload, pricingPayload] = await Promise.all([
        api.listRooms({ includeInactive: true }),
        api.listServices({ includeInactive: true }),
        api.pricing().catch(() => null),
      ]);
      setRooms(roomsPayload.rooms);
      setServices(servicesPayload.services);
      if (pricingPayload?.pricing) {
        setGlobalRate(String(pricingPayload.pricing.perMemberPerHour));
      }
    } catch {
      setError('Nao foi possivel carregar salas e servicos. Confirma que correste o supabase_rooms_services.sql.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadUsers = async (sessionToken: string) => {
    if (!sessionToken) return;
    setUsersLoading(true);
    try {
      const payload = await api.adminUsers(sessionToken);
      setUsers(payload.users as AuthUser[]);
    } catch (err) {
      if (err instanceof api.ApiError && (err.status === 401 || err.status === 403)) {
        setUsers([]);
        return;
      }
      setError('Nao foi possivel carregar utilizadores.');
    } finally {
      setUsersLoading(false);
    }
  };

  const restoreSession = async (sessionToken: string) => {
    try {
      const payload = await api.me(sessionToken);
      setCurrentUser(payload.user);
      setAuthError('');

      if (isPrivilegedRole(payload.user.role)) {
        await Promise.all([loadFinance(sessionToken), loadCatalogs(), loadUsers(sessionToken)]);
      }
    } catch (_error) {
      throw new Error('Session expired');
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setError('');

    try {
      const payload = await api.login(loginEmail, loginPassword);
      window.localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
      setCurrentUser(payload.user);
      await loadHistory(payload.token);
      if (isPrivilegedRole(payload.user.role)) {
        await Promise.all([loadFinance(payload.token), loadCatalogs(), loadUsers(payload.token)]);
      }
    } catch (authErr) {
      if (authErr instanceof Error && authErr.message) {
        setAuthError(authErr.message);
      } else {
        setAuthError('Credenciais invalidas.');
      }
    }
  };

  const handleLogout = () => {
    if (token) {
      void api.logout();
    }

    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setCurrentUser(null);
    setBookings([]);
    setError('');
    setAuthError('');
    setActivePanel('unified');
    setCatalogNotice('');
    setUsers([]);
    setNewUserDraft({ name: '', email: '', password: '', phone: '', role: 'collaborator', function: null });
    setEditUserDraft(null);
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged || userActionLoading) return;

    const name = newUserDraft.name.trim();
    const email = newUserDraft.email.trim().toLowerCase();
    const phone = newUserDraft.phone.trim();
    const password = newUserDraft.password;

    if (!name || !email || !phone) {
      setError('Preenche nome, email e telemovel para criar o utilizador.');
      return;
    }
    if (password && password.length < 6) {
      setError('A password precisa de pelo menos 6 caracteres.');
      return;
    }

    setCatalogNotice('');
    setError('');
    setUserActionLoading(true);
    try {
      await api.createUser(sessionToken, { name, email, password, phone, role: newUserDraft.role, function: newUserDraft.function });
      setNewUserDraft({ name: '', email: '', password: '', phone: '', role: 'collaborator', function: null });
      await loadUsers(sessionToken);
      setCatalogNotice('Utilizador criado. Enviamos um convite por email para o utilizador definir a password.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel criar utilizador.');
    } finally {
      setUserActionLoading(false);
    }
  };

  const startEditUser = (user: AuthUser) => {
    setEditUserDraft({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      role: user.role,
      function: user.function ?? null,
    });
    setCatalogNotice('');
    setError('');
  };

  const cancelEditUser = () => {
    setEditUserDraft(null);
  };

  const handleEditUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged || !editUserDraft || userActionLoading) return;

    const name = editUserDraft.name.trim();
    const email = editUserDraft.email.trim().toLowerCase();
    const phone = editUserDraft.phone.trim();

    if (!name || !email || !phone) {
      setError('Nome, email e telemovel nao podem ficar vazios.');
      return;
    }
    if (editUserDraft.password && editUserDraft.password.length < 6) {
      setError('A password precisa de pelo menos 6 caracteres.');
      return;
    }

    setCatalogNotice('');
    setError('');
    setUserActionLoading(true);
    try {
      await api.updateUser(sessionToken, {
        id: editUserDraft.id,
        name,
        email,
        phone,
        password: editUserDraft.password,
        role: editUserDraft.role,
        function: editUserDraft.function,
      });
      setEditUserDraft(null);
      await loadUsers(sessionToken);
      setCatalogNotice('Utilizador atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel atualizar utilizador.');
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged || userActionLoading) return;
    if (!window.confirm('Apagar este utilizador?')) return;

    setCatalogNotice('');
    setError('');
    setUserActionLoading(true);
    try {
      const payload = await api.deleteUser(sessionToken, userId);
      if (editUserDraft?.id === userId) setEditUserDraft(null);
      await loadUsers(sessionToken);
      setCatalogNotice(payload.message || 'Utilizador apagado com sucesso.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel apagar utilizador.');
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleClearAllBookings = async () => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || currentUser?.role !== 'superuser' || clearBookingsLoading) return;
    if (clearBookingsConfirmation.trim().toLocaleLowerCase('pt-PT') !== 'apaga os ensaios') return;

    setCatalogNotice('');
    setError('');
    setClearBookingsLoading(true);
    try {
      const payload = await api.clearAllBookings(sessionToken);
      setBookings([]);
      setFinanceData([]);
      await loadHistory(sessionToken);
      setCatalogNotice(payload.message || 'Base de dados de ensaios limpa.');
      setClearBookingsModalOpen(false);
      setClearBookingsConfirmation('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel limpar os ensaios.');
    } finally {
      setClearBookingsLoading(false);
    }
  };

  const startEditRoom = (room: api.ApiRoom) => {
    setEditingRoomId(room.id);
    setRoomForm(roomToForm(room));
    setRoomImageFile(null);
    setCatalogNotice('');
    setError('');
  };

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setRoomImageFile(null);
  };

  const handleSaveRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    const maxMembers = Number(roomForm.maxMembers);
    const trimmedName = roomForm.name.trim();
    if (!trimmedName) {
      setError('A sala precisa de um nome.');
      return;
    }
    if (!Number.isFinite(maxMembers) || maxMembers <= 0) {
      setError('Capacidade invalida.');
      return;
    }
    const trimmedPrice = roomForm.pricePerMemberHour.trim();
    const pricePerMemberHour = trimmedPrice === '' ? null : Number(trimmedPrice);
    if (pricePerMemberHour !== null && (!Number.isFinite(pricePerMemberHour) || pricePerMemberHour < 0)) {
      setError('Preco da sala invalido.');
      return;
    }
    setCatalogNotice('');
    setError('');
    try {
      // Determina o id alvo (para novas salas, o id pode ser gerado a partir do nome).
      const roomId = editingRoomId ?? (roomForm.id.trim() || undefined);

      // Se há uma imagem nova, envia-a para o bucket e usa o URL público resultante.
      let imageUrl: string | null = roomForm.imageUrl.trim() || null;
      if (roomImageFile) {
        setRoomImageUploading(true);
        try {
          const uploaded = await api.uploadRoomImage(
            sessionToken,
            roomId || `sala-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'nova'}`,
            roomImageFile,
          );
          imageUrl = uploaded.url;
        } finally {
          setRoomImageUploading(false);
        }
      }

      const draft: api.RoomDraft = {
        id: roomId,
        name: trimmedName,
        description: roomForm.description,
        descriptionEn: roomForm.descriptionEn,
        maxMembers: Math.floor(maxMembers),
        pricePerMemberHour,
        imageUrl,
        gear: roomForm.gear,
        gearEn: roomForm.gearEn,
        accent: roomForm.accent,
        active: roomForm.active,
      };
      if (editingRoomId) {
        await api.updateRoom(sessionToken, editingRoomId, draft);
        setCatalogNotice('Sala atualizada com sucesso.');
      } else {
        await api.createRoom(sessionToken, draft);
        setCatalogNotice('Sala criada com sucesso.');
      }
      cancelEditRoom();
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel guardar a sala.');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    if (!window.confirm('Apagar esta sala? Se tiver marcacoes, sera arquivada.')) return;
    setCatalogNotice('');
    setError('');
    try {
      const payload = await api.deleteRoom(sessionToken, roomId);
      if (editingRoomId === roomId) cancelEditRoom();
      await loadCatalogs();
      setCatalogNotice(payload.message || 'Sala removida.');
    } catch {
      setError('Nao foi possivel apagar a sala.');
    }
  };

  const startEditService = (service: api.ApiService) => {
    setEditingServiceId(service.id);
    setServiceForm(serviceToForm(service));
    setCatalogNotice('');
    setError('');
  };

  const cancelEditService = () => {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm);
  };

  const handleSaveService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    const trimmedName = serviceForm.name.trim();
    const price = Number(serviceForm.price);
    if (!trimmedName) {
      setError('O servico precisa de um nome.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Preco do servico invalido.');
      return;
    }
    setCatalogNotice('');
    setError('');
    try {
      const draft: api.ServiceDraft = {
        id: editingServiceId ?? (serviceForm.id.trim() || undefined),
        name: trimmedName,
        nameEn: serviceForm.nameEn,
        description: serviceForm.description,
        price,
        active: serviceForm.active,
      };
      if (editingServiceId) {
        await api.updateService(sessionToken, editingServiceId, draft);
        setCatalogNotice('Servico atualizado com sucesso.');
      } else {
        await api.createService(sessionToken, draft);
        setCatalogNotice('Servico criado com sucesso.');
      }
      cancelEditService();
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel guardar o servico.');
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    if (!window.confirm('Apagar DEFINITIVAMENTE este servico? Sai do site e do admin.')) return;
    setCatalogNotice('');
    setError('');
    try {
      const payload = await api.deleteService(sessionToken, serviceId);
      if (editingServiceId === serviceId) cancelEditService();
      await loadCatalogs();
      setCatalogNotice(payload.message || 'Servico removido.');
    } catch {
      setError('Nao foi possivel apagar o servico.');
    }
  };

  const handleSaveGlobalRate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    const parsedRate = Number(globalRate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      setError('Valor invalido. Usa um numero valido.');
      return;
    }
    setCatalogNotice('');
    setError('');
    try {
      await api.updatePricing(sessionToken, { perMemberPerHour: parsedRate });
      await loadCatalogs();
      setCatalogNotice('Preco global atualizado com sucesso.');
    } catch {
      setError('Nao foi possivel guardar o preco global.');
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
    const sendWhatsApp = Boolean(whatsappOptIn[bookingId]);
    // Admin/superuser escolhe o responsavel (por defeito fica ele proprio).
    const chosenAssigneeId = isPrivileged
      ? assigneeChoice[bookingId] || currentUser?.id || ''
      : undefined;

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'confirm', { assignedCollaboratorId: chosenAssigneeId });

      if (sendWhatsApp && booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'confirm');
      }

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
    });
  };

  const handleConfirmPaymentReceipt = (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    // Abre o modal inline (em vez do window.confirm nativo) com o valor esperado
    // pre-preenchido, para o colaborador/admin confirmar ou ajustar o recebido.
    setError('');
    setPaymentDraft({
      bookingId,
      expected: String(Number(booking.amount || 0).toFixed(2)),
      received: String(Number(booking.amount || 0).toFixed(2)),
    });
  };

  const closePaymentModal = () => {
    setPaymentDraft(null);
  };

  const handleSubmitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentDraft) return;

    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const received = Number(paymentDraft.received);
    if (!Number.isFinite(received) || received < 0) {
      setError('Indica um valor recebido valido.');
      return;
    }

    await withActionLock(paymentDraft.bookingId, async () => {
      await api.bookingAction(token, paymentDraft.bookingId, 'confirm-payment', {
        amount: received,
      });

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
      closePaymentModal();
    });
  };

  const handleRejectBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
    const sendWhatsApp = Boolean(whatsappOptIn[bookingId]);

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'reject');

      if (sendWhatsApp && booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'cancel');
      }

      await loadHistory(token);
    });
  };

  const withActionLock = async (bookingId: string, callback: () => Promise<void>) => {
    try {
      setActionLoading((prev) => ({ ...prev, [bookingId]: true }));
      await callback();
      setError('');
    } catch (err) {
      console.error('History action failed:', err);
      setError('Nao foi possivel concluir a acao. Verifique se o backend esta ativo.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
    const sendWhatsApp = Boolean(whatsappOptIn[bookingId]);

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'cancel');

      if (sendWhatsApp && booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'cancel');
      }

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
    });
  };

  const openRescheduleModal = (booking: PastBooking) => {
    setRescheduleDraft({
      bookingId: booking.id,
      date: booking.date,
      time: booking.time,
      duration: String(booking.duration),
    });
    setError('');
  };

  const closeRescheduleModal = () => {
    setRescheduleDraft(null);
  };

  const handleSubmitReschedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!rescheduleDraft) return;

    const booking = bookings.find((item) => item.id === rescheduleDraft.bookingId);
    if (!booking) {
      setError('Marcacao nao encontrada para reagendar.');
      return;
    }

    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const sendWhatsApp = Boolean(whatsappOptIn[booking.id]);

    const nextDuration = Number(rescheduleDraft.duration);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      setError('Duracao invalida para reagendamento.');
      return;
    }

    if (!rescheduleDraft.date || !rescheduleDraft.time) {
      setError('Data e hora sao obrigatorias para reagendar.');
      return;
    }

    await withActionLock(booking.id, async () => {
      await api.bookingAction(token, booking.id, 'reschedule', {
        date: rescheduleDraft.date,
        time: rescheduleDraft.time,
        duration: nextDuration,
      });

      if (sendWhatsApp && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(
          booking,
          currentUser?.name || 'Feedback - Ensaios',
          'reschedule',
          {
            date: rescheduleDraft.date,
            time: rescheduleDraft.time,
            duration: nextDuration,
          },
        );
      }

      setWhatsappOptIn((prev) => ({ ...prev, [booking.id]: false }));

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
      closeRescheduleModal();
    });
  };

  const totals = useMemo(() => {
    return financeData.reduce(
      (accumulator, month) => {
        accumulator.totalReceived += month.totalReceived;
        accumulator.totalRefunded += month.totalRefunded;
        accumulator.netTotal += month.netTotal;
        accumulator.bookingCount += month.bookingCount;
        return accumulator;
      },
      { totalReceived: 0, totalRefunded: 0, netTotal: 0, bookingCount: 0 },
    );
  }, [financeData]);

  const financeDataToShow = useMemo(() => {
    if (periodScope === 'all') {
      return financeData;
    }

    const scopeMonth = Number(periodScope.replace(/\D/g, ''));
    return financeData.filter((month) => {
      const monthNumber = Number(month.month.split('-')[1]);
      return monthNumber >= scopeMonth;
    });
  }, [financeData, periodScope]);

  const handlePrintFinance = async () => {
    if (financeDataToShow.length === 0) {
      setError('Seleciona pelo menos um mes para gerar o PDF.');
      return;
    }

    setError('');
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const autoTable = autoTableModule.default;

    const loadImageAsDataUrl = async (url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const imageBlob = await response.blob();
        const objectUrl = URL.createObjectURL(imageBlob);

        return await new Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null>((resolve) => {
          const image = new Image();
          image.onload = () => {
            const width = image.naturalWidth || 0;
            const height = image.naturalHeight || 0;
            if (width <= 0 || height <= 0) {
              URL.revokeObjectURL(objectUrl);
              resolve(null);
              return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) {
              URL.revokeObjectURL(objectUrl);
              resolve(null);
              return;
            }

            context.drawImage(image, 0, 0);

            const frame = context.getImageData(0, 0, width, height);
            const pixels = frame.data;
            let minX = width;
            let minY = height;
            let maxX = -1;
            let maxY = -1;

            for (let index = 0; index < pixels.length; index += 4) {
              const alpha = pixels[index + 3];

              if (alpha > 0) {
                const pixelPosition = index / 4;
                const x = pixelPosition % width;
                const y = Math.floor(pixelPosition / width);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }

            context.putImageData(frame, 0, 0);

            const hasBounds = maxX >= minX && maxY >= minY;
            const cropPadding = 8;
            const cropX = hasBounds ? Math.max(0, minX - cropPadding) : 0;
            const cropY = hasBounds ? Math.max(0, minY - cropPadding) : 0;
            const cropWidth = hasBounds ? Math.min(width - cropX, maxX - minX + 1 + cropPadding * 2) : width;
            const cropHeight = hasBounds ? Math.min(height - cropY, maxY - minY + 1 + cropPadding * 2) : height;

            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = cropWidth;
            outputCanvas.height = cropHeight;
            const outputContext = outputCanvas.getContext('2d');
            if (!outputContext) {
              URL.revokeObjectURL(objectUrl);
              resolve(null);
              return;
            }

            outputContext.fillStyle = '#ffffff';
            outputContext.fillRect(0, 0, cropWidth, cropHeight);
            outputContext.drawImage(
              canvas,
              cropX,
              cropY,
              cropWidth,
              cropHeight,
              0,
              0,
              cropWidth,
              cropHeight,
            );

            URL.revokeObjectURL(objectUrl);
            resolve({
              dataUrl: outputCanvas.toDataURL('image/jpeg', 0.98),
              format: 'JPEG',
            });
          };

          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };

          image.src = objectUrl;
        });
      } catch {
        return null;
      }
    };

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    let cursorY = margin;

    const receivedTotal = financeDataToShow.reduce((sum, month) => sum + month.totalReceived, 0);
    const periodLabel = financeDataToShow.map((month) => formatFinanceMonthLabel(month.month)).join(', ');
    const logoData = await loadImageAsDataUrl('/logo.png');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('Feedback - Ensaios - Contas', margin, cursorY + 1);

    if (logoData?.dataUrl) {
      doc.addImage(logoData.dataUrl, logoData.format, pageWidth - 44, margin - 1, 32, 11);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')}`, margin, cursorY + 7);
    cursorY += 10;

    doc.setFontSize(10);
    doc.text(`Periodo: ${periodLabel}`, margin, cursorY);
    cursorY += 6;

    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      head: [['Recebido', 'Registos']],
      body: [[
        formatCurrency(receivedTotal),
        String(financeDataToShow.reduce((sum, month) => sum + month.bookingCount, 0)),
      ]],
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3, textColor: [17, 24, 39] },
      headStyles: { fillColor: [178, 223, 200], textColor: [27, 67, 50], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [243, 253, 247] },
      columnStyles: {
        0: { halign: 'right' },
        1: { halign: 'center' },
      },
      margin: { left: margin, right: margin },
    });

    cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
    cursorY += 6;

    const ensureRoom = (requiredHeight = 12) => {
      if (cursorY + requiredHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
    };

    for (const month of financeDataToShow) {
      ensureRoom(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(formatFinanceMonthLabel(month.month), margin, cursorY);
      cursorY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `Recebido: ${formatCurrency(month.totalReceived)}`,
        margin,
        cursorY,
      );
      cursorY += 5;

      const entries = month.bookings.map((entry) => [
        formatDateDayMonthYear(entry.date),
        entry.roomName || '-',
        entry.paymentStatus === 'refunded' ? 'Devolvido' : 'Recebido',
        entry.bandName || 'Banda',
        formatCurrency(entry.amount),
        entry.confirmedBy?.name || '-',
      ]);

      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        head: [['Data', 'Sala', 'Estado', 'Banda', 'Valor', 'Recebido por']],
        body: entries,
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, textColor: [17, 24, 39] },
        headStyles: { fillColor: [203, 213, 225], textColor: [30, 41, 59], fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { halign: 'center' },
          1: { halign: 'left' },
          2: { halign: 'center' },
          3: { halign: 'left' },
          4: { halign: 'right' },
          5: { halign: 'left' },
        },
        didParseCell: (hookData: any) => {
          if (hookData.section !== 'body') return;
          const rawRow = Array.isArray(hookData.row?.raw) ? hookData.row.raw : [];
          const room = rawRow[1] || '';
          const palette = getPdfRoomPalette(room);

          if (hookData.column.index === 1) {
            hookData.cell.styles.fillColor = palette.stripe;
            hookData.cell.styles.textColor = palette.text;
          }
        },
        margin: { left: margin, right: margin },
      });

      cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
      cursorY += 5;

      const collaboratorSummaryRows = summarizeFinanceEntries(month.bookings, (entry) => entry.confirmedBy?.name || 'Sem colaborador')
        .map((item) => [item.name, String(item.count), formatCurrency(item.total)]);
      const bandSummaryRows = summarizeFinanceEntries(month.bookings, (entry) => entry.bandName || 'Sem banda')
        .map((item) => [item.name, String(item.count), formatCurrency(item.total)]);
      const roomSummaryRows = summarizeFinanceEntries(month.bookings, (entry) => entry.roomName || 'Outra sala')
        .map((item) => [item.name, String(item.count), formatCurrency(item.total)]);
      const extrasSummaryMap = new Map<string, { count: number; total: number }>();

      for (const entry of month.bookings) {
        const bookingFallback = bookings.find((bookingItem) => bookingItem.id === entry.id);
        const extras = Array.isArray(entry.extras) && entry.extras.length > 0
          ? entry.extras
          : (Array.isArray(bookingFallback?.extras) ? bookingFallback.extras : []);
        if (extras.length === 0) {
          const current = extrasSummaryMap.get('sem-extra') || { count: 0, total: 0 };
          current.count += 1;
          extrasSummaryMap.set('sem-extra', current);
          continue;
        }

        for (const extraKey of extras) {
          const key = String(extraKey || '').trim();
          if (!key) continue;
          const current = extrasSummaryMap.get(key) || { count: 0, total: 0 };
          const breakdown = Array.isArray(entry.extrasBreakdown) ? entry.extrasBreakdown : [];
          const matched = breakdown.find((item) => String(item.key || '').trim() === key);
          const fallbackValue = Number(financeExtrasCatalog[key] || 0);
          const extraValue = Number.isFinite(Number(matched?.amount)) ? Number(matched?.amount) : fallbackValue;
          current.count += 1;
          current.total += extraValue;
          extrasSummaryMap.set(key, current);
        }
      }

      const extrasServiceSummaries = Array.from(extrasSummaryMap.entries())
        .filter(([key]) => key !== 'sem-extra')
        .map(([key, info]) => ({
          key,
          label: formatExtraLabel(key),
          count: info.count,
          total: info.total,
        }))
        .sort((left, right) => right.count - left.count);

      const printSummaryTable = (title: string, rows: string[][], color: [number, number, number]) => {
        ensureRoom(24);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(title, margin, cursorY);
        cursorY += 1.5;

        autoTable(doc, {
          startY: cursorY,
          theme: 'grid',
          head: [['Tipo', 'Registos', 'Total']],
          body: rows.length > 0 ? rows : [['Sem dados', '0', formatCurrency(0)]],
          styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [17, 24, 39] },
          headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', halign: 'center' },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center' },
            2: { halign: 'right' },
          },
          margin: { left: margin, right: margin },
        });

        cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
        cursorY += 4;
      };

      printSummaryTable('Resumo por colaborador', collaboratorSummaryRows, [162, 216, 211]);
      printSummaryTable('Resumo por banda', bandSummaryRows, [186, 230, 253]);
      printSummaryTable('Resumo por sala', roomSummaryRows, [224, 187, 228]);

      if (extrasServiceSummaries.length > 0) {
        for (const serviceSummary of extrasServiceSummaries) {
          const row = [[serviceSummary.label, String(serviceSummary.count), formatCurrency(serviceSummary.total)]];
          printSummaryTable(`Resumo do servico: ${serviceSummary.label}`, row, [245, 211, 166]);
        }
      }
    }

    const footerText = 'Website mantido e criado por Defunctum Noctis © 2026';
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(footerText, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    doc.setTextColor(17, 24, 39);

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`feedback-ensaios-contas-${stamp}.pdf`);
  };

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    setToken(sessionToken);
    Promise.all([
      restoreSession(sessionToken),
      loadHistory(sessionToken),
      // Estado global do badge (Supabase), para o toggle refletir o valor real.
      api.getAppSettings().then((settings) => setBetaEnabled(settings.betaEnabled)).catch(() => {}),
    ])
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!currentUser) {
    return (
      <div className="page-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />

        <main className="layout admin-layout">
          <section className="card admin-auth-card">
            {adminLogoVisible ? (
              <img
                className="admin-brand-logo"
                src="/logoadmin.png"
                alt="Feedback - Ensaios Admin"
                onError={() => setAdminLogoVisible(false)}
              />
            ) : null}

            <p className="summary-copy">Acesso ao painel de administracao</p>

            <form className="admin-login-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>

              <button type="submit" className="primary-button">
                Entrar
              </button>

              {authError ? <p className="admin-message-error">{authError}</p> : null}
            </form>

            <a href="/" className="secondary-button admin-link-home">
              Voltar ao site
            </a>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      {(betaEnabled || isSuperuser) ? (
        <div className="admin-beta-banner beta-only" role="note">
          <span className="admin-beta-badge">{betaEnabled ? 'Beta' : 'Beta desativada'}</span>
          {isSuperuser ? (
            <button
              type="button"
              className="beta-mode-toggle"
              aria-pressed={betaEnabled}
              disabled={Boolean(actionLoading['beta'])}
              onClick={() => {
                void toggleBetaMode();
              }}
            >
              {actionLoading['beta']
                ? 'A guardar...'
                : betaEnabled
                  ? 'Desativar'
                  : 'Ativar'}
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="topbar admin-topbar">
        <div className="brand-wrap">
          {adminLogoVisible ? (
            <img
              className="admin-brand-logo"
              src="/logoadmin.png"
              alt="Feedback - Ensaios Admin"
              onError={() => setAdminLogoVisible(false)}
            />
          ) : null}
        </div>
      </header>

      <main className="layout admin-layout admin-shell">
        {!loading && isPrivileged ? (
          <button
            type="button"
            className="admin-sidebar-toggle"
            aria-label="Abrir menu de gestao"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="admin-pie-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        ) : null}

        {sidebarOpen ? (
          <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        ) : null}

        <aside className={`admin-sidebar ${sidebarOpen ? "admin-sidebar-open" : ""}`}>
          <div className="admin-sidebar-head">
            <span className="eyebrow">Gestao</span>
            <button
              type="button"
              className="secondary-button admin-modal-close admin-sidebar-close"
              aria-label="Fechar menu"
              onClick={() => setSidebarOpen(false)}
            >
              X
            </button>
          </div>
          <nav className="admin-sidebar-nav" aria-label="Seccoes de administracao">
            <button
              type="button"
              className={`admin-sidebar-item ${activePanel === "unified" ? "admin-sidebar-item-active" : ""}`}
              onClick={() => {
                setActivePanel("unified");
                setSidebarOpen(false);
              }}
            >
              Ensaios
            </button>
            {isPrivileged ? (
              <button
                type="button"
                className={`admin-sidebar-item ${activePanel === "users" ? "admin-sidebar-item-active" : ""}`}
                onClick={() => {
                  setActivePanel("users");
                  setSidebarOpen(false);
                }}
              >
                Utilizadores
              </button>
            ) : null}
            {isPrivileged ? (
              <>
                <button
                  type="button"
                  className={`admin-sidebar-item ${activePanel === "rooms" ? "admin-sidebar-item-active" : ""}`}
                  onClick={() => {
                    setActivePanel("rooms");
                    setSidebarOpen(false);
                  }}
                >
                  Salas
                </button>
                <button
                  type="button"
                  className={`admin-sidebar-item ${activePanel === "services" ? "admin-sidebar-item-active" : ""}`}
                  onClick={() => {
                    setActivePanel("services");
                    setSidebarOpen(false);
                  }}
                >
                  Servicos
                </button>
              </>
            ) : null}

            <div className="admin-sidebar-footer">
              <a href="/" className="admin-sidebar-item admin-sidebar-link" onClick={() => setSidebarOpen(false)}>
                Site publico
              </a>
              <button type="button" className="admin-sidebar-item" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </nav>
        </aside>

        <div className="admin-content">
          <div className="admin-content-bar">
            {currentUser ? (
              <div className="admin-user-chip" title={currentUser.email}>
                <span className="admin-user-chip-name">{currentUser.name}</span>
                <span className={`admin-user-chip-role admin-role-${currentUser.role}`}>
                  {roleLabel[currentUser.role]}
                  {currentUser.function ? ` · ${staffFunctionLabels[currentUser.function]}` : ''}
                </span>
              </div>
            ) : null}
          </div>
          {error ? <p className="admin-message-error">{error}</p> : null}
          {catalogNotice ? <p className="confirmation">{catalogNotice}</p> : null}
          {loading ? <p className="summary-copy">A carregar...</p> : null}

          {isPrivileged && activePanel === 'users' ? (
            <section className="card admin-section">
              <div className="section-heading">
                <p className="eyebrow">Utilizadores</p>
                <h2>Gestao de utilizadores</h2>
              </div>

              <form
                className="admin-create-user"
                onSubmit={editUserDraft ? handleEditUser : handleCreateUser}
              >
                <label>
                  Nome *
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={editUserDraft ? editUserDraft.name : newUserDraft.name}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, name: event.target.value } : current,
                          )
                        : setNewUserDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <label>
                  Email *
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={editUserDraft ? editUserDraft.email : newUserDraft.email}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, email: event.target.value } : current,
                          )
                        : setNewUserDraft((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </label>

                <label>
                  Telemovel *
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    value={editUserDraft ? editUserDraft.phone : newUserDraft.phone}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, phone: event.target.value } : current,
                          )
                        : setNewUserDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </label>

                <label>
                  Password {editUserDraft ? '(vazio = manter atual)' : '(opcional)'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={editUserDraft ? 'Deixar vazio para manter' : 'Em branco: enviaremos convite por email'}
                    value={editUserDraft ? editUserDraft.password : newUserDraft.password}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, password: event.target.value } : current,
                          )
                        : setNewUserDraft((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </label>

                <label>
                  Perfil
                  <select
                    value={editUserDraft ? editUserDraft.role : newUserDraft.role}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, role: event.target.value as Role } : current,
                          )
                        : setNewUserDraft((current) => ({
                            ...current,
                            role: event.target.value as Role,
                          }))
                    }
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Função
                  <select
                    value={(editUserDraft ? editUserDraft.function : newUserDraft.function) ?? ''}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current
                              ? { ...current, function: (event.target.value || null) as StaffFunction | null }
                              : current,
                          )
                        : setNewUserDraft((current) => ({
                            ...current,
                            function: (event.target.value || null) as StaffFunction | null,
                          }))
                    }
                  >
                    <option value="">Sem função</option>
                    <option value="diretor-producao">Diretor de Produção</option>
                    <option value="diretor-tecnico">Diretor Técnico</option>
                    <option value="produtor-executivo">Produtor Executivo</option>
                    <option value="gestor-operativo">Gestor Operativo</option>
                    <option value="gestor-manutencao">Gestor de Manutenção</option>
                    <option value="tecnico">Técnico</option>
                  </select>
                </label>

                <div className="admin-user-form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={userActionLoading || usersLoading}
                  >
                    {userActionLoading
                      ? 'A guardar...'
                      : editUserDraft
                        ? 'Guardar alteracoes'
                        : 'Criar utilizador'}
                  </button>
                  {editUserDraft ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditUser}
                      disabled={userActionLoading}
                    >
                      Cancelar edicao
                    </button>
                  ) : null}
                </div>
              </form>

              {usersLoading ? <p className="summary-copy">A carregar utilizadores...</p> : null}
              <ul className="admin-user-list">
                {users.map((user) => (
                  <li key={user.id}>
                    <div className="admin-user-card-head">
                      <strong>{user.name}</strong>
                      <span className="booking-id-chip">{user.id}</span>
                    </div>
                    <span>{user.email}</span>
                    <span>
                      {roleLabel[user.role]}
                      {user.function ? ` · ${staffFunctionLabels[user.function]}` : ''}
                    </span>
                    <div className="team-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => startEditUser(user)}
                        disabled={userActionLoading}
                      >
                        Editar
                      </button>
                      {currentUser?.id !== user.id ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleDeleteUser(user.id)}
                          disabled={userActionLoading}
                        >
                          Apagar
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {users.length === 0 && !usersLoading ? (
                <p className="summary-copy">Sem utilizadores registados.</p>
              ) : null}
            </section>
          ) : null}

          {isPrivileged && activePanel === 'rooms' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Salas</p>
              <h2>Gerir salas</h2>
            </div>
            <form className="admin-pricing-grid" onSubmit={handleSaveGlobalRate}>
              <label>
                Preco por hora global — fallback (EUR)
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={globalRate}
                  onChange={(event) => setGlobalRate(event.target.value)}
                />
              </label>
              <p className="admin-helper-note">Usado quando a sala nao tem preco proprio. Os precos dos extras definem-se em Servicos.</p>
              <button type="submit" className="primary-button">
                Guardar preco global
              </button>
            </form>
            <form className="admin-create-user" onSubmit={handleSaveRoom}>
              {!editingRoomId ? (
                <label>
                  ID (opcional, ex: sala-blue)
                  <input
                    type="text"
                    value={roomForm.id}
                    onChange={(event) => setRoomForm((current) => ({ ...current, id: event.target.value }))}
                    placeholder="gerado a partir do nome"
                  />
                </label>
              ) : null}
              <label>
                Nome *
                <input
                  type="text"
                  required
                  value={roomForm.name}
                  onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="SALA BLUE"
                />
              </label>
              <div className="field-row">
                <label>
                  Capacidade (elementos) *
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={roomForm.maxMembers}
                    onChange={(event) => setRoomForm((current) => ({ ...current, maxMembers: event.target.value }))}
                  />
                </label>
                <label>
                  Preco por hora da sala (EUR) (vazio = usa preco global)
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={roomForm.pricePerMemberHour}
                    onChange={(event) => setRoomForm((current) => ({ ...current, pricePerMemberHour: event.target.value }))}
                    placeholder={globalRate}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Foto da sala (recomendado 1200 × 675 px, 16:9, max 5 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => setRoomImageFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {roomImageFile || roomForm.imageUrl ? (
                  <div className="room-image-preview">
                    <img
                      src={roomImageFile ? URL.createObjectURL(roomImageFile) : roomForm.imageUrl}
                      alt="Pre-visualizacao da foto da sala"
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setRoomImageFile(null);
                        setRoomForm((current) => ({ ...current, imageUrl: '' }));
                      }}
                    >
                      Remover foto
                    </button>
                  </div>
                ) : null}
              </div>
              <label>
                Descricao (PT)
                <textarea
                  rows={2}
                  value={roomForm.description}
                  onChange={(event) => setRoomForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                Descricao (EN)
                <textarea
                  rows={2}
                  value={roomForm.descriptionEn}
                  onChange={(event) => setRoomForm((current) => ({ ...current, descriptionEn: event.target.value }))}
                />
              </label>
              <div className="field-row">
                <label>
                  Equipamento PT (um por linha)
                  <textarea
                    rows={3}
                    value={roomForm.gear}
                    onChange={(event) => setRoomForm((current) => ({ ...current, gear: event.target.value }))}
                  />
                </label>
                <label>
                  Equipamento EN (um por linha)
                  <textarea
                    rows={3}
                    value={roomForm.gearEn}
                    onChange={(event) => setRoomForm((current) => ({ ...current, gearEn: event.target.value }))}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Cor de destaque
                  <select
                    value={roomForm.accent}
                    onChange={(event) => setRoomForm((current) => ({ ...current, accent: event.target.value }))}
                  >
                    <option value="var(--room-red)">Vermelho</option>
                    <option value="var(--room-grey)">Cinzento</option>
                    <option value="var(--room-purple)">Roxo</option>
                  </select>
                </label>
                <label className="extra-toggle">
                  <input
                    type="checkbox"
                    checked={roomForm.active}
                    onChange={(event) => setRoomForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Ativa no site</span>
                </label>
              </div>
              <div className="admin-user-form-actions">
                <button type="submit" className="primary-button" disabled={roomImageUploading}>
                  {roomImageUploading
                    ? 'A enviar imagem...'
                    : editingRoomId
                      ? 'Guardar sala'
                      : 'Adicionar sala'}
                </button>
                {editingRoomId ? (
                  <button type="button" className="secondary-button" onClick={cancelEditRoom}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>

            {catalogLoading ? <p className="summary-copy">A carregar salas...</p> : null}
            <ul className="admin-user-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <div className="admin-user-card-head">
                    <strong>{room.name}</strong>
                    <span className="booking-id-chip">{room.id}</span>
                    {!room.active ? <span className="booking-id-chip">inativa</span> : null}
                  </div>
                  <span>{room.description || 'Sem descricao'}</span>
                  <span>
                    Ate {room.maxMembers} elementos ·{' '}
                    {room.pricePerMemberHour === null || room.pricePerMemberHour === undefined
                      ? `Preco global (${globalRate || '?'} EUR/h)`
                      : `${room.pricePerMemberHour} EUR/h proprio`}
                  </span>
                  <div className="team-actions">
                    <button type="button" className="secondary-button" onClick={() => startEditRoom(room)}>
                      Editar
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleDeleteRoom(room.id)}>
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isPrivileged && activePanel === 'services' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Servicos</p>
              <h2>Gerir servicos / extras</h2>
            </div>
            <form className="admin-create-user" onSubmit={handleSaveService}>
              {!editingServiceId ? (
                <label>
                  ID (opcional, ex: mistura)
                  <input
                    type="text"
                    value={serviceForm.id}
                    onChange={(event) => setServiceForm((current) => ({ ...current, id: event.target.value }))}
                    placeholder="gerado a partir do nome"
                  />
                </label>
              ) : null}
              <div className="field-row">
                <label>
                  Nome (PT) *
                  <input
                    type="text"
                    required
                    value={serviceForm.name}
                    onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label>
                  Nome (EN)
                  <input
                    type="text"
                    value={serviceForm.nameEn}
                    onChange={(event) => setServiceForm((current) => ({ ...current, nameEn: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Descricao
                <textarea
                  rows={2}
                  value={serviceForm.description}
                  onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <div className="field-row">
                <label>
                  Preco (EUR) *
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={serviceForm.price}
                    onChange={(event) => setServiceForm((current) => ({ ...current, price: event.target.value }))}
                  />
                </label>
                <label className="extra-toggle">
                  <input
                    type="checkbox"
                    checked={serviceForm.active}
                    onChange={(event) => setServiceForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Ativo no site</span>
                </label>
              </div>
              <div className="admin-user-form-actions">
                <button type="submit" className="primary-button">
                  {editingServiceId ? 'Guardar servico' : 'Adicionar servico'}
                </button>
                {editingServiceId ? (
                  <button type="button" className="secondary-button" onClick={cancelEditService}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>

            {catalogLoading ? <p className="summary-copy">A carregar servicos...</p> : null}
            <ul className="admin-user-list">
              {services.map((service) => (
                <li key={service.id}>
                  <div className="admin-user-card-head">
                    <strong>{service.name}</strong>
                    <span className="booking-id-chip">{service.id}</span>
                    {!service.active ? <span className="booking-id-chip">inativo</span> : null}
                  </div>
                  <span>{service.nameEn || 'Sem nome EN'}</span>
                  <span>{service.price} EUR · {service.description || 'Sem descricao'}</span>
                  <div className="team-actions">
                    <button type="button" className="secondary-button" onClick={() => startEditService(service)}>
                      Editar
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleDeleteService(service.id)}>
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activePanel === "unified" && !loading && !error ? (
          <section className="card admin-section">
            <div className="section-heading section-heading-row">
              <div>
                <p className="eyebrow">Ensaios</p>
                <h2>{filteredBookings.length === 0 ? 'Sem ensaios neste filtro' : historyCountLabel}</h2>
              </div>
              {isPrivileged ? (
                <button
                  type="button"
                  className="icon-button finance-toggle"
                  aria-label={showFinance ? 'Esconder contas' : 'Ver contas'}
                  aria-pressed={showFinance}
                  title={showFinance ? 'Esconder contas' : 'Ver contas'}
                  onClick={() => setShowFinance((value) => !value)}
                >
                  <Wallet size={20} aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {isPrivileged && showFinance ? (
              <div className="finance-panel">
                <div className="finance-stat-grid">
                  <div className="finance-stat">
                    <span>Total recebido</span>
                    <strong>{formatCurrency(totals.totalReceived)}</strong>
                  </div>
                  <div className="finance-stat">
                    <span>Pagamentos</span>
                    <strong>{String(totals.bookingCount)}</strong>
                  </div>
                </div>

                {financeData.length > 0 ? (
                  <div className="finance-export-bar">
                    <button type="button" className="primary-button finance-pdf-button" onClick={handlePrintFinance}>
                      Gerar PDF
                    </button>
                  </div>
                ) : null}

                {financeData.length === 0 ? (
                  <p className="summary-copy">Ainda nao ha pagamentos confirmados.</p>
                ) : (
                  <div className="finance-month-grid">
                    {financeData.map((month) => {
                      const receivedEntries = month.bookings.filter((entry) => entry.paymentStatus === 'received');

                      return (
                        <article key={month.month} className="finance-month-card">
                          <div className="finance-month-head">
                            <strong>{month.month}</strong>
                            <span>{month.bookingCount} registos</span>
                          </div>
                          <div className="finance-month-values">
                            <p>Recebido: <strong>{formatCurrency(month.totalReceived)}</strong></p>
                          </div>

                          {receivedEntries.length > 0 ? (
                            <div className="finance-bookings-group">
                              <p className="finance-bookings-group-title">Recebidos</p>
                              <div className="finance-breakdown-grid">
                                <div className="finance-breakdown-card">
                                  <span className="finance-breakdown-label">Por colaborador</span>
                                  <ul className="finance-breakdown-list">
                                    {summarizeFinanceEntries(receivedEntries, (entry) => entry.confirmedBy?.name || 'Sem colaborador').map((item) => (
                                      <li key={`received-collaborator-${item.name}`}>
                                        <span>{item.name}</span>
                                        <strong>{formatCurrency(item.total)}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="finance-breakdown-card">
                                  <span className="finance-breakdown-label">Por banda</span>
                                  <ul className="finance-breakdown-list">
                                    {summarizeFinanceEntries(receivedEntries, (entry) => entry.bandName || 'Sem banda').map((item) => (
                                      <li key={`received-band-${item.name}`}>
                                        <span>{item.name}</span>
                                        <strong>{formatCurrency(item.total)}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="finance-print-layout" aria-label="Resumo de contas para PDF">
                  <div className="finance-print-header">
                    <div className="finance-print-header-copy">
                      <h3>Feedback - Ensaios - Contas</h3>
                      <p>{financeDataToShow.length > 0 ? `${financeDataToShow.length} mês(es) selecionado(s)` : 'Nenhum mes selecionado'}</p>
                    </div>
                    <img className="finance-print-logo" src="/feedbook-logo.png" alt="Feedback - Ensaios" />
                  </div>

                  {financeDataToShow.length === 0 ? (
                    <p className="finance-print-empty">Seleciona pelo menos um mes para exportar.</p>
                  ) : (
                    <>
                      <div className="finance-print-summary">
                        <div>
                          <span>Período</span>
                          <strong>{financeDataToShow.map((month) => month.month).join(', ')}</strong>
                        </div>
                        <div>
                          <span>Recebido</span>
                          <strong>{formatCurrency(financeDataToShow.reduce((sum, month) => sum + month.totalReceived, 0))}</strong>
                        </div>
                      </div>

                      {financeDataToShow.map((month) => {
                        const receivedEntries = month.bookings.filter((entry) => entry.paymentStatus === 'received');

                        return (
                          <article key={`print-${month.month}`} className="finance-print-month">
                            <div className="finance-print-month-head">
                              <strong>{month.month}</strong>
                              <span>{month.bookingCount} registos</span>
                            </div>
                            <div className="finance-print-values">
                              <div>
                                <span>Recebido</span>
                                <strong>{formatCurrency(month.totalReceived)}</strong>
                              </div>
                            </div>

                            {receivedEntries.length > 0 ? (
                              <div className="finance-print-bookings-section">
                                <p className="finance-print-subhead">Recebidos</p>
                                <div className="finance-print-breakdown">
                                  <div className="finance-print-breakdown-card">
                                    <span>Por colaborador</span>
                                    <ul>
                                      {summarizeFinanceEntries(receivedEntries, (entry) => entry.confirmedBy?.name || 'Sem colaborador').map((item) => (
                                        <li key={`print-received-collaborator-${item.name}`}>
                                          <span>{item.name}</span>
                                          <strong>{formatCurrency(item.total)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="finance-print-breakdown-card">
                                    <span>Por banda</span>
                                    <ul>
                                      {summarizeFinanceEntries(receivedEntries, (entry) => entry.bandName || 'Sem banda').map((item) => (
                                        <li key={`print-received-band-${item.name}`}>
                                          <span>{item.name}</span>
                                          <strong>{formatCurrency(item.total)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                {Array.from(new Map(receivedEntries.map((entry) => [entry.roomName || 'Outra sala', [] as typeof receivedEntries])).entries()).map(([roomName, _entries]) => {
                                  const roomEntries = receivedEntries.filter((entry) => (entry.roomName || 'Outra sala') === roomName);
                                  return (
                                    <div key={`print-room-received-${roomName}`} className={`finance-print-room-group ${financeRoomTone(roomName)}`}>
                                      <div className="finance-print-room-header">
                                        <strong>{roomName}</strong>
                                        <span>{roomEntries.length} registo(s)</span>
                                      </div>
                                      <div className="finance-print-payment-list">
                                        {roomEntries.map((entry) => (
                                          <div key={`print-received-${entry.id}`} className="finance-print-payment-card">
                                            <div className="finance-print-payment-field"><span>Data</span><strong>{entry.date}</strong></div>
                                            <div className="finance-print-payment-field"><span>Sala</span><strong>{entry.roomName}</strong></div>
                                            <div className="finance-print-payment-field"><span>Estado</span><strong>Recebido</strong></div>
                                            <div className="finance-print-payment-field"><span>Banda</span><strong>{entry.bandName || 'Banda'}</strong></div>
                                            <div className="finance-print-payment-field"><span>Valor</span><strong>{formatCurrency(entry.amount)}</strong></div>
                                            <div className="finance-print-payment-field"><span>Recebido por</span><strong>{entry.confirmedBy?.name || '-'}</strong></div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="history-toolbar">
              <div className="history-filters" role="group" aria-label="Filtros de historico">
                {HISTORY_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`history-filter ${viewFilter === option.value ? 'history-filter-active' : ''}`}
                    aria-pressed={viewFilter === option.value}
                    onClick={() => setViewFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="history-period" title="Limitar registos antigos (o futuro fica sempre visivel)">
                <span>Periodo</span>
                <select
                  value={periodScope}
                  onChange={(event) => setPeriodScope(event.target.value as PeriodScope)}
                >
                  {PERIOD_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredBookings.length > 0 ? (
              <div className="history-table-wrap">
                <table className="history-table history-desktop">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Sala</th>
                      <th>Banda</th>
                      <th>Extras</th>
                      <th>Duracao</th>
                      <th>Pagamento</th>
                      <th>Estado</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((b) => (
                      <tr
                        key={b.id}
                        className={`history-row-${b.status} ${isPastConfirmed(b) ? 'history-row-past' : ''} ${roomToneClass(b)}`}
                      >
                        <td>{formatDateWithWeekday(b.date)}</td>
                        <td>{b.time}</td>
                        <td>{b.roomName}</td>
                        <td>
                          <span className="band-name">{b.bandName || '-'}</span>
                          {b.contactName || b.contactPhone ? (
                            <span className="history-sub">
                              {[b.contactName, formatContactPhone(b.contactPhone)].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </td>
                        <td className="history-extras-cell">
                         {(b.extras ?? []).length > 0 ? (
                           <div className="history-extras">
                              <button
                                type="button"
                                className="history-extras-trigger"
                                aria-expanded={extrasVisible[b.id] ? 'true' : 'false'}
                                aria-label="Ver extras"
                                onClick={() => {
                                  setExtrasVisible((prev) => ({
                                    ...prev,
                                    [b.id]: !(prev[b.id] ?? false),
                                  }));
                                }}
                              >
                                <span className="history-extras-label">
                                  {(() => { const c = b.extras?.length ?? 0; return c > 1 ? `${c} extras` : '1 extra'; })()}
                                </span>
                                <span className="history-extras-arrow" aria-hidden="true">▾</span>
                              </button>
                              {extrasVisible[b.id] ? (
                                <ul className="history-extras-list">
                                  {(b.extras ?? []).map((extraId) => (
                                    <li key={extraId}>{extraId}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : (
                            <span className="history-extras-empty">Sem extras</span>
                          )}
                        </td>
                        <td>{b.duration}h</td>
                        <td>
                          <span className={`status-chip ${paymentStatusTone(b)}`}>
                            {paymentStatusLabel(b)}
                          </span>
                        </td>
                        <td>{renderStatusWithAssignee(b)}</td>
                        <td>
                          <div className="history-actions">
                            {b.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  title="Confirmar marcacao"
                                  disabled={Boolean(actionLoading[b.id])}
                                  onClick={() => {
                                    void handleConfirmBooking(b.id);
                                  }}
                                >
                                  Confirma
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={Boolean(actionLoading[b.id])}
                                  onClick={() => {
                                    void handleRejectBooking(b.id);
                                  }}
                                >
                                  Desmarcar
                                </button>
                                {canReschedule(b) ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={Boolean(actionLoading[b.id])}
                                    onClick={() => {
                                      openRescheduleModal(b);
                                    }}
                                  >
                                    Reagendar
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {isFutureOrTodayConfirmed(b) ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={Boolean(actionLoading[b.id])}
                                  onClick={() => {
                                    void handleCancelBooking(b.id);
                                  }}
                                >
                                  Anular
                                </button>
                                {canReschedule(b) ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={Boolean(actionLoading[b.id])}
                                    onClick={() => {
                                      openRescheduleModal(b);
                                    }}
                                  >
                                    Reagendar
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {canConfirmPaymentReceipt(b) ? (
                              <button
                                type="button"
                                className="secondary-button"
                                title="Confirmar pagamento"
                                disabled={Boolean(actionLoading[b.id])}
                                onClick={() => {
                                  void handleConfirmPaymentReceipt(b.id);
                                }}
                              >
                                Pagamento
                              </button>
                            ) : null}
                            {podeUsarCheckmarkWhatsApp(b) ? renderWhatsAppOptIn(b.id, consegueAbrirWhatsApp(b)) : null}
                          </div>
                          {renderAssigneeSelect(b)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="history-mobile-list">
                  {filteredBookings.map((b) => (
                    <li key={`${b.id}-mobile`} className={`history-mobile-card ${roomToneClass(b)}`}>
                      <div className="team-item-top">
                        <strong>{b.roomName}</strong>
                        {renderStatusWithAssignee(b)}
                      </div>

                      <p>
                        {formatDateWithWeekday(b.date)} · {b.time} · {b.duration}h
                      </p>
                      <p className="band-name">{b.bandName || '-'}</p>
                      <p>{[b.contactName, formatContactPhone(b.contactPhone)].filter(Boolean).join(' · ') || '-'}</p>
                      <p>
                        Pagamento: <span className={paymentStatusTone(b)}>{paymentStatusLabel(b)}</span>
                      </p>
                      <p>
                        Extras:{' '}
                        {(b.extras ?? []).length > 0 ? (
                          <span className="history-extras-value">
                            {(b.extras ?? []).map((extraId) => formatExtraLabel(extraId)).join(', ')}
                          </span>
                        ) : (
                          <span className="history-extras-empty">Sem extras</span>
                        )}
                      </p>

                      <div className="history-log-lines">
                        {b.confirmedBy ? <p>Confirmado por {b.confirmedBy.name}</p> : null}
                        {b.rejectedBy ? <p>Desmarcado por {b.rejectedBy.name}</p> : null}
                        {b.cancelledBy ? <p>Anulado por {b.cancelledBy.name}</p> : null}
                        {b.refundedBy ? <p>Devolvido por {b.refundedBy.name}</p> : null}
                      </div>

                      <div className="history-actions">
                        {b.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="secondary-button"
                              title="Confirmar marcacao"
                              disabled={Boolean(actionLoading[b.id])}
                              onClick={() => {
                                void handleConfirmBooking(b.id);
                              }}
                            >
                              Confirma
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={Boolean(actionLoading[b.id])}
                              onClick={() => {
                                void handleRejectBooking(b.id);
                              }}
                            >
                              Desmarcar
                            </button>
                            {canReschedule(b) ? (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={Boolean(actionLoading[b.id])}
                                onClick={() => {
                                  openRescheduleModal(b);
                                }}
                              >
                                Reagendar
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        {isFutureOrTodayConfirmed(b) ? (
                          <>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={Boolean(actionLoading[b.id])}
                              onClick={() => {
                                void handleCancelBooking(b.id);
                              }}
                            >
                              Anular
                            </button>
                            {canReschedule(b) ? (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={Boolean(actionLoading[b.id])}
                                onClick={() => {
                                  openRescheduleModal(b);
                                }}
                              >
                                Reagendar
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        {canConfirmPaymentReceipt(b) ? (
                          <button
                            type="button"
                            className="secondary-button"
                            title="Confirmar pagamento"
                            disabled={Boolean(actionLoading[b.id])}
                            onClick={() => {
                              void handleConfirmPaymentReceipt(b.id);
                            }}
                          >
                            Pagamento
                          </button>
                        ) : null}
                        {podeUsarCheckmarkWhatsApp(b) ? renderWhatsAppOptIn(b.id, consegueAbrirWhatsApp(b)) : null}
                      </div>
                      {renderAssigneeSelect(b)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {filteredBookings.length === 0 && !loading ? (
              <p className="summary-copy">Sem ensaios para os filtros atuais. A zona de perigo abaixo continua disponivel para o superuser.</p>
            ) : null}

            {currentUser?.role === 'superuser' ? (
              <section className="danger-zone" aria-labelledby="danger-zone-title">
                <div className="danger-zone-heading">
                  <AlertTriangle aria-hidden="true" size={16} strokeWidth={2.2} />
                  <p>Zona restrita · Superuser</p>
                </div>
                <div className="danger-zone-content">
                  <div>
                    <h3 id="danger-zone-title">Eliminar todos os ensaios</h3>
                    <p>
                      Remove permanentemente ensaios pendentes, confirmados, anulados e histórico. Esta operação não pode ser desfeita.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="danger-zone-action"
                    disabled={clearBookingsLoading}
                    onClick={() => {
                      setClearBookingsConfirmation('');
                      setClearBookingsModalOpen(true);
                    }}
                  >
                    {clearBookingsLoading ? 'A eliminar ensaios...' : 'Eliminar todos os ensaios'}
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
        </div>
      </main>

      {clearBookingsModalOpen ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-bookings-modal-title"
        >
          <section className="card admin-modal-card clear-bookings-modal">
            <div className="clear-bookings-modal-alert">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.25} />
              <span>Operação irreversível</span>
            </div>
            <h3 id="clear-bookings-modal-title">Eliminar todos os ensaios?</h3>
            <p>
              Isto remove todos os ensaios e o respetivo histórico. Para confirmar, escreve{' '}
              <strong>apaga os ensaios</strong> no campo abaixo.
            </p>
            <label className="clear-bookings-confirmation-field">
              Confirmação
              <input
                autoComplete="off"
                autoFocus
                disabled={clearBookingsLoading}
                value={clearBookingsConfirmation}
                onChange={(event) => setClearBookingsConfirmation(event.target.value)}
                placeholder="apaga os ensaios"
              />
            </label>
            <div className="admin-modal-actions clear-bookings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={clearBookingsLoading}
                onClick={() => {
                  setClearBookingsModalOpen(false);
                  setClearBookingsConfirmation('');
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-zone-action"
                disabled={
                  clearBookingsLoading ||
                  clearBookingsConfirmation.trim().toLocaleLowerCase('pt-PT') !== 'apaga os ensaios'
                }
                onClick={() => { void handleClearAllBookings(); }}
              >
                {clearBookingsLoading ? 'A eliminar...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {rescheduleDraft ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Reagendar marcacao">
          <section className="card admin-modal-card">
            <h3>Reagendar marcacao</h3>

            <form className="admin-modal-form" onSubmit={handleSubmitReschedule}>
              <label>
                Data
                <input
                  type="date"
                  value={rescheduleDraft.date}
                  onChange={(event) =>
                    setRescheduleDraft((current) =>
                      current
                        ? {
                            ...current,
                            date: event.target.value,
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label>
                Hora
                <input
                  type="time"
                  value={rescheduleDraft.time}
                  onChange={(event) =>
                    setRescheduleDraft((current) =>
                      current
                        ? {
                            ...current,
                            time: event.target.value,
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label>
                Duracao (h)
                <input
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  value={rescheduleDraft.duration}
                  onChange={(event) =>
                    setRescheduleDraft((current) =>
                      current
                        ? {
                            ...current,
                            duration: event.target.value,
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>

                <div className="admin-reschedule-wa">
                  {renderWhatsAppOptIn(
                    rescheduleDraft.bookingId,
                    consegueAbrirWhatsApp(bookings.find((item) => item.id === rescheduleDraft.bookingId) || ({} as PastBooking)),
                  )}
                </div>

              <div className="admin-modal-actions">
                <button type="button" className="secondary-button" onClick={closeRescheduleModal}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Guardar reagendamento
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {paymentDraft ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar pagamento">
          <section className="card admin-modal-card">
            <div className="admin-modal-head">
              <h3>Confirmar pagamento</h3>
            </div>
            <form className="admin-modal-form" onSubmit={handleSubmitPayment}>
              <p className="admin-helper-note">
                Confirma o valor recebido deste ensaio. O valor esperado esta pre-preenchido —
                ajusta se o pagamento foi diferente.
              </p>
              <label>
                Valor esperado
                <input type="text" value={`${formatCurrency(Number(paymentDraft.expected) || 0)}`} readOnly disabled />
              </label>
              <label>
                Valor recebido
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentDraft.received}
                  onChange={(event) =>
                    setPaymentDraft((current) =>
                      current ? { ...current, received: event.target.value } : current,
                    )
                  }
                  autoFocus
                  required
                />
              </label>

              <div className="admin-modal-actions">
                <button type="button" className="secondary-button" onClick={closePaymentModal}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={Boolean(actionLoading[paymentDraft.bookingId])}>
                  {actionLoading[paymentDraft.bookingId] ? 'A confirmar...' : 'Confirmar recebimento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default AdminHistoryPage;
