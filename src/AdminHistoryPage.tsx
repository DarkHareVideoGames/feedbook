import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, CircleDashedCheck, Clock3, MessageCircle, Plus, Radio, RefreshCw, Send, X } from 'lucide-react';
import * as api from './api';
import GlobalLoading from './components/ui/GlobalLoading';
import InstallPwaPrompt from './components/ui/InstallPwaPrompt';
import AdminSetupDiagnostics from './components/ui/AdminSetupDiagnostics';
import { isSupabaseConfigured, supabase } from './supabaseClient';

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
  isDeveloper: boolean;
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
  customerMessage?: string | null;
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
  paymentAssignee?: { id: string; name: string } | null;
  paymentReceivedBy?: { id: string; name: string } | null;
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

// --- Issue #29: throttling de tentativas de login (dissuasor no frontend) ---
// Guarda em localStorage: nº de falhas recentes e até quando o login está bloqueado.
const LOGIN_ATTEMPTS_KEY = 'feedbook-admin-login-attempts';
const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // janela de 10 min para contar as falhas
const LOCKOUT_MS = 15 * 60 * 1000; // bloqueio de 15 min após esgotar as tentativas

type LoginAttemptState = {
  failures: number[];
  lockoutUntil: number;
};

function readLoginAttempts(): LoginAttemptState {
  try {
    const raw = window.localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) return { failures: [], lockoutUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<LoginAttemptState>;
    return {
      failures: Array.isArray(parsed.failures) ? parsed.failures.filter((t) => typeof t === 'number') : [],
      lockoutUntil: typeof parsed.lockoutUntil === 'number' ? parsed.lockoutUntil : 0,
    };
  } catch {
    return { failures: [], lockoutUntil: 0 };
  }
}

function writeLoginAttempts(state: LoginAttemptState): void {
  try {
    window.localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponível (modo privado): o bloqueio não persiste, mas o login continua a funcionar.
  }
}

function lockoutRemainingMs(): number {
  const state = readLoginAttempts();
  return Math.max(0, state.lockoutUntil - Date.now());
}

function formatLockoutRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

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
  { value: 'rejected', label: 'Desmarcados' },
  { value: 'rescheduled', label: 'Reagendados' },
  { value: 'unpaid', label: 'Sem pagamento' },
];

// Escopos de arquivo: limitam registos passados; futuro/hoje fica sempre visivel.
const PERIOD_SCOPE_OPTIONS: Array<{ value: PeriodScope; label: string }> = [
  { value: 'month', label: 'Mes corrente' },
  { value: '3m', label: 'Ultimos 3 meses' },
  { value: '6m', label: 'Ultimos 6 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Tudo' },
];

type HistoryFilter = 'all' | 'pending' | 'rejected' | 'rescheduled' | 'unpaid';

// Escopo temporal: limita quantos registos passados sao mostrados.
// Futuro/hoje fica sempre visivel; 'all' mostra o historico completo.
type PeriodScope = 'month' | '3m' | '6m' | 'year' | 'all';

type AdminPanel = 'unified' | 'finance' | 'contact-requests' | 'users' | 'rooms' | 'services' | 'devtools';

type NewUserDraft = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  function: StaffFunction | null;
  isDeveloper: boolean;
};

type EditUserDraft = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  function: StaffFunction | null;
  isDeveloper: boolean;
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
  longDescription: string;
  longDescriptionEn: string;
  accent: string;
  active: boolean;
  bookingMode: 'booking' | 'contact';
};

type ServiceFormDraft = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
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
  longDescription: '',
  longDescriptionEn: '',
  bookingMode: 'booking',
  accent: 'var(--room-red)',
  active: true,
};

const emptyServiceForm: ServiceFormDraft = {
  id: '',
  name: '',
  nameEn: '',
  description: '',
  descriptionEn: '',
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
    longDescription: room.longDescription,
    longDescriptionEn: room.longDescriptionEn,
    accent: room.accent || 'var(--room-red)',
    active: room.active !== false,
    bookingMode: room.bookingMode,
  };
}

function serviceToForm(service: api.ApiService): ServiceFormDraft {
  return {
    id: service.id,
    name: service.name,
    nameEn: service.nameEn,
    description: service.description,
    descriptionEn: service.descriptionEn,
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
  // Quem recebeu o pagamento (id do utilizador). Omissao: quem confirma.
  receivedById: string;
};

type CustomerNotificationAction = 'confirm' | 'reject' | 'reschedule';

type CustomerNotificationDecision = {
  bookingId: string;
  action: CustomerNotificationAction;
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
  if (booking.status === 'cancelled' || booking.status === 'rejected') return false;
  if (payment === 'refunded') return false;
  // Ensaio confirmado e pago: bloqueado para reagendamento.
  if (booking.status === 'confirmed' && payment === 'received') return false;
  return true;
}

function formatContactPhone(phone?: string): string {
  return String(phone || '').trim().replace(/^(?:\+|00)351[\s.-]*/, '');
}

function formatBookingReference(booking: PastBooking): string {
  const roomName = String(booking.roomName || '')
    .replace(/^sala\s+/i, '')
    .trim();
  const roomInitial = roomName.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || 'X';
  const bookingCode = String(booking.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase().padEnd(6, '0');
  return `FB-${roomInitial}${bookingCode}`;
}

function customerNotificationActionLabel(action: CustomerNotificationAction): string {
  if (action === 'confirm') return 'confirmar o ensaio';
  if (action === 'reject') return 'desmarcar o ensaio';
  return 'reagendar o ensaio';
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
      header: [209, 19, 35],
      stripe: [75, 22, 27],
      text: [254, 202, 202],
    };
  }

  if (normalized.includes('grey') || normalized.includes('gray')) {
    return {
      header: [100, 116, 139],
      stripe: [43, 49, 58],
      text: [226, 232, 240],
    };
  }

  return {
    header: [37, 99, 235],
    stripe: [24, 45, 82],
    text: [191, 219, 254],
  };
}

function normalizarNumeroWhatsApp(numero: string): string {
  return String(numero || '').replace(/\D/g, '');
}

type TipoMensagemWhatsApp = 'confirm' | 'reject' | 'cancel' | 'refund' | 'reschedule';

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

  if (tipo === 'reject') {
    corpo = [
      `O meu nome é ${colaboradorNome}.`,
      `A marcação da banda ${booking.bandName || nomeContato} foi desmarcada pela equipa.`,
      'Se quiseres, podemos ajudar a encontrar outro horário.',
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

function consegueAbrirWhatsApp(contact: { contactPhone?: string | null }): boolean {
  return normalizarNumeroWhatsApp(contact.contactPhone || '').length > 0;
}

function abrirWhatsAppPedidoContacto(request: api.ApiContactRequest, message: string): boolean {
  const numeroNormalizado = normalizarNumeroWhatsApp(request.contactPhone || '');
  if (!numeroNormalizado) return false;

  const mensagem = [
    `Olá ${request.contactName || 'Utilizador'}!`,
    message.trim(),
    `Sala: ${request.roomName}`,
    'Obrigado por escolheres o Feedback - Ensaios.',
  ].join('\n\n');
  const linkWhatsApp = `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensagem)}`;
  window.open(linkWhatsApp, '_blank', 'noopener,noreferrer');
  return true;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function availabilityWeekRange(date: Date): { start: Date; end: Date; startKey: string; endKey: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = start.getDay();
  start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end, startKey: localDateKey(start), endKey: localDateKey(end) };
}

function formatAvailabilityDay(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Hoje';
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekday = date.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
  return `${weekday} ${date.getDate()}`;
}

function contactRequestDateKey(request: api.ApiContactRequest): string {
  const createdAt = new Date(request.createdAt);
  return Number.isNaN(createdAt.getTime()) ? '' : localDateKey(createdAt);
}

function contactRequestStatusTone(status: api.ContactRequestStatus): string {
  if (status === 'contacted') return 'state-confirmed';
  if (status === 'closed') return 'status-void';
  return 'state-pending';
}

function formatContactRequestDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const contactRequestStatusLabel: Record<api.ContactRequestStatus, string> = {
  pending: 'Novo',
  contacted: 'Contactado',
  closed: 'Fechado',
};

function availabilityBookingStart(booking: PastBooking): Date | null {
  const parsed = new Date(`${booking.date}T${booking.time || '00:00'}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function availabilityBookingEnd(booking: PastBooking): Date | null {
  const start = availabilityBookingStart(booking);
  if (!start) return null;
  return new Date(start.getTime() + Math.max(0, Number(booking.duration) || 0) * 60 * 60 * 1000);
}

function formatAvailabilityTime(date: Date | null): string {
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function AdminHistoryPage() {
  const [bookings, setBookings] = useState<PastBooking[]>([]);
  const [contactRequests, setContactRequests] = useState<api.ApiContactRequest[]>([]);
  const [adminLogoVisible, setAdminLogoVisible] = useState(true);
  const [betaEnabled, setBetaEnabled] = useState(true);
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const availabilityRefreshInFlight = useRef(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityNow, setAvailabilityNow] = useState(() => new Date());
  const [minDelayDone, setMinDelayDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Injectar manifest PWA + meta tags apenas na área admin e apenas após autenticação.
  useEffect(() => {
    const head = document.head;
    if (!currentUser) {
      // Garantir remoção caso tenha sido injectado antes.
      head.querySelectorAll('link[href="/admin-manifest.webmanifest"]').forEach((n) => n.remove());
      head.querySelectorAll('link[href="/feedbook-pwa-assets/apple-touch-icon.png"]').forEach((n) => n.remove());
      head.querySelectorAll('link[href="/feedbook-pwa-assets/favicon.png"]').forEach((n) => n.remove());
      return;
    }

    const ensureLink = (rel: string, href: string, extra?: Record<string, string>) => {
      let el = head.querySelector(`link[rel="${rel}"][href="${href}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        el.href = href;
        if (extra) Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
        head.appendChild(el);
      }
      return el;
    };
    ensureLink('manifest', '/admin-manifest.webmanifest');
    ensureLink('apple-touch-icon', '/feedbook-pwa-assets/apple-touch-icon.png');
    ensureLink('icon', '/feedbook-pwa-assets/favicon.png', { sizes: '64x64', type: 'image/png' });

    const ensureMeta = (name: string, content: string) => {
      let el = head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.name = name;
        el.content = content;
        head.appendChild(el);
      } else {
        el.content = content;
      }
      return el;
    };
    ensureMeta('theme-color', '#12141a');
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    ensureMeta('apple-mobile-web-app-title', 'Feedbook Admin');

    return () => {
      head.querySelectorAll('link[href="/admin-manifest.webmanifest"]').forEach((n) => n.remove());
      head.querySelectorAll('link[href="/feedbook-pwa-assets/apple-touch-icon.png"]').forEach((n) => n.remove());
      head.querySelectorAll('link[href="/feedbook-pwa-assets/favicon.png"]').forEach((n) => n.remove());
    };
  }, [currentUser]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [viewFilter, setViewFilter] = useState<HistoryFilter>('all');
  // Escopo de arquivo: por defeito limita ao mes corrente para nao
  // acumular uma lista interminavel. O admin pode alargar ate "Tudo".
  const [periodScope, setPeriodScope] = useState<PeriodScope>('month');
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft | null>(null);
  // Modal de confirmacao de pagamento (substitui o window.confirm nativo):
  // mostra o valor esperado e deixa confirmar/ajustar o valor recebido.
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [customerNotificationDecision, setCustomerNotificationDecision] = useState<CustomerNotificationDecision | null>(null);
  // Escolha do responsavel pelo ensaio (apenas admin/superuser escolhe no dropdown).
  const [assigneeChoice, setAssigneeChoice] = useState<Record<string, string>>({});
  const [financeData, setFinanceData] = useState<FinanceMonthSummary[]>([]);
  const [financeExtrasCatalog, setFinanceExtrasCatalog] = useState<Record<string, number>>({});
  const [activePanel, setActivePanel] = useState<AdminPanel>('unified');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [rooms, setRooms] = useState<api.ApiRoom[]>([]);
  const [services, setServices] = useState<api.ApiService[]>([]);
  const [roomForm, setRoomForm] = useState<RoomFormDraft>(emptyRoomForm);
  const [roomImageFile, setRoomImageFile] = useState<File | null>(null);
  const [roomImageUploading, setRoomImageUploading] = useState(false);
  const [roomSaveLoading, setRoomSaveLoading] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormDraft>(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [showNewRoomForm, setShowNewRoomForm] = useState(false);
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [clearBookingsLoading, setClearBookingsLoading] = useState(false);
  const [clearBookingsModalOpen, setClearBookingsModalOpen] = useState(false);
  const [clearBookingsConfirmation, setClearBookingsConfirmation] = useState('');
  const [contactRequestStep, setContactRequestStep] = useState<'detail' | 'reply' | 'confirm'>('detail');
  const [contactRequestReplyText, setContactRequestReplyText] = useState('');
  const [contactRequestConfirmLoading, setContactRequestConfirmLoading] = useState<boolean>(false);
  const [contactRequestToDelete, setContactRequestToDelete] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [selectedContactRequestId, setSelectedContactRequestId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const contactRequestModalTriggerRef = useRef<HTMLElement | null>(null);
  const contactRequestModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const roomModalTriggerRef = useRef<HTMLElement | null>(null);
  const roomModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const bookingModalTriggerRef = useRef<HTMLElement | null>(null);
  const bookingModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'collaborator',
    function: null,
    isDeveloper: false,
  });
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft | null>(null);

  useEffect(() => {
    if (!catalogNotice) return undefined;

    const timeout = window.setTimeout(() => {
      setCatalogNotice('');
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [catalogNotice]);

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

  const renderBookingActions = (booking: PastBooking) => {
    const isLoading = Boolean(actionLoading[booking.id]);

    return (
      <div className="booking-detail-actions">
        {canConfirmPaymentReceipt(booking) ? (
          <button
            type="button"
            className="primary-button"
            disabled={isLoading}
            onClick={() => handleConfirmPaymentReceipt(booking.id)}
          >
            Confirmar pagamento
          </button>
        ) : null}
        {booking.status === 'pending' ? (
          <button
            type="button"
            className="primary-button"
            disabled={isLoading}
            onClick={() => openCustomerNotificationDecision(booking.id, 'confirm')}
          >
            {isLoading ? 'A processar...' : 'Confirmar ensaio'}
          </button>
        ) : null}
        {booking.status === 'pending' || (booking.status === 'confirmed' && String(booking.paymentStatus || '').toLowerCase() !== 'received') ? (
          <button
            type="button"
            className="secondary-button"
            disabled={isLoading}
            onClick={() => openCustomerNotificationDecision(booking.id, 'reject')}
          >
            {isLoading ? 'A processar...' : 'Desmarcar'}
          </button>
        ) : null}
        {canReschedule(booking) ? (
          <button
            type="button"
            className="secondary-button"
            disabled={isLoading}
            onClick={() => openRescheduleModal(booking)}
          >
            Reagendar
          </button>
        ) : null}
      </div>
    );
  };

  const filteredBookings = useMemo(() => {
    let scoped: PastBooking[];

    if (viewFilter === 'pending') {
      scoped = bookings.filter((booking) => booking.status === 'pending');
    } else if (viewFilter === 'rejected') {
      scoped = bookings.filter((booking) => booking.status === 'rejected');
    } else if (viewFilter === 'rescheduled') {
      scoped = bookings.filter((booking) => Boolean(booking.rescheduledBy));
    } else if (viewFilter === 'unpaid') {
      scoped = bookings.filter((booking) => {
        const payment = String(booking.paymentStatus || '').toLowerCase();
        return booking.status === 'confirmed' && payment !== 'received' && payment !== 'refunded';
      });
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

  const roomAvailability = useMemo(() => {
    const today = localDateKey(availabilityNow);
    const week = availabilityWeekRange(availabilityNow);
    const scheduledBookings = bookings
      .filter(
        (booking) =>
          booking.date >= week.startKey &&
          booking.date <= week.endKey &&
          (booking.status === 'pending' || booking.status === 'confirmed'),
      )
      .sort(
        (left, right) =>
          (availabilityBookingStart(left)?.getTime() ?? 0) -
          (availabilityBookingStart(right)?.getTime() ?? 0),
      );

    return rooms
      .filter((room) => room.active)
      .map((room) => {
        const roomBookings = scheduledBookings.filter(
          (booking) => booking.roomId === room.id || (!booking.roomId && booking.roomName === room.name),
        );
        const roomContactRequests = contactRequests
          .filter((request) => {
            const requestDate = contactRequestDateKey(request);
            return (
              requestDate >= week.startKey &&
              requestDate <= week.endKey &&
              (request.roomId === room.id || (!request.roomId && request.roomName === room.name))
            );
          })
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const currentBooking = roomBookings.find((booking) => {
          if (booking.date !== today || booking.status !== 'confirmed') return false;
          const start = availabilityBookingStart(booking);
          const end = availabilityBookingEnd(booking);
          return Boolean(start && end && availabilityNow >= start && availabilityNow < end);
        });

        const days = Array.from(
          roomBookings.reduce((groups, booking) => {
            const dayBookings = groups.get(booking.date) || [];
            dayBookings.push(booking);
            groups.set(booking.date, dayBookings);
            return groups;
          }, new Map<string, PastBooking[]>()),
          ([date, dayBookings]) => ({
            date,
            label: formatAvailabilityDay(date, today),
            bookings: dayBookings,
          }),
        );

        return { room, bookings: roomBookings, currentBooking, days, contactRequests: roomContactRequests };
      });
  }, [availabilityNow, bookings, contactRequests, rooms]);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) || null,
    [bookings, selectedBookingId],
  );
  const selectedContactRequest = useMemo(
    () => contactRequests.find((request) => request.id === selectedContactRequestId) || null,
    [contactRequests, selectedContactRequestId],
  );
  const editingRoom = useMemo(
    () => rooms.find((room) => room.id === editingRoomId) || null,
    [rooms, editingRoomId],
  );
  const customerNotificationBooking = useMemo(
    () => bookings.find((booking) => booking.id === customerNotificationDecision?.bookingId) || null,
    [bookings, customerNotificationDecision],
  );

  const openBookingModal = (bookingId: string, trigger: HTMLElement) => {
    bookingModalTriggerRef.current = trigger;
    setSelectedBookingId(bookingId);
    setError('');
  };

  const closeBookingModal = () => {
    setSelectedBookingId(null);
    window.requestAnimationFrame(() => bookingModalTriggerRef.current?.focus());
  };

  const openContactRequestModal = (contactRequestId: string, trigger: HTMLElement) => {
    contactRequestModalTriggerRef.current = trigger;
    setSelectedContactRequestId(contactRequestId);
    setContactRequestStep('detail');
    setContactRequestReplyText('');
    setContactRequestConfirmLoading(false);
    setError('');
  };

  const closeContactRequestModal = () => {
    setContactRequestStep('detail');
    setContactRequestReplyText('');
    setContactRequestConfirmLoading(false);
    setSelectedContactRequestId(null);
    window.requestAnimationFrame(() => contactRequestModalTriggerRef.current?.focus());
  };

  const openRoomModal = (room: api.ApiRoom, trigger: HTMLElement) => {
    roomModalTriggerRef.current = trigger;
    setShowNewRoomForm(false);
    setEditingRoomId(room.id);
    setRoomForm(roomToForm(room));
    setRoomImageFile(null);
    setCatalogNotice('');
    setError('');
  };

  const closeRoomModal = () => {
    if (roomSaveLoading || roomImageUploading || (editingRoomId && actionLoading[editingRoomId])) return;
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setRoomImageFile(null);
    setShowNewRoomForm(false);
    window.requestAnimationFrame(() => roomModalTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!selectedContactRequestId || contactRequestStep !== 'detail') return undefined;

    window.requestAnimationFrame(() => contactRequestModalCloseRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        contactRequestStep === 'detail' &&
        !actionLoading[selectedContactRequestId]
      ) {
        closeContactRequestModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedContactRequestId, actionLoading, contactRequestStep]);

  useEffect(() => {
    if (contactRequestStep !== 'reply') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !contactRequestConfirmLoading) {
        setContactRequestStep('detail');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contactRequestStep, contactRequestConfirmLoading]);

  useEffect(() => {
    if (contactRequestStep !== 'confirm') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !contactRequestConfirmLoading) closeContactRequestConfirm();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contactRequestStep, contactRequestConfirmLoading]);

  useEffect(() => {
    if (!selectedBookingId) return undefined;

    window.requestAnimationFrame(() => bookingModalCloseRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBookingModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBookingId]);

  useEffect(() => {
    if ((!editingRoomId && !showNewRoomForm) || roomToDelete) return undefined;

    window.requestAnimationFrame(() => roomModalCloseRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !roomSaveLoading && !roomImageUploading && !(editingRoomId && actionLoading[editingRoomId])) {
        closeRoomModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingRoomId, showNewRoomForm, roomToDelete, roomSaveLoading, roomImageUploading, actionLoading]);

  useEffect(() => {
    if (!roomToDelete) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !actionLoading[roomToDelete]) setRoomToDelete(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomToDelete, actionLoading]);

  useEffect(() => {
    if (!customerNotificationDecision) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || actionLoading[customerNotificationDecision.bookingId]) return;

      const decision = customerNotificationDecision;
      setCustomerNotificationDecision(null);
      if (decision.action !== 'reschedule') {
        window.requestAnimationFrame(() => setSelectedBookingId(decision.bookingId));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customerNotificationDecision, actionLoading]);

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

  const refreshAvailability = async (sessionToken = token) => {
    if (!sessionToken || availabilityRefreshInFlight.current) return;
    availabilityRefreshInFlight.current = true;
    setAvailabilityNow(new Date());
    try {
      await Promise.all([loadHistory(sessionToken), loadContactRequests(sessionToken)]);
      setAvailabilityError('');
    } catch {
      setAvailabilityError('Não foi possível atualizar a disponibilidade das salas.');
    } finally {
      availabilityRefreshInFlight.current = false;
    }
  };

  const loadContactRequests = async (sessionToken: string) => {
    if (!sessionToken) return;
    try {
      const payload = await api.adminContactRequests(sessionToken);
      setContactRequests(payload.contactRequests);
    } catch (err) {
      if (err instanceof api.ApiError && (err.status === 401 || err.status === 403)) {
        setContactRequests([]);
        return;
      }
      setError('Nao foi possivel carregar os pedidos de contacto.');
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
      const [roomsPayload, servicesPayload] = await Promise.all([
        api.listRooms({ includeInactive: true }),
        api.listServices({ includeInactive: true }),
      ]);
      setRooms(roomsPayload.rooms);
      setServices(servicesPayload.services);
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

      await loadCatalogs();
      if (isPrivilegedRole(payload.user.role)) {
        await Promise.all([loadFinance(sessionToken), loadUsers(sessionToken)]);
      }
      await loadContactRequests(sessionToken);
    } catch (_error) {
      throw new Error('Session expired');
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginLoading) return;

    // Issue #29: recusa imediata durante o bloqueio temporário.
    const remaining = lockoutRemainingMs();
    if (remaining > 0) {
      setAuthError(`Demasiadas tentativas. Tenta novamente em ${formatLockoutRemaining(remaining)}.`);
      return;
    }

    setAuthError('');
    setError('');
    setLoginLoading(true);

    try {
      const payload = await api.login(loginEmail, loginPassword);
      // Sucesso: limpa o contador de falhas.
      writeLoginAttempts({ failures: [], lockoutUntil: 0 });
      window.localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
      setCurrentUser(payload.user);
      setLoginPassword('');
      await loadHistory(payload.token);
      await loadContactRequests(payload.token);
      await loadCatalogs();
      if (isPrivilegedRole(payload.user.role)) {
        await Promise.all([loadFinance(payload.token), loadUsers(payload.token)]);
      }
    } catch (authErr) {
      // Falha: regista a tentativa; ao fim de MAX_LOGIN_ATTEMPTS bloqueia por LOCKOUT_MS.
      // Mensagem genérica de propósito (não revela se o email existe).
      const now = Date.now();
      const state = readLoginAttempts();
      const recent = [...state.failures, now].filter((t) => now - t < ATTEMPT_WINDOW_MS);
      if (recent.length >= MAX_LOGIN_ATTEMPTS) {
        const lockoutUntil = now + LOCKOUT_MS;
        writeLoginAttempts({ failures: [], lockoutUntil });
        setAuthError(`Demasiadas tentativas. Tenta novamente em ${formatLockoutRemaining(LOCKOUT_MS)}.`);
      } else {
        writeLoginAttempts({ failures: recent, lockoutUntil: 0 });
        setAuthError('Credenciais invalidas. Verifica email e password.');
      }
      setLoginPassword('');
      if (authErr instanceof TypeError && authErr.message === 'Failed to fetch') {
        setError('Sem ligacao ao servidor. Verifica a tua ligacao e tenta novamente.');
      }
    } finally {
      setLoginLoading(false);
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
    setNewUserDraft({ name: '', email: '', password: '', phone: '', role: 'collaborator', function: null, isDeveloper: false });
    setEditUserDraft(null);
    setShowNewUserForm(false);
    setShowNewRoomForm(false);
    setShowNewServiceForm(false);

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'LOGOUT' });
    }
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
      await api.createUser(sessionToken, { name, email, password, phone, role: newUserDraft.role, function: newUserDraft.function, isDeveloper: newUserDraft.isDeveloper });
      setNewUserDraft({ name: '', email: '', password: '', phone: '', role: 'collaborator', function: null, isDeveloper: false });
      setShowNewUserForm(false);
      await loadUsers(sessionToken);
      setCatalogNotice('Utilizador criado. Enviamos um convite por email para o utilizador definir a password.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel criar utilizador.');
    } finally {
      setUserActionLoading(false);
    }
  };

  const startEditUser = (user: AuthUser) => {
    setShowNewUserForm(false);
    setEditUserDraft({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      role: user.role,
      function: user.function ?? null,
      isDeveloper: user.isDeveloper,
    });
    setCatalogNotice('');
    setError('');
  };

  const cancelEditUser = () => {
    setEditUserDraft(null);
    setShowNewUserForm(false);
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
        isDeveloper: editUserDraft.isDeveloper,
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

  // Reenvia o link de redefinição de password (Issue #9) — ação reservada ao superuser.
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  const handleResendResetLink = async (user: AuthUser) => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || currentUser?.role !== 'superuser' || userActionLoading || resetUserId) return;

    setCatalogNotice('');
    setError('');
    setResetUserId(user.id);
    try {
      const payload = await api.resendPasswordReset(sessionToken, user.email, user.name);
      setCatalogNotice(`Link de redefinicao de password reenviado para ${user.email}.`);
      // payload.message pode variar (ex.: email desativado no servidor).
      if (payload.message && /disabled/i.test(payload.message)) {
        setCatalogNotice('Link gerado, mas o envio de email esta desativado no servidor.');
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel reenviar o link de redefinicao.');
    } finally {
      setResetUserId(null);
    }
  };

  const handleDeleteUser = async (user: AuthUser) => {
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged || userActionLoading) return;
    if (user.role === 'superuser') {
      setError('A conta Superuser está protegida e não pode ser apagada.');
      return;
    }
    if (!window.confirm('Apagar este utilizador?')) return;

    setCatalogNotice('');
    setError('');
    setUserActionLoading(true);
    try {
      const payload = await api.deleteUser(sessionToken, user.id);
      if (editUserDraft?.id === user.id) setEditUserDraft(null);
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

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
    setRoomImageFile(null);
    setShowNewRoomForm(false);
  };

  const handleSaveRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged || roomSaveLoading) return;
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
    const pricePerMemberHour = Number(trimmedPrice);
    // Sem noção de "preco global" (Issue #26): o preco da sala e obrigatorio.
    if (trimmedPrice === '' || !Number.isFinite(pricePerMemberHour) || pricePerMemberHour < 0) {
      setError('Preco da sala invalido. Indica um valor (>= 0).');
      return;
    }
    setCatalogNotice('');
    setError('');
    setRoomSaveLoading(true);
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
        longDescription: roomForm.longDescription,
        longDescriptionEn: roomForm.longDescriptionEn,
        accent: roomForm.accent,
        active: roomForm.active,
        bookingMode: roomForm.bookingMode,
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
    } finally {
      setRoomSaveLoading(false);
    }
  };

  const handleDeleteRoom = async () => {
    const roomId = roomToDelete;
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!roomId || !sessionToken || !isPrivileged || actionLoading[roomId]) return;
    setCatalogNotice('');
    setError('');
    await withActionLock(roomId, async () => {
      const payload = await api.deleteRoom(sessionToken, roomId);
      if (editingRoomId === roomId) {
        setEditingRoomId(null);
        setRoomForm(emptyRoomForm);
        setRoomImageFile(null);
      }
      setRoomToDelete(null);
      await loadCatalogs();
      setCatalogNotice(payload.message || 'Sala removida.');
    });
  };

  const startEditService = (service: api.ApiService) => {
    setShowNewServiceForm(false);
    setEditingServiceId(service.id);
    setServiceForm(serviceToForm(service));
    setCatalogNotice('');
    setError('');
  };

  const cancelEditService = () => {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm);
    setShowNewServiceForm(false);
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
        descriptionEn: serviceForm.descriptionEn,
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

  const handleDeleteService = async () => {
    const serviceId = serviceToDelete;
    if (!serviceId) return;
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isPrivileged) return;
    setCatalogNotice('');
    setError('');
    try {
      await withActionLock(serviceId, async () => {
        const payload = await api.deleteService(sessionToken, serviceId);
        if (editingServiceId === serviceId) cancelEditService();
        await loadCatalogs();
        setCatalogNotice(payload.message || 'Servico removido.');
        setServiceToDelete(null);
      });
    } catch {
      setError('Nao foi possivel apagar o servico.');
    }
  };

  const openCustomerNotificationDecision = (bookingId: string, action: CustomerNotificationAction) => {
    if (action !== 'reschedule') {
      setSelectedBookingId(null);
    }
    setCustomerNotificationDecision({ bookingId, action });
    setError('');
  };

  const closeCustomerNotificationDecision = () => {
    const decision = customerNotificationDecision;
    setCustomerNotificationDecision(null);
    if (decision && decision.action !== 'reschedule') {
      window.requestAnimationFrame(() => setSelectedBookingId(decision.bookingId));
    }
  };

  const handleConfirmBooking = async (bookingId: string, sendWhatsApp: boolean) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
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
      setCustomerNotificationDecision(null);
    });
  };

  const handleConfirmPaymentReceipt = (bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    // Abre o modal inline (em vez do window.confirm nativo) com o valor esperado
    // pre-preenchido, para o colaborador/admin confirmar ou ajustar o recebido.
    setError('');
    setSelectedBookingId(null);
    setPaymentDraft({
      bookingId,
      expected: String(Number(booking.amount || 0).toFixed(2)),
      received: String(Number(booking.amount || 0).toFixed(2)),
      // Por omissao, quem confirma o recebimento e quem recebeu.
      receivedById: currentUser?.id || '',
    });
  };

  const closePaymentModal = () => {
    const bookingId = paymentDraft?.bookingId;
    setPaymentDraft(null);
    if (bookingId) {
      window.requestAnimationFrame(() => setSelectedBookingId(bookingId));
    }
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
        paymentReceivedById: paymentDraft.receivedById || undefined,
      });

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
      setPaymentDraft(null);
    });
  };

  const handleRejectBooking = async (bookingId: string, sendWhatsApp: boolean) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'reject');

      if (sendWhatsApp && booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'reject');
      }

      await loadHistory(token);
      setCustomerNotificationDecision(null);
    });
  };

  const withActionLock = async (bookingId: string, callback: () => Promise<void>) => {
    try {
      setActionLoading((prev) => ({ ...prev, [bookingId]: true }));
      await callback();
      setError('');
    } catch (err) {
      console.error('History action failed:', err);
      if (err instanceof TypeError) {
        setError('Nao foi possivel comunicar com o servico. Verifique a ligacao e tente novamente.');
      } else {
        setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel concluir a acao.');
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const openRescheduleModal = (booking: PastBooking) => {
    setSelectedBookingId(null);
    setRescheduleDraft({
      bookingId: booking.id,
      date: booking.date,
      time: booking.time,
      duration: String(booking.duration),
    });
    setError('');
  };

  const closeRescheduleModal = () => {
    const bookingId = rescheduleDraft?.bookingId;
    setRescheduleDraft(null);
    if (bookingId) {
      window.requestAnimationFrame(() => setSelectedBookingId(bookingId));
    }
  };

  const handleSubmitReschedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!rescheduleDraft) return;

    const booking = bookings.find((item) => item.id === rescheduleDraft.bookingId);
    if (!booking) {
      setError('Marcacao nao encontrada para reagendar.');
      return;
    }

    const nextDuration = Number(rescheduleDraft.duration);
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      setError('Duracao invalida para reagendamento.');
      return;
    }

    if (!rescheduleDraft.date || !rescheduleDraft.time) {
      setError('Data e hora sao obrigatorias para reagendar.');
      return;
    }

    openCustomerNotificationDecision(booking.id, 'reschedule');
  };

  const executeReschedule = async (sendWhatsApp: boolean) => {
    if (!rescheduleDraft) return;

    const booking = bookings.find((item) => item.id === rescheduleDraft.bookingId);
    if (!booking) {
      setError('Marcacao nao encontrada para reagendar.');
      return;
    }

    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const nextDuration = Number(rescheduleDraft.duration);

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

      await loadHistory(token);
      if (isPrivileged) {
        await loadFinance(token);
      }
      setRescheduleDraft(null);
      setCustomerNotificationDecision(null);
    });
  };

  const executeCustomerNotificationDecision = async (sendWhatsApp: boolean) => {
    if (!customerNotificationDecision) return;

    const { bookingId, action } = customerNotificationDecision;
    if (action === 'confirm') {
      await handleConfirmBooking(bookingId, sendWhatsApp);
    } else if (action === 'reject') {
      await handleRejectBooking(bookingId, sendWhatsApp);
    } else {
      await executeReschedule(sendWhatsApp);
    }
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

    const pdfTheme = {
      background: [8, 8, 10] as [number, number, number],
      surface: [20, 20, 23] as [number, number, number],
      surfaceRaised: [29, 29, 33] as [number, number, number],
      border: [58, 58, 64] as [number, number, number],
      header: [38, 38, 43] as [number, number, number],
      badge: [48, 48, 54] as [number, number, number],
      text: [248, 250, 252] as [number, number, number],
      muted: [156, 163, 175] as [number, number, number],
    };
    const themedPages = new Set<number>();
    const paintPage = () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      doc.setFillColor(...pdfTheme.background);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setFillColor(...pdfTheme.header);
      doc.rect(0, 0, pageWidth, 2.2, 'F');
      themedPages.add(pageNumber);
    };
    const paintAutoTablePage = () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      if (!themedPages.has(pageNumber)) paintPage();
    };

    paintPage();

    const receivedTotal = financeDataToShow.reduce((sum, month) => sum + month.totalReceived, 0);
    const periodLabel = financeDataToShow.map((month) => formatFinanceMonthLabel(month.month)).join(', ');
    const logoData = await loadImageAsDataUrl('/feedbook-logoPDF.png');

    doc.setFillColor(...pdfTheme.surface);
    doc.setDrawColor(...pdfTheme.border);
    doc.roundedRect(margin, cursorY - 3, pageWidth - (margin * 2), 22, 3, 3, 'FD');

    if (logoData?.dataUrl) {
      doc.addImage(logoData.dataUrl, logoData.format, margin + 5, cursorY + 3.5, 21, 7);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...pdfTheme.muted);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')}`, pageWidth - margin - 5, cursorY + 8, { align: 'right' });
    cursorY += 24;

    doc.setFillColor(...pdfTheme.badge);
    doc.setDrawColor(...pdfTheme.border);
    doc.roundedRect(margin, cursorY, pageWidth - (margin * 2), 9, 2.5, 2.5, 'FD');
    doc.setTextColor(...pdfTheme.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`PERIODO  ${periodLabel}`, margin + 4, cursorY + 5.8);
    cursorY += 13;

    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      head: [['Recebido', 'Registos']],
      body: [[
        formatCurrency(receivedTotal),
        String(financeDataToShow.reduce((sum, month) => sum + month.bookingCount, 0)),
      ]],
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3, textColor: pdfTheme.text, fillColor: pdfTheme.surfaceRaised, lineColor: pdfTheme.border, lineWidth: 0.2 },
      headStyles: { fillColor: pdfTheme.header, textColor: pdfTheme.text, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fillColor: pdfTheme.surfaceRaised, textColor: pdfTheme.text, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'right' },
        1: { halign: 'center' },
      },
      margin: { left: margin, right: margin },
      willDrawPage: paintAutoTablePage,
    });

    cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
    cursorY += 6;

    const ensureRoom = (requiredHeight = 12) => {
      if (cursorY + requiredHeight > pageHeight - margin) {
        doc.addPage();
        paintPage();
        cursorY = margin;
      }
    };

    for (const month of financeDataToShow) {
      ensureRoom(16);
      doc.setFillColor(...pdfTheme.surface);
      doc.setDrawColor(...pdfTheme.border);
      doc.roundedRect(margin, cursorY - 4, pageWidth - (margin * 2), 14, 2.5, 2.5, 'FD');
      doc.setFillColor(...pdfTheme.border);
      doc.roundedRect(margin + 4, cursorY - 1.5, 2, 9, 1, 1, 'F');
      doc.setTextColor(...pdfTheme.text);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(formatFinanceMonthLabel(month.month), margin + 10, cursorY + 1);
      doc.setFillColor(...pdfTheme.badge);
      doc.setDrawColor(...pdfTheme.border);
      doc.roundedRect(pageWidth - margin - 54, cursorY - 1.8, 50, 8.5, 2.2, 2.2, 'FD');
      doc.setTextColor(...pdfTheme.text);
      doc.setFontSize(8.5);
      doc.text(`Recebido  ${formatCurrency(month.totalReceived)}`, pageWidth - margin - 29, cursorY + 3.7, { align: 'center' });
      cursorY += 13;

      const entries = month.bookings.map((entry) => [
        formatDateDayMonthYear(entry.date),
        entry.roomName || '-',
        entry.paymentStatus === 'refunded' ? 'Devolvido' : 'Recebido',
        entry.bandName || 'Banda',
        formatCurrency(entry.amount),
        entry.paymentReceivedBy?.name || '-',
      ]);

      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        head: [['Data', 'Sala', 'Estado', 'Banda', 'Valor', 'Recebido por']],
        body: entries,
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.4, textColor: pdfTheme.text, fillColor: pdfTheme.surface, lineColor: pdfTheme.border, lineWidth: 0.15 },
        headStyles: { fillColor: pdfTheme.header, textColor: pdfTheme.text, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fillColor: pdfTheme.surface, textColor: pdfTheme.text },
        alternateRowStyles: { fillColor: pdfTheme.surfaceRaised },
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
            hookData.cell.styles.fontStyle = 'bold';
          }

          if (hookData.column.index === 2) {
            hookData.cell.styles.fillColor = pdfTheme.badge;
            hookData.cell.styles.textColor = pdfTheme.text;
            hookData.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: margin, right: margin },
        willDrawPage: paintAutoTablePage,
      });

      cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
      cursorY += 5;

      const collaboratorSummaryRows = summarizeFinanceEntries(month.bookings, (entry) => entry.paymentReceivedBy?.name || 'Sem colaborador')
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

      const printSummaryTable = (title: string, rows: string[][]) => {
        ensureRoom(24);
        doc.setTextColor(...pdfTheme.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(title, margin, cursorY);
        cursorY += 1.5;

        autoTable(doc, {
          startY: cursorY,
          theme: 'grid',
          head: [['Tipo', 'Registos', 'Total']],
          body: rows.length > 0 ? rows : [['Sem dados', '0', formatCurrency(0)]],
          styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: pdfTheme.text, fillColor: pdfTheme.surface, lineColor: pdfTheme.border, lineWidth: 0.15 },
          headStyles: { fillColor: pdfTheme.header, textColor: pdfTheme.text, fontStyle: 'bold', halign: 'center' },
          bodyStyles: { fillColor: pdfTheme.surface, textColor: pdfTheme.text },
          alternateRowStyles: { fillColor: pdfTheme.surfaceRaised },
          columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'center' },
            2: { halign: 'right' },
          },
          margin: { left: margin, right: margin },
          willDrawPage: paintAutoTablePage,
        });

        cursorY = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) ?? cursorY;
        cursorY += 4;
      };

      printSummaryTable('Resumo por colaborador', collaboratorSummaryRows);
      printSummaryTable('Resumo por banda', bandSummaryRows);
      printSummaryTable('Resumo por sala', roomSummaryRows);

      if (extrasServiceSummaries.length > 0) {
        for (const serviceSummary of extrasServiceSummaries) {
          const row = [[serviceSummary.label, String(serviceSummary.count), formatCurrency(serviceSummary.total)]];
          printSummaryTable(`Resumo do servico: ${serviceSummary.label}`, row);
        }
      }
    }

    const footerText = 'Website mantido e criado por Defunctum Noctis © 2026';
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setDrawColor(...pdfTheme.border);
      doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
      doc.setTextColor(...pdfTheme.muted);
      doc.text(footerText, pageWidth / 2, pageHeight - 6, { align: 'center' });
    }

    doc.setTextColor(...pdfTheme.text);

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`feedback-ensaios-contas-${stamp}.pdf`);
  };

  const openContactRequestConfirm = () => {
    if (!contactRequestReplyText.trim()) {
      setError('Escreve a mensagem antes de continuar.');
      return;
    }
    setError('');
    setContactRequestStep('confirm');
  };

  const closeContactRequestConfirm = () => {
    setContactRequestStep('reply');
  };

  const executeContactRequestConfirm = async (sendWhatsApp: boolean) => {
    if (!selectedContactRequestId || !selectedContactRequest || !token || contactRequestConfirmLoading) return;
    const replyText = contactRequestReplyText.trim();
    if (!replyText) return;
    setError('');
    setContactRequestConfirmLoading(true);
    try {
      await api.adminContactRequestReply(token, selectedContactRequestId, replyText, sendWhatsApp ? 'whatsapp' : 'email');
      if (sendWhatsApp) {
        abrirWhatsAppPedidoContacto(selectedContactRequest, replyText);
      }
      setCatalogNotice('Mensagem enviada e pedido marcado como contactado.');
      setContactRequestStep('detail');
      setContactRequestReplyText('');
      closeContactRequestModal();
      await loadContactRequests(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar contacto.');
    } finally {
      setContactRequestConfirmLoading(false);
    }
  };

  const handleContactRequestContact = () => {
    if (!selectedContactRequest || selectedContactRequest.status !== 'pending') return;
    setError('');
    setContactRequestConfirmLoading(false);
    setContactRequestReplyText('');
    setContactRequestStep('reply');
  };

  const handleDeleteContactRequest = async () => {
    const contactRequestId = contactRequestToDelete;
    if (!contactRequestId) return;
    if (!token || currentUser?.role !== 'superuser' || actionLoading[contactRequestId]) return;

    setError('');
    try {
      await withActionLock(contactRequestId, async () => {
        const payload = await api.deleteContactRequest(token, contactRequestId);
        await loadContactRequests(token);
        setCatalogNotice(payload.message);
        setContactRequestToDelete(null);
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Nao foi possivel apagar o pedido de contacto.');
    }
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

  useEffect(() => {
    if (!token || !currentUser) return;

    const clockInterval = window.setInterval(() => setAvailabilityNow(new Date()), 30_000);
    const refreshInterval = window.setInterval(() => {
      void refreshAvailability(token);
    }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshAvailability(token);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const channel = isSupabaseConfigured
      ? supabase
          .channel('admin-room-availability')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
            void refreshAvailability(token);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, () => {
            void refreshAvailability(token);
          })
          .subscribe()
      : null;

    return () => {
      window.clearInterval(clockInterval);
      window.clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [token, currentUser]);

  if (!currentUser) {
    return (
      <>
        <GlobalLoading visible={loading || !minDelayDone} />
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
                  autoComplete="off"
                  value={loginEmail}
                  disabled={loginLoading}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  autoComplete="off"
                  value={loginPassword}
                  disabled={loginLoading}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>

              <button type="submit" className="primary-button" disabled={loginLoading}>
                {loginLoading ? 'A entrar...' : 'Entrar'}
              </button>

              {authError ? <p className="admin-message-error">{authError}</p> : null}
            </form>

            <a href="https://www.ensaiosfeedback.pt/" className="secondary-button admin-link-home">
              Voltar ao site
            </a>
          </section>
        </main>
      </div>
    </>
    );
  }

  return (
    <>
      <GlobalLoading visible={loading || !minDelayDone} />
      <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      {catalogNotice ? (
        <div className="admin-toast" role="status" aria-live="polite">
          <CircleCheck size={18} aria-hidden="true" />
          <span>{catalogNotice}</span>
        </div>
      ) : null}

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
          {currentUser ? (
            <button
              type="button"
              className="admin-user-chip admin-user-chip-button"
              title={currentUser.email}
              onClick={() => setLogoutModalOpen(true)}
            >
              <span className="admin-user-chip-name">{currentUser.name}</span>
              <span className={`admin-user-chip-role admin-role-${currentUser.role}`}>
                {roleLabel[currentUser.role]}
                {currentUser.function ? ` · ${staffFunctionLabels[currentUser.function]}` : ''}
              </span>
            </button>
          ) : null}
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
            onClick={() => setSidebarOpen((current) => !current)}
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
            <button
              type="button"
              className={`admin-sidebar-item ${activePanel === "contact-requests" ? "admin-sidebar-item-active" : ""}`}
              onClick={() => {
                setActivePanel("contact-requests");
                setSidebarOpen(false);
              }}
            >
              Pedidos de contacto
            </button>
            {isPrivileged ? (
              <button
                type="button"
                className={`admin-sidebar-item ${activePanel === "finance" ? "admin-sidebar-item-active" : ""}`}
                onClick={() => {
                  setActivePanel("finance");
                  setSidebarOpen(false);
                }}
              >
                Contas
              </button>
            ) : null}

            <div className="admin-sidebar-separator" role="separator" />

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

            <div className="admin-sidebar-separator" role="separator" />

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
            <button
              type="button"
              className={`admin-sidebar-item ${activePanel === "devtools" ? "admin-sidebar-item-active" : ""}`}
              onClick={() => {
                setActivePanel("devtools");
                setSidebarOpen(false);
              }}
            >
              DevTools
            </button>

            <div className="admin-sidebar-footer">
              <a href="https://www.ensaiosfeedback.pt/" className="admin-sidebar-item admin-sidebar-link" onClick={() => setSidebarOpen(false)}>
                Site publico
              </a>
              <button type="button" className="admin-sidebar-item" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </nav>
        </aside>

        <div className="admin-content">
          {error ? <p className="admin-message-error">{error}</p> : null}
          {loading ? <p className="summary-copy">A carregar...</p> : null}

          {activePanel === 'contact-requests' ? (
            <section className="card admin-section catalog-management-section">
              <div className="section-heading section-heading-row catalog-heading">
                <div>
                  <p className="eyebrow">Contactos</p>
                  <h2>Pedidos de contacto</h2>
                </div>
                <span className="catalog-count">{contactRequests.length} registados</span>
              </div>
              <ul className="admin-user-list catalog-list contact-request-list">
                {contactRequests.map((request) => (
                  <li key={request.id} className="contact-request-card">
                    <button
                      type="button"
                      className="contact-request-card-trigger"
                      onClick={(event) => openContactRequestModal(request.id, event.currentTarget)}
                    >
                      <span className="contact-request-card-head">
                        <span>
                          <strong>{request.contactName}</strong>
                          <small>{request.bandName || 'Sem nome de projeto'}</small>
                        </span>
                        <span className={`status-chip ${contactRequestStatusTone(request.status)}`}>
                          {contactRequestStatusLabel[request.status]}
                        </span>
                      </span>
                      <span className="contact-request-card-room">{request.roomName}</span>
                      {request.status === 'contacted' && request.replyMessage ? (
                        <span className="contact-request-card-reply">
                          <span>Mensagem enviada</span>
                          <span>{request.replyMessage}</span>
                        </span>
                      ) : null}
                      <span className="contact-request-card-footer">
                        <span>{formatContactRequestDate(request.createdAt)}</span>
                        <span className="contact-request-card-open">
                          {request.message ? <MessageCircle aria-hidden="true" size={14} /> : null}
                          <ChevronRight aria-hidden="true" size={18} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {contactRequests.length === 0 ? (
                <p className="summary-copy">Sem pedidos de contacto.</p>
              ) : null}
            </section>
          ) : null}

          {isPrivileged && activePanel === 'users' ? (
            <section className="card admin-section catalog-management-section">
              <div className="section-heading section-heading-row catalog-heading">
                <div>
                  <p className="eyebrow">Utilizadores</p>
                  <h2>Gestao de utilizadores</h2>
                </div>
                <span className="catalog-count">{users.length} registados</span>
              </div>

              <button
                type="button"
                className="secondary-button catalog-create-action"
                onClick={() => {
                  setEditUserDraft(null);
                  setNewUserDraft({
                    name: '',
                    email: '',
                    password: '',
                    phone: '',
                    role: 'collaborator',
                    function: null,
                    isDeveloper: false,
                  });
                  setShowNewUserForm(true);
                }}
                disabled={userActionLoading}
              >
                <Plus size={16} aria-hidden="true" />
                Criar utilizador
              </button>

              {showNewUserForm || editUserDraft ? (
                <form
                  className="admin-create-user catalog-form"
                  onSubmit={editUserDraft ? handleEditUser : handleCreateUser}
                >
                <label>
                  Nome *
                  <input
                    type="text"
                    required
                    autoComplete="off"
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
                    autoComplete="off"
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
                    autoComplete="off"
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
                    autoComplete="off"
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
                    disabled={editUserDraft?.role === 'superuser'}
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

                <label className="extra-toggle">
                  <input
                    type="checkbox"
                    checked={editUserDraft ? editUserDraft.isDeveloper : newUserDraft.isDeveloper}
                    onChange={(event) =>
                      editUserDraft
                        ? setEditUserDraft((current) =>
                            current ? { ...current, isDeveloper: event.target.checked } : current,
                          )
                        : setNewUserDraft((current) => ({ ...current, isDeveloper: event.target.checked }))
                    }
                  />
                  <span>Desenvolvedor</span>
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
                  {editUserDraft || showNewUserForm ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditUser}
                      disabled={userActionLoading}
                    >
                        Cancelar
                    </button>
                  ) : null}
                </div>
                </form>
              ) : null}

              {usersLoading ? <p className="summary-copy">A carregar utilizadores...</p> : null}
              <ul className="admin-user-list catalog-list">
                {users.map((user) => (
                  <li key={user.id}>
                    <div className="admin-user-card-head">
                      <strong>{user.name}</strong>
                    </div>
                    <span>{user.email}</span>
                    <div className="admin-user-badges" aria-label="Perfil e função">
                      <span className={`admin-user-badge admin-user-role-${user.role}`}>
                        {user.role === 'superuser' ? 'Superuser — conta protegida' : roleLabel[user.role]}
                      </span>
                      {user.function ? (
                        <span className="admin-user-badge admin-user-function-badge">
                          {staffFunctionLabels[user.function]}
                        </span>
                      ) : null}
                      {user.isDeveloper ? (
                        <span className="admin-user-badge admin-user-function-badge">Desenvolvedor</span>
                      ) : null}
                    </div>
                    {user.role === 'superuser' && currentUser?.role !== 'superuser' ? null : (
                      <div className="team-actions">
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => startEditUser(user)}
                            disabled={userActionLoading}
                          >
                            Editar
                          </button>
                          {user.role !== 'superuser' && currentUser?.id !== user.id ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void handleDeleteUser(user)}
                              disabled={userActionLoading}
                            >
                              Apagar
                            </button>
                          ) : null}
                          {currentUser?.role === 'superuser' ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void handleResendResetLink(user)}
                              disabled={userActionLoading || resetUserId !== null}
                              title="Reenviar por email o link para o utilizador redefinir a password"
                            >
                              {resetUserId === user.id ? 'A reenviar...' : 'Reenviar link de password'}
                            </button>
                          ) : null}
                        </>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {users.length === 0 && !usersLoading ? (
                <p className="summary-copy">Sem utilizadores registados.</p>
              ) : null}
            </section>
          ) : null}

          {isPrivileged && activePanel === 'rooms' ? (
          <section className="card admin-section catalog-management-section">
            <div className="section-heading section-heading-row catalog-heading">
              <div>
                <p className="eyebrow">Salas</p>
                <h2>Gerir salas</h2>
              </div>
              <span className="catalog-count">{rooms.length} registadas</span>
            </div>
            <button
              type="button"
              className="secondary-button catalog-create-action"
              disabled={roomSaveLoading}
              onClick={(event) => {
                roomModalTriggerRef.current = event.currentTarget;
                cancelEditRoom();
                setShowNewRoomForm(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Criar sala
            </button>
            {showNewRoomForm || editingRoomId ? (
              <div
                className="admin-modal-backdrop room-editor-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="room-editor-title"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeRoomModal();
                }}
              >
                <section className="card admin-modal-card admin-modal-card-wide room-editor-modal">
                  <header className="admin-modal-head room-editor-head">
                    <div>
                      <p className="eyebrow">{editingRoomId ? 'Editar sala' : 'Nova sala'}</p>
                      <h2 id="room-editor-title">{editingRoom?.name || 'Criar sala'}</h2>
                    </div>
                    <button
                      ref={roomModalCloseRef}
                      type="button"
                      className="secondary-button admin-modal-close"
                      aria-label="Fechar editor da sala"
                      disabled={roomSaveLoading || roomImageUploading}
                      onClick={closeRoomModal}
                    >
                      <X aria-hidden="true" size={18} />
                    </button>
                  </header>
                  <form className="admin-create-user room-editor-form" onSubmit={handleSaveRoom}>
              {!editingRoomId ? (
                <label>
                  ID (opcional, ex: sala-blue)
                  <input
                    type="text"
                    autoComplete="off"
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
                  autoComplete="off"
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
                    autoComplete="off"
                    value={roomForm.maxMembers}
                    onChange={(event) => setRoomForm((current) => ({ ...current, maxMembers: event.target.value }))}
                  />
                </label>
                <label>
                  Preco por hora da sala (EUR) *
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    autoComplete="off"
                    value={roomForm.pricePerMemberHour}
                    onChange={(event) => setRoomForm((current) => ({ ...current, pricePerMemberHour: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Modo de reserva
                <select
                  value={roomForm.bookingMode}
                  onChange={(event) => setRoomForm((current) => ({
                    ...current,
                    bookingMode: event.target.value === 'contact' ? 'contact' : 'booking',
                  }))}
                >
                  <option value="booking">Marcação direta</option>
                  <option value="contact">Apenas pedido de contacto</option>
                </select>
              </label>
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
                      disabled={roomImageUploading || roomSaveLoading}
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
              <label>
                Descricao longa (PT)
                <textarea
                  rows={3}
                  value={roomForm.longDescription}
                  onChange={(event) => setRoomForm((current) => ({ ...current, longDescription: event.target.value }))}
                />
              </label>
              <label>
                Descricao longa (EN)
                <textarea
                  rows={3}
                  value={roomForm.longDescriptionEn}
                  onChange={(event) => setRoomForm((current) => ({ ...current, longDescriptionEn: event.target.value }))}
                />
              </label>
              <details className="admin-collapsible">
                <summary className="admin-collapsible-summary">Ver equipamento</summary>
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
              </details>
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
              <div className="admin-user-form-actions room-editor-actions">
                <button type="submit" className="primary-button" disabled={roomImageUploading || roomSaveLoading}>
                  {roomImageUploading
                    ? 'A enviar imagem...'
                    : roomSaveLoading
                      ? 'A guardar...'
                    : editingRoomId
                      ? 'Guardar sala'
                      : 'Adicionar sala'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={roomImageUploading || roomSaveLoading}
                  onClick={closeRoomModal}
                >
                  Cancelar
                </button>
                {editingRoomId ? (
                  <button
                    type="button"
                    className="danger-zone-action room-editor-delete"
                    disabled={Boolean(actionLoading[editingRoomId]) || roomSaveLoading || roomImageUploading}
                    onClick={() => setRoomToDelete(editingRoomId)}
                  >
                    {actionLoading[editingRoomId] ? 'A apagar...' : 'Apagar sala'}
                  </button>
                ) : null}
              </div>
                  </form>
                </section>
              </div>
            ) : null}

            {catalogLoading ? <p className="summary-copy">A carregar salas...</p> : null}
            <ul className="admin-user-list catalog-list room-management-list">
              {rooms.map((room) => (
                <li key={room.id} className="room-management-card">
                  <button
                    type="button"
                    className="room-management-card-trigger"
                    disabled={Boolean(actionLoading[room.id])}
                    onClick={(event) => openRoomModal(room, event.currentTarget)}
                  >
                    <span className="room-management-card-media" style={{ borderColor: room.accent }}>
                      {room.imageUrl ? <img src={room.imageUrl} alt="" /> : <span aria-hidden="true">{room.name.slice(0, 1)}</span>}
                    </span>
                    <span className="room-management-card-content">
                      <span className="room-management-card-head">
                        <strong>{room.name}</strong>
                        <span className={`admin-user-badge ${room.active ? 'admin-room-badge-active' : 'admin-room-badge-inactive'}`}>
                          {room.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </span>
                      <span className="room-management-card-meta">
                        <span>{room.bookingMode === 'contact' ? 'Pedido de contacto' : 'Marcação direta'}</span>
                        <span>Até {room.maxMembers} elementos</span>
                        {room.pricePerMemberHour !== null && room.pricePerMemberHour !== undefined ? (
                          <span>{room.pricePerMemberHour} EUR/h</span>
                        ) : null}
                      </span>
                      <span className="room-management-card-open">
                        Editar sala
                        <ChevronRight aria-hidden="true" size={18} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isPrivileged && activePanel === 'services' ? (
          <section className="card admin-section catalog-management-section">
            <div className="section-heading section-heading-row catalog-heading">
              <div>
                <p className="eyebrow">Servicos</p>
                <h2>Gerir servicos / extras</h2>
              </div>
              <span className="catalog-count">{services.length} registados</span>
            </div>
            <button
              type="button"
              className="secondary-button catalog-create-action"
              onClick={() => {
                cancelEditService();
                setShowNewServiceForm(true);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Criar servico
            </button>
            {showNewServiceForm || editingServiceId ? (
              <form className="admin-create-user catalog-form" onSubmit={handleSaveService}>
              {!editingServiceId ? (
                <label>
                  ID (opcional, ex: mistura)
                  <input
                    type="text"
                    autoComplete="off"
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
                    autoComplete="off"
                    value={serviceForm.name}
                    onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label>
                  Nome (EN)
                  <input
                    type="text"
                    autoComplete="off"
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
               <label>
                 Descricao (EN)
                 <textarea
                   rows={2}
                   value={serviceForm.descriptionEn}
                   onChange={(event) => setServiceForm((current) => ({ ...current, descriptionEn: event.target.value }))}
                 />
               </label>
              <div className="field-row">
                <label>
                  Preco (EUR) *
                  <input
                    type="number"
                    min={0}
                    step="1"
                    autoComplete="off"
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
                {editingServiceId || showNewServiceForm ? (
                  <button type="button" className="secondary-button" onClick={cancelEditService}>
                    Cancelar
                  </button>
                ) : null}
              </div>
              </form>
            ) : null}

            {catalogLoading ? <p className="summary-copy">A carregar servicos...</p> : null}
            <ul className="admin-user-list catalog-list">
              {services.map((service) => (
                <li key={service.id}>
                  <div className="admin-user-card-head">
                    <strong className="admin-user-badge admin-service-name-badge">{service.name}</strong>
                    {!service.active ? <span className="booking-id-chip">inativo</span> : null}
                  <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{service.price} EUR</span>
                  </div>
                  <small>{service.description || 'Sem descricao'}</small>
                  <div className="team-actions">
                    <button type="button" className="secondary-button" onClick={() => startEditService(service)}>
                      Editar
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setServiceToDelete(service.id)}>
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {activePanel === 'devtools' ? (
          <section className="card admin-section catalog-management-section">
            {currentUser ? <AdminSetupDiagnostics token={token} userId={currentUser.id} /> : null}
          </section>
        ) : null}

        {activePanel === 'unified' && !loading ? (
          <section className="card admin-section room-availability-card" aria-label="Disponibilidade das salas">
            <div className="room-availability-header">
              <div className="section-heading">
                <p className="eyebrow room-availability-live-label">
                  <Radio size={14} aria-hidden="true" />
                  Disponibilidade em tempo real
                </p>
              </div>
            </div>

            {availabilityError ? <p className="admin-message-error">{availabilityError}</p> : null}

            {catalogLoading ? (
              <div className="room-availability-state" role="status">
                <RefreshCw className="room-availability-refresh-icon" size={20} aria-hidden="true" />
                <span>A carregar disponibilidade...</span>
              </div>
            ) : roomAvailability.length === 0 ? (
              <div className="room-availability-state">
                <CalendarClock size={20} aria-hidden="true" />
                <span>Não existem salas ativas para apresentar.</span>
              </div>
            ) : (
              <div className="room-availability-grid">
                {roomAvailability.map(({ room, bookings: roomBookings, currentBooking, days, contactRequests: roomContactRequests }) => (
                  <article
                    key={room.id}
                    className={`room-availability-item ${currentBooking ? 'room-availability-item-occupied' : ''}`}
                    style={{ borderTopColor: room.accent }}
                  >
                    <div className="room-availability-room-header">
                      <div>
                        <p className="room-availability-room-name">{room.name}</p>
                        <p className="room-availability-room-count">
                          {room.bookingMode === 'contact'
                            ? `${roomContactRequests.length} pedido${roomContactRequests.length === 1 ? '' : 's'}`
                            : `${roomBookings.length} ensaio${roomBookings.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <span className={`room-availability-status ${currentBooking ? 'is-occupied' : 'is-free'}`}>
                        {currentBooking ? 'Ocupada' : 'Livre'}
                      </span>
                    </div>

                    {currentBooking ? (
                      <div className="room-availability-current">
                        <span className="room-availability-current-label">A decorrer agora</span>
                        <strong>{currentBooking.bandName || currentBooking.contactName || 'Ensaio'}</strong>
                        <span>
                          {currentBooking.time}–{formatAvailabilityTime(availabilityBookingEnd(currentBooking))}
                        </span>
                      </div>
                    ) : null}

                    {room.bookingMode === 'booking' || roomBookings.length > 0 ? (
                      <div className="room-availability-schedule">
                        <p className="room-availability-schedule-title">
                          <Clock3 size={15} aria-hidden="true" />
                          Agenda semanal
                        </p>
                        {roomBookings.length === 0 ? (
                          <p className="room-availability-empty">Sem marcações de segunda a domingo.</p>
                        ) : (
                          <div className="room-availability-days">
                            {days.map((day) => (
                              <div key={day.date} className="room-availability-day">
                                <p className={`room-availability-day-label ${day.date === localDateKey(availabilityNow) ? 'is-today' : ''}`}>
                                  {day.label}
                                </p>
                                <ul>
                                  {day.bookings.map((booking) => (
                                    <li key={booking.id} className={booking.id === currentBooking?.id ? 'is-current' : ''}>
                                      <span className="room-availability-time">
                                        {booking.time}–{formatAvailabilityTime(availabilityBookingEnd(booking))}
                                      </span>
                                      <span className="room-availability-booking-name">
                                        {booking.bandName || booking.contactName || 'Ensaio'}
                                      </span>
                                      <span
                                        className={`room-availability-booking-status is-${booking.status}`}
                                        aria-label={statusLabel[booking.status]}
                                        title={statusLabel[booking.status]}
                                      >
                                        {booking.status === 'confirmed' ? (
                                          <CircleCheck size={17} aria-hidden="true" />
                                        ) : (
                                          <CircleDashedCheck size={17} aria-hidden="true" />
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {room.bookingMode === 'contact' ? (
                      <div className="room-availability-contacts">
                        <p className="room-availability-schedule-title">
                          <MessageCircle size={15} aria-hidden="true" />
                          Pedidos de contacto
                        </p>
                        {roomContactRequests.length === 0 ? (
                          <p className="room-availability-empty">Sem pedidos recebidos esta semana.</p>
                        ) : (
                          <ul>
                            {roomContactRequests.map((request) => {
                              const requestDate = contactRequestDateKey(request);
                              return (
                                <li key={request.id}>
                                  <span className="room-availability-contact-date">
                                    {formatAvailabilityDay(requestDate, localDateKey(availabilityNow))}
                                  </span>
                                  <span className="room-availability-booking-name">
                                    {request.bandName || request.contactName || 'Pedido de contacto'}
                                  </span>
                                  <span className={`room-availability-contact-status is-${request.status}`}>
                                    {contactRequestStatusLabel[request.status]}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {(activePanel === "unified" || activePanel === "finance") && !loading && !error ? (
          <section className="card admin-section">
            <div className="section-heading section-heading-row">
              <div>
                <p className="eyebrow">{activePanel === 'finance' ? 'Gestão financeira' : 'Ensaios'}</p>
                <h2>{activePanel === 'finance' ? 'Contas' : filteredBookings.length === 0 ? 'Sem ensaios neste filtro' : historyCountLabel}</h2>
              </div>
            </div>

            {activePanel === 'finance' && isPrivileged ? (
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
                    <label className="history-select" title="Limitar os meses incluídos na exportação">
                      <span>Período</span>
                      <select value={periodScope} onChange={(event) => setPeriodScope(event.target.value as PeriodScope)}>
                        {PERIOD_SCOPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
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
                                    {summarizeFinanceEntries(receivedEntries, (entry) => entry.paymentReceivedBy?.name || 'Sem colaborador').map((item) => (
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
                      <p>{financeDataToShow.length > 0 ? `${financeDataToShow.length} mês(es) selecionado(s)` : 'Nenhum mes selecionado'}</p>
                    </div>
                    <img className="finance-print-logo" src="/feedbook-logoPDF.png" alt="Feedback - Ensaios" />
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
                                      {summarizeFinanceEntries(receivedEntries, (entry) => entry.paymentReceivedBy?.name || 'Sem colaborador').map((item) => (
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
                                            <div className="finance-print-payment-field"><span>Recebido por</span><strong>{entry.paymentReceivedBy?.name || '-'}</strong></div>
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

            {activePanel === 'unified' ? (
              <div className="history-toolbar">
              <label className="history-select">
                <span>Filtro</span>
                <select
                  value={viewFilter}
                  onChange={(event) => setViewFilter(event.target.value as HistoryFilter)}
                >
                  {HISTORY_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="history-select" title="Limitar registos antigos (o futuro fica sempre visivel)">
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
            ) : null}

            {activePanel === 'unified' && filteredBookings.length > 0 ? (
              <div className="history-table-wrap">
                <table className="history-table history-desktop">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Sala</th>
                      <th>Banda</th>
                      <th>Duracao</th>
                      <th>Pagamento</th>
                      <th>Estado</th>
                      <th>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((b) => (
                      <tr
                        key={b.id}
                        className={`history-booking-row history-row-${b.status} ${isPastConfirmed(b) ? 'history-row-past' : ''} ${roomToneClass(b)}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver detalhes do ensaio de ${b.bandName || b.contactName}`}
                        onClick={(event) => openBookingModal(b.id, event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openBookingModal(b.id, event.currentTarget);
                          }
                        }}
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
                        <td>{b.duration}h</td>
                        <td>
                          <span className={`status-chip ${paymentStatusTone(b)}`}>
                            {paymentStatusLabel(b)}
                          </span>
                        </td>
                        <td>{renderStatusWithAssignee(b)}</td>
                        <td>
                          <button
                            type="button"
                            className="history-details-trigger"
                            onClick={(event) => {
                              event.stopPropagation();
                              openBookingModal(b.id, event.currentTarget);
                            }}
                          >
                            Ver detalhes
                            {b.customerMessage ? <MessageCircle aria-label="Tem mensagem da banda" size={14} /> : null}
                            <ChevronRight aria-hidden="true" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="history-mobile-list">
                  {filteredBookings.map((b) => (
                    <li key={`${b.id}-mobile`} className={`history-mobile-card history-row-${b.status} ${roomToneClass(b)}`}>
                      <button
                        type="button"
                        className="history-mobile-card-trigger"
                        onClick={(event) => openBookingModal(b.id, event.currentTarget)}
                      >
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
                        <span className="history-mobile-card-footer">
                          {b.customerMessage ? (
                            <span className="history-message-indicator">
                              <MessageCircle aria-hidden="true" size={14} /> Mensagem da banda
                            </span>
                          ) : <span />}
                          <ChevronRight aria-hidden="true" size={18} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {activePanel === 'unified' && filteredBookings.length === 0 && !loading ? (
              <p className="summary-copy">Sem ensaios para mostrar.</p>
            ) : null}

            {activePanel === 'unified' && currentUser?.role === 'superuser' ? (
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

      {selectedBooking ? (
        <div
          className="admin-modal-backdrop booking-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-detail-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBookingModal();
          }}
        >
          <section className="card admin-modal-card admin-modal-card-wide booking-detail-modal">
            <header className="booking-detail-header">
              <div className="booking-detail-header-content">
                <div className="booking-detail-title-row">
                  <p className="eyebrow">Detalhes do ensaio</p>
                  <span className="booking-detail-header-reference">{formatBookingReference(selectedBooking)}</span>
                </div>
                <h2 id="booking-detail-title">{selectedBooking.bandName || selectedBooking.contactName}</h2>
                <div className="booking-detail-header-meta">
                  <span>{selectedBooking.roomName}</span>
                  <span className="booking-detail-datetime-badge">
                    {formatDateWithWeekday(selectedBooking.date)} · {selectedBooking.time}
                  </span>
                </div>
              </div>
              <button
                ref={bookingModalCloseRef}
                type="button"
                className="secondary-button admin-modal-close"
                aria-label="Fechar detalhes do ensaio"
                onClick={closeBookingModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="booking-detail-body">
              <div className="booking-detail-status-row">
                {renderStatusWithAssignee(selectedBooking)}
                <span className={`status-chip ${paymentStatusTone(selectedBooking)}`}>
                  Pagamento: {paymentStatusLabel(selectedBooking)}
                </span>
              </div>

              <dl className="booking-detail-grid">
                <div>
                  <dt>Duração</dt>
                  <dd>{selectedBooking.duration}h</dd>
                </div>
                <div>
                  <dt>Contacto</dt>
                  <dd>{selectedBooking.contactName || '-'}</dd>
                </div>
                <div>
                  <dt>Telemóvel</dt>
                  <dd>{formatContactPhone(selectedBooking.contactPhone) || '-'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className="booking-detail-email">{selectedBooking.email || '-'}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>{formatCurrency(Number(selectedBooking.amount || 0))}</dd>
                </div>
              </dl>

              <section className="booking-detail-section" aria-labelledby="booking-extras-title">
                <h3 id="booking-extras-title">Extras</h3>
                {(selectedBooking.extras ?? []).length > 0 ? (
                  <ul className="booking-detail-extras">
                    {(selectedBooking.extras ?? []).map((extraId) => {
                      const service = services.find((item) => item.id === extraId);
                      return <li key={extraId}>{service?.name || formatExtraLabel(extraId)}</li>;
                    })}
                  </ul>
                ) : <p className="booking-detail-empty">Sem extras.</p>}
              </section>

              <section className="booking-detail-section" aria-labelledby="booking-message-title">
                <div className="booking-detail-section-title">
                  <MessageCircle aria-hidden="true" size={17} />
                  <h3 id="booking-message-title">Mensagem da banda</h3>
                </div>
                <p className={selectedBooking.customerMessage ? 'booking-customer-message' : 'booking-detail-empty'}>
                  {selectedBooking.customerMessage || 'Sem mensagem adicional nesta marcação.'}
                </p>
              </section>

              <section className="booking-detail-section" aria-labelledby="booking-history-title">
                <h3 id="booking-history-title">Registo</h3>
                <div className="history-log-lines booking-detail-log">
                  {selectedBooking.confirmedBy ? <p>Confirmado por {selectedBooking.confirmedBy.name}</p> : null}
                  {selectedBooking.rejectedBy ? <p>Desmarcado por {selectedBooking.rejectedBy.name}</p> : null}
                  {selectedBooking.cancelledBy ? <p>Anulado por {selectedBooking.cancelledBy.name}</p> : null}
                  {selectedBooking.refundedBy ? <p>Devolvido por {selectedBooking.refundedBy.name}</p> : null}
                  {selectedBooking.rescheduledBy ? <p>Reagendado por {selectedBooking.rescheduledBy.name}</p> : null}
                  {!selectedBooking.confirmedBy && !selectedBooking.rejectedBy && !selectedBooking.cancelledBy
                    && !selectedBooking.refundedBy && !selectedBooking.rescheduledBy
                    ? <p className="booking-detail-empty">Ainda sem ações registadas.</p>
                    : null}
                </div>
              </section>

              {renderAssigneeSelect(selectedBooking)}
            </div>

            <footer className="booking-detail-footer">
              {renderBookingActions(selectedBooking)}
            </footer>
          </section>
        </div>
      ) : null}

      {selectedContactRequest && contactRequestStep === 'detail' ? (
        <div
          className="admin-modal-backdrop booking-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-request-detail-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionLoading[selectedContactRequest.id]) {
              closeContactRequestModal();
            }
          }}
        >
          <section className="card admin-modal-card admin-modal-card-wide booking-detail-modal contact-request-detail-modal">
            <header className="booking-detail-header">
              <div className="booking-detail-header-content">
                <div className="booking-detail-title-row">
                  <p className="eyebrow">Pedido de contacto</p>
                  <span className={`status-chip ${contactRequestStatusTone(selectedContactRequest.status)}`}>
                    {contactRequestStatusLabel[selectedContactRequest.status]}
                  </span>
                </div>
                <h2 id="contact-request-detail-title">{selectedContactRequest.contactName}</h2>
                <div className="booking-detail-header-meta">
                  <span>{selectedContactRequest.roomName}</span>
                  <span className="booking-detail-datetime-badge">
                    {formatContactRequestDate(selectedContactRequest.createdAt)}
                  </span>
                </div>
              </div>
              <button
                ref={contactRequestModalCloseRef}
                type="button"
                className="secondary-button admin-modal-close"
                aria-label="Fechar detalhes do pedido de contacto"
                disabled={Boolean(actionLoading[selectedContactRequest.id])}
                onClick={closeContactRequestModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <div className="booking-detail-body">
              <dl className="booking-detail-grid">
                <div>
                  <dt>Projeto</dt>
                  <dd>{selectedContactRequest.bandName || 'Sem nome de projeto'}</dd>
                </div>
                <div>
                  <dt>Sala</dt>
                  <dd>{selectedContactRequest.roomName}</dd>
                </div>
                <div>
                  <dt>Telemóvel</dt>
                  <dd>{formatContactPhone(selectedContactRequest.contactPhone) || '-'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd className="booking-detail-email">{selectedContactRequest.email || '-'}</dd>
                </div>
                <div>
                  <dt>Criado em</dt>
                  <dd>{formatContactRequestDate(selectedContactRequest.createdAt)}</dd>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd>{formatContactRequestDate(selectedContactRequest.updatedAt)}</dd>
                </div>
              </dl>

              <section className="booking-detail-section" aria-labelledby="contact-request-message-title">
                <div className="booking-detail-section-title">
                  <MessageCircle aria-hidden="true" size={16} />
                  <h3 id="contact-request-message-title">Mensagem</h3>
                </div>
                <p className={selectedContactRequest.message ? 'booking-customer-message' : 'booking-detail-empty'}>
                  {selectedContactRequest.message || 'Sem mensagem adicional neste pedido.'}
                </p>
              </section>

              {selectedContactRequest.replyMessage ? (
                <section className="booking-detail-section contact-request-reply-detail" aria-labelledby="contact-request-sent-message-title">
                  <div className="booking-detail-section-title">
                    <Send aria-hidden="true" size={16} />
                    <h3 id="contact-request-sent-message-title">Mensagem enviada</h3>
                  </div>
                  <p className="booking-customer-message">{selectedContactRequest.replyMessage}</p>
                  <div className="contact-request-reply-detail-meta">
                    <span>
                      {selectedContactRequest.replyChannel === 'whatsapp' ? 'Email + WhatsApp' : 'Só email'}
                    </span>
                    {selectedContactRequest.repliedAt ? (
                      <span>{formatContactRequestDate(selectedContactRequest.repliedAt)}</span>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <footer className="booking-detail-footer contact-request-detail-actions">
              {selectedContactRequest.status === 'pending' ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(actionLoading[selectedContactRequest.id])}
                  onClick={handleContactRequestContact}
                >
                  {actionLoading[selectedContactRequest.id] || contactRequestConfirmLoading ? 'A processar...' : 'Contactar'}
                </button>
              ) : null}
              {currentUser?.role === 'superuser' ? (
                <button
                  type="button"
                  className="danger-zone-action"
                  disabled={Boolean(actionLoading[selectedContactRequest.id])}
                  onClick={() => setContactRequestToDelete(selectedContactRequest.id)}
                >
                  Apagar
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}

      {contactRequestStep === 'reply' && selectedContactRequest ? (
        <div
          className="admin-modal-backdrop contact-request-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-request-reply-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !contactRequestConfirmLoading) {
              setContactRequestStep('detail');
            }
          }}
        >
          <section className="card admin-modal-card contact-request-reply-modal">
            <div className="admin-modal-head">
              <div>
                <p className="eyebrow">Contactar cliente</p>
                <h3 id="contact-request-reply-title">Escrever mensagem</h3>
              </div>
              <button
                type="button"
                className="secondary-button admin-modal-close"
                aria-label="Fechar mensagem"
                disabled={contactRequestConfirmLoading}
                onClick={() => setContactRequestStep('detail')}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <p className="admin-helper-note">
              A mensagem será enviada a {selectedContactRequest.contactName} por email e, se escolheres, também por WhatsApp.
            </p>
            <label className="contact-request-reply-field" htmlFor="contact-request-reply-text">
              Mensagem
              <textarea
                id="contact-request-reply-text"
                autoFocus
                rows={7}
                value={contactRequestReplyText}
                disabled={contactRequestConfirmLoading}
                onChange={(event) => setContactRequestReplyText(event.target.value)}
                placeholder="Escreve a mensagem para o cliente..."
              />
            </label>
            <div className="admin-modal-actions contact-request-reply-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={contactRequestConfirmLoading}
                onClick={() => setContactRequestStep('detail')}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={contactRequestConfirmLoading || !contactRequestReplyText.trim()}
                onClick={openContactRequestConfirm}
              >
                Enviar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contactRequestStep === 'confirm' && selectedContactRequest ? (
        <div
          className="admin-modal-backdrop contact-request-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-request-confirm-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !contactRequestConfirmLoading) {
              closeContactRequestConfirm();
            }
          }}
        >
          <section className="card admin-modal-card customer-notification-modal contact-request-confirm-modal">
            <div className="customer-notification-modal-icon">
              <MessageCircle aria-hidden="true" size={20} />
            </div>
            <h3 id="contact-request-confirm-title">Enviar mensagem por WhatsApp?</h3>
            <p>
              Vais enviar o email a {selectedContactRequest.contactName} e marcar o pedido como contactado.
              Queres enviar também a mensagem por WhatsApp?
            </p>
            {!consegueAbrirWhatsApp(selectedContactRequest) ? (
              <p className="admin-helper-note">Este pedido não tem um número válido para WhatsApp.</p>
            ) : null}
            <div className="admin-modal-actions customer-notification-actions">
              <button
                type="button"
                className="secondary-button"
                autoFocus
                disabled={contactRequestConfirmLoading}
                onClick={() => { void executeContactRequestConfirm(false); }}
              >
                {contactRequestConfirmLoading ? 'A processar...' : 'Não, só email'}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={contactRequestConfirmLoading || !consegueAbrirWhatsApp(selectedContactRequest)}
                onClick={() => { void executeContactRequestConfirm(true); }}
              >
                {contactRequestConfirmLoading ? 'A processar...' : 'Sim, email + WhatsApp'}
              </button>
            </div>
            <button
              type="button"
              className="admin-modal-cancel-link"
              disabled={contactRequestConfirmLoading}
              onClick={closeContactRequestConfirm}
            >
              Voltar sem executar
            </button>
          </section>
        </div>
      ) : null}

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

      {contactRequestToDelete ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-contact-request-modal-title"
        >
          <section className="card admin-modal-card clear-bookings-modal">
            <div className="clear-bookings-modal-alert">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.25} />
              <span>Operação irreversível</span>
            </div>
            <h3 id="delete-contact-request-modal-title">Apagar pedido de contacto?</h3>
            <p>
              Este pedido será removido definitivamente e deixará de estar disponível no painel de gestão.
            </p>
            <div className="admin-modal-actions clear-bookings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(actionLoading[contactRequestToDelete])}
                onClick={() => setContactRequestToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-zone-action"
                disabled={Boolean(actionLoading[contactRequestToDelete])}
                onClick={() => { void handleDeleteContactRequest(); }}
              >
                {actionLoading[contactRequestToDelete] ? 'A apagar...' : 'Apagar definitivamente'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {roomToDelete ? (
        <div
          className="admin-modal-backdrop room-delete-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-room-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionLoading[roomToDelete]) setRoomToDelete(null);
          }}
        >
          <section className="card admin-modal-card clear-bookings-modal">
            <div className="clear-bookings-modal-alert">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.25} />
              <span>Operação irreversível</span>
            </div>
            <h3 id="delete-room-modal-title">Apagar {editingRoom?.name || 'esta sala'}?</h3>
            <p>
              A sala será removida. Se tiver marcações associadas, será arquivada para preservar o histórico.
            </p>
            <div className="admin-modal-actions clear-bookings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(actionLoading[roomToDelete])}
                onClick={() => setRoomToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-zone-action"
                disabled={Boolean(actionLoading[roomToDelete])}
                onClick={() => { void handleDeleteRoom(); }}
              >
                {actionLoading[roomToDelete] ? 'A apagar...' : 'Apagar sala'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {serviceToDelete ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-service-modal-title"
        >
          <section className="card admin-modal-card clear-bookings-modal">
            <div className="clear-bookings-modal-alert">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.25} />
              <span>Operação irreversível</span>
            </div>
            <h3 id="delete-service-modal-title">Apagar serviço?</h3>
            <p>
              Este serviço será removido. Se estiver em uso, será arquivado.
            </p>
            <div className="admin-modal-actions clear-bookings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(actionLoading[serviceToDelete])}
                onClick={() => setServiceToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-zone-action"
                disabled={Boolean(actionLoading[serviceToDelete])}
                onClick={() => { void handleDeleteService(); }}
              >
                {actionLoading[serviceToDelete] ? 'A apagar...' : 'Apagar definitivamente'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {logoutModalOpen ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
        >
          <section className="card admin-modal-card clear-bookings-modal">
            <h3 id="logout-modal-title">Sair da conta?</h3>
            <p>
              Vais terminar a sessão atual. Tens a certeza que queres sair?
            </p>
            <div className="admin-modal-actions clear-bookings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLogoutModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setLogoutModalOpen(false);
                  handleLogout();
                }}
              >
                Sair
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {rescheduleDraft && customerNotificationDecision?.action !== 'reschedule' ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Reagendar marcacao">
          <section className="card admin-modal-card">
            <h3>Reagendar marcacao</h3>

            <form className="admin-modal-form" onSubmit={handleSubmitReschedule}>
              <label>
                Data
                <input
                  type="date"
                  autoComplete="off"
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
                  autoComplete="off"
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
                  autoComplete="off"
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

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(actionLoading[rescheduleDraft.bookingId])}
                  onClick={closeRescheduleModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={Boolean(actionLoading[rescheduleDraft.bookingId])}
                >
                  {actionLoading[rescheduleDraft.bookingId] ? 'A guardar...' : 'Guardar reagendamento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {customerNotificationDecision && customerNotificationBooking ? (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-notification-title"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
              && !actionLoading[customerNotificationDecision.bookingId]
            ) {
              closeCustomerNotificationDecision();
            }
          }}
        >
          <section className="card admin-modal-card customer-notification-modal">
            <div className="customer-notification-modal-icon">
              <MessageCircle aria-hidden="true" size={20} />
            </div>
            <h3 id="customer-notification-title">Enviar mensagem por WhatsApp?</h3>
            <p>
              Vais {customerNotificationActionLabel(customerNotificationDecision.action)} e enviar o email à banda.
              Queres enviar também a mensagem por WhatsApp?
            </p>
            {!consegueAbrirWhatsApp(customerNotificationBooking) ? (
              <p className="admin-helper-note">Esta marcação não tem um número válido para WhatsApp.</p>
            ) : null}
            <div className="admin-modal-actions customer-notification-actions">
              <button
                type="button"
                className="secondary-button"
                autoFocus
                disabled={Boolean(actionLoading[customerNotificationDecision.bookingId])}
                onClick={() => { void executeCustomerNotificationDecision(false); }}
              >
                {actionLoading[customerNotificationDecision.bookingId] ? 'A processar...' : 'Não, só email'}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  Boolean(actionLoading[customerNotificationDecision.bookingId])
                  || !consegueAbrirWhatsApp(customerNotificationBooking)
                }
                onClick={() => { void executeCustomerNotificationDecision(true); }}
              >
                {actionLoading[customerNotificationDecision.bookingId] ? 'A processar...' : 'Sim, email + WhatsApp'}
              </button>
            </div>
            <button
              type="button"
              className="admin-modal-cancel-link"
              disabled={Boolean(actionLoading[customerNotificationDecision.bookingId])}
              onClick={closeCustomerNotificationDecision}
            >
              Voltar sem executar
            </button>
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
                  autoComplete="off"
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
              <label>
                Quem recebeu
                <select
                  className="assignee-select"
                  value={paymentDraft.receivedById}
                  onChange={(event) =>
                    setPaymentDraft((current) =>
                      current ? { ...current, receivedById: event.target.value } : current,
                    )
                  }
                >
                  {!users.some((user) => user.id === paymentDraft.receivedById) ? (
                    <option value={currentUser?.id || ''}>{currentUser?.name || 'Eu'}</option>
                  ) : null}
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(actionLoading[paymentDraft.bookingId])}
                  onClick={closePaymentModal}
                >
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
      {currentUser ? <InstallPwaPrompt /> : null}
    </>
  );
}

export default AdminHistoryPage;
