import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as api from './api';

type Role = 'admin' | 'collaborator' | 'technician';

const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  collaborator: 'Colab',
  technician: 'Tech',
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
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

type HistoryFilter = 'all' | 'pending' | 'confirmed' | 'past' | 'cancelled' | 'refunded' | 'rejected';

type AdminPanel = 'unified' | 'users' | 'rooms' | 'services' | 'pricing';

type NewUserDraft = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type EditUserDraft = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
};

type RoomFormDraft = {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
  maxMembers: string;
  pricePerMemberHour: string;
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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M16 4.5C9.6 4.5 4.5 9.6 4.5 16c0 2 .5 3.9 1.4 5.6L4.5 27.5l5.9-1.4c1.7.9 3.6 1.4 5.6 1.4C22.4 27.5 27.5 22.4 27.5 16S22.4 4.5 16 4.5Zm0 2.7c5.1 0 9.3 4.2 9.3 9.3 0 5.1-4.2 9.3-9.3 9.3-1.7 0-3.3-.5-4.7-1.3l-4.1 1 1.1-4.1a9.2 9.2 0 0 1-1.3-4.8c0-5.1 4.2-9.3 9.3-9.3Zm-2.1 5.1h.1c.2 0 .4.1.5.3l.5 1.3c.1.1.1.3 0 .5l-.4.5c-.1.1-.1.3 0 .4.5.7 1.3 1.4 2.1 1.9.2.2.5.2.6 0l.6-.7c.1-.1.3-.1.5 0l1.3.7c.2.1.2.4.1.6l-.9 1.5c-.2.3-.6.4-1 .3-1.4-.5-2.9-1.7-3.9-3.1-.8-1.1-1.2-2.2-1.1-3.1.1-.5.3-.7.8-.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AdminHistoryPage() {
  const [bookings, setBookings] = useState<PastBooking[]>([]);
  const [adminLogoVisible, setAdminLogoVisible] = useState(true);
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('admin@feedbook.local');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [viewFilter, setViewFilter] = useState<HistoryFilter>('all');
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft | null>(null);
  const [financeData, setFinanceData] = useState<FinanceMonthSummary[]>([]);
  const [financeExtrasCatalog, setFinanceExtrasCatalog] = useState<Record<string, number>>({});
  const [selectedFinanceMonths, setSelectedFinanceMonths] = useState<string[]>([]);
  const [showFinance, setShowFinance] = useState(false);
  const [activePanel, setActivePanel] = useState<AdminPanel>('unified');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rooms, setRooms] = useState<api.ApiRoom[]>([]);
  const [services, setServices] = useState<api.ApiService[]>([]);
  const [globalRate, setGlobalRate] = useState('');
  const [pricingDraft, setPricingDraft] = useState<Record<string, string>>({});
  const [roomForm, setRoomForm] = useState<RoomFormDraft>(emptyRoomForm);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormDraft>(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({
    name: '',
    email: '',
    password: '',
    role: 'collaborator',
  });
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft | null>(null);
  const isAdmin = currentUser?.role === 'admin';

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
    if (status === 'paid' || status === 'received' || status === 'pay-on-site') return 'status-paid';
    return 'status-pending';
  };

  const canConfirmPaymentReceipt = (booking: PastBooking) => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'collaborator' && currentUser?.role !== 'technician') {
      return false;
    }

    const paymentStatus = String(booking.paymentStatus || '').toLowerCase();
    return booking.status === 'confirmed' && paymentStatus !== 'received' && paymentStatus !== 'refunded';
  };

  const filteredBookings = useMemo(() => {
    let scoped: PastBooking[];

    if (viewFilter === 'all') {
      scoped = bookings;
    } else if (viewFilter === 'pending') {
      scoped = bookings.filter((booking) => booking.status === 'pending');
    } else if (viewFilter === 'confirmed') {
      scoped = bookings.filter((booking) => isFutureOrTodayConfirmed(booking));
    } else if (viewFilter === 'rejected') {
      scoped = bookings.filter((booking) => booking.status === 'rejected');
    } else if (viewFilter === 'cancelled') {
      scoped = bookings.filter((booking) => booking.status === 'cancelled');
    } else if (viewFilter === 'refunded') {
      scoped = bookings.filter((booking) => String(booking.paymentStatus || '').toLowerCase() === 'refunded');
    } else {
      scoped = bookings.filter((booking) => isPastConfirmed(booking));
    }

    return [...scoped].sort((a, b) => {
      const rankDiff = bookingSortRank(a) - bookingSortRank(b);
      if (rankDiff !== 0) return rankDiff;

      const timeDiff = bookingDateTimeValue(a) - bookingDateTimeValue(b);
      if (timeDiff !== 0) return timeDiff;

      return a.id.localeCompare(b.id);
    });
  }, [bookings, viewFilter]);

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
        const draft: Record<string, string> = {};
        for (const [key, value] of Object.entries(pricingPayload.pricing.extras ?? {})) {
          draft[key] = String(value);
        }
        setPricingDraft(draft);
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

      if (payload.user.role === 'admin') {
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
      if (payload.user.role === 'admin') {
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
    setNewUserDraft({ name: '', email: '', password: '', role: 'collaborator' });
    setEditUserDraft(null);
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isAdmin || userActionLoading) return;

    const name = newUserDraft.name.trim();
    const email = newUserDraft.email.trim().toLowerCase();
    const password = newUserDraft.password;

    if (!name || !email || !password) {
      setError('Preenche nome, email e password para criar o utilizador.');
      return;
    }
    if (password.length < 6) {
      setError('A password precisa de pelo menos 6 caracteres.');
      return;
    }

    setCatalogNotice('');
    setError('');
    setUserActionLoading(true);
    try {
      await api.createUser(sessionToken, { name, email, password, role: newUserDraft.role });
      setNewUserDraft({ name: '', email: '', password: '', role: 'collaborator' });
      await loadUsers(sessionToken);
      setCatalogNotice('Utilizador criado com sucesso.');
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
      password: '',
      role: user.role,
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
    if (!sessionToken || !isAdmin || !editUserDraft || userActionLoading) return;

    const name = editUserDraft.name.trim();
    const email = editUserDraft.email.trim().toLowerCase();

    if (!name || !email) {
      setError('Nome e email nao podem ficar vazios.');
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
        password: editUserDraft.password,
        role: editUserDraft.role,
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
    if (!sessionToken || !isAdmin || userActionLoading) return;
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

  const startEditRoom = (room: api.ApiRoom) => {
    setEditingRoomId(room.id);
    setRoomForm(roomToForm(room));
    setCatalogNotice('');
    setError('');
  };

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
  };

  const handleSaveRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isAdmin) return;
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
      const draft: api.RoomDraft = {
        id: editingRoomId ?? (roomForm.id.trim() || undefined),
        name: trimmedName,
        description: roomForm.description,
        descriptionEn: roomForm.descriptionEn,
        maxMembers: Math.floor(maxMembers),
        pricePerMemberHour,
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
    if (!sessionToken || !isAdmin) return;
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
    if (!sessionToken || !isAdmin) return;
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
    if (!sessionToken || !isAdmin) return;
    if (!window.confirm('Apagar este servico? Se estiver em uso, sera arquivado.')) return;
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

  const handleSavePricing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sessionToken = window.localStorage.getItem(TOKEN_KEY);
    if (!sessionToken || !isAdmin) return;
    const parsedRate = Number(globalRate);
    const parsedExtras: Record<string, number> = {};
    for (const [key, raw] of Object.entries(pricingDraft)) {
      parsedExtras[key] = Number(raw);
    }
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || Object.values(parsedExtras).some((value) => !Number.isFinite(value) || value < 0)) {
      setError('Valores invalidos. Usa numeros validos.');
      return;
    }
    setCatalogNotice('');
    setError('');
    try {
      await api.updatePricing(sessionToken, { perMemberPerHour: parsedRate, extras: parsedExtras });
      await loadCatalogs();
      setCatalogNotice('Precos atualizados com sucesso.');
    } catch {
      setError('Nao foi possivel guardar os precos.');
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'confirm');

      if (booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'confirm');
      }

      await loadHistory(token);
      if (currentUser?.role === 'admin') {
        await loadFinance(token);
      }
    });
  };

  const handleConfirmPaymentReceipt = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);
    const shouldConfirm = window.confirm('Desejas confirmar que recebeste o pagamento deste ensaio?');
    if (!shouldConfirm) return;

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'confirm-payment', {
        amount: booking?.amount ?? 0,
      });

      await loadHistory(token);
      if (currentUser?.role === 'admin') {
        await loadFinance(token);
      }
    });
  };

  const handleRejectBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'reject');

      if (booking && consegueAbrirWhatsApp(booking)) {
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

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'cancel');

      if (booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'cancel');
      }

      await loadHistory(token);
      if (currentUser?.role === 'admin') {
        await loadFinance(token);
      }
    });
  };

  const handleRefundBooking = async (bookingId: string) => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const booking = bookings.find((item) => item.id === bookingId);

    await withActionLock(bookingId, async () => {
      await api.bookingAction(token, bookingId, 'refund');

      if (booking && consegueAbrirWhatsApp(booking)) {
        abrirWhatsAppMensagem(booking, currentUser?.name || 'Feedback - Ensaios', 'refund');
      }

      await loadHistory(token);
      if (currentUser?.role === 'admin') {
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

      if (consegueAbrirWhatsApp(booking)) {
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
      if (currentUser?.role === 'admin') {
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

  const selectedFinanceData = useMemo(
    () => financeData.filter((month) => selectedFinanceMonths.includes(month.month)),
    [financeData, selectedFinanceMonths],
  );

  const toggleFinanceMonth = (monthKey: string) => {
    setSelectedFinanceMonths((current) =>
      current.includes(monthKey)
        ? current.filter((value) => value !== monthKey)
        : [...current, monthKey],
    );
  };

  const handlePrintFinance = async () => {
    if (selectedFinanceData.length === 0) {
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

    const receivedTotal = selectedFinanceData.reduce((sum, month) => sum + month.totalReceived, 0);
    const refundedTotal = selectedFinanceData.reduce((sum, month) => sum + month.totalRefunded, 0);
    const netTotal = selectedFinanceData.reduce((sum, month) => sum + month.netTotal, 0);
    const periodLabel = selectedFinanceData.map((month) => formatFinanceMonthLabel(month.month)).join(', ');
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
      head: [['Recebido', 'Devolvido', 'Liquido', 'Registos']],
      body: [[
        formatCurrency(receivedTotal),
        formatCurrency(refundedTotal),
        formatCurrency(netTotal),
        String(selectedFinanceData.reduce((sum, month) => sum + month.bookingCount, 0)),
      ]],
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3, textColor: [17, 24, 39] },
      headStyles: { fillColor: [178, 223, 200], textColor: [27, 67, 50], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [243, 253, 247] },
      columnStyles: {
        0: { halign: 'right' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'center' },
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

    for (const month of selectedFinanceData) {
      ensureRoom(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(formatFinanceMonthLabel(month.month), margin, cursorY);
      cursorY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(
        `Recebido: ${formatCurrency(month.totalReceived)}   Devolvido: ${formatCurrency(month.totalRefunded)}   Liquido: ${formatCurrency(month.netTotal)}`,
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
    if (financeData.length === 0) {
      setSelectedFinanceMonths([]);
      return;
    }

    setSelectedFinanceMonths((current) => {
      const validMonths = financeData.map((month) => month.month);
      const nextSelection = current.filter((month) => validMonths.includes(month));
      if (nextSelection.length > 0) {
        return nextSelection;
      }
      return validMonths;
    });
  }, [financeData]);

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
    Promise.all([restoreSession(sessionToken), loadHistory(sessionToken)])
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
        {!loading && isAdmin ? (
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
            {isAdmin ? (
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
            {isAdmin ? (
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
                <button
                  type="button"
                  className={`admin-sidebar-item ${activePanel === "pricing" ? "admin-sidebar-item-active" : ""}`}
                  onClick={() => {
                    setActivePanel("pricing");
                    setSidebarOpen(false);
                  }}
                >
                  Precos
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
                <span className={`admin-user-chip-role admin-role-${currentUser.role}`}>{roleLabel[currentUser.role]}</span>
              </div>
            ) : null}
          </div>
          {error ? <p className="admin-message-error">{error}</p> : null}
          {catalogNotice ? <p className="confirmation">{catalogNotice}</p> : null}
          {loading ? <p className="summary-copy">A carregar...</p> : null}

          {isAdmin && activePanel === 'users' ? (
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
                  Password {editUserDraft ? '(vazio = manter atual)' : '*'}
                  <input
                    type="password"
                    required={!editUserDraft}
                    autoComplete="new-password"
                    placeholder={editUserDraft ? 'Deixar vazio para manter' : ''}
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
                    <option value="admin">Administradores</option>
                    <option value="collaborator">Membros da Equipa</option>
                    <option value="technician">Tecnicos</option>
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
                    <span>{roleLabel[user.role]}</span>
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

          {isAdmin && activePanel === 'rooms' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Salas</p>
              <h2>Gerir salas</h2>
            </div>
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
                  Capacidade (musicos) *
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
                  Preco proprio EUR/hora/elemento (vazio = usa preco global)
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
                <button type="submit" className="primary-button">
                  {editingRoomId ? 'Guardar sala' : 'Adicionar sala'}
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
                    Ate {room.maxMembers} musicos ·{' '}
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

        {isAdmin && activePanel === 'services' ? (
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

        {isAdmin && activePanel === 'pricing' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Precos</p>
              <h2>Atualizar tabela de precos</h2>
            </div>
            <form className="admin-pricing-grid" onSubmit={handleSavePricing}>
              <label>
                Preco por elemento/hora (EUR)
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={globalRate}
                  onChange={(event) => setGlobalRate(event.target.value)}
                />
              </label>

              {Object.entries(pricingDraft).map(([extraId, rawValue]) => {
                const service = services.find((item) => item.id === extraId);
                const label = service ? service.name : extraId;
                return (
                  <label key={extraId}>
                    Extra {label} (EUR)
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={rawValue}
                      onChange={(event) =>
                        setPricingDraft((current) => ({ ...current, [extraId]: event.target.value }))
                      }
                    />
                  </label>
                );
              })}

              <p className="admin-helper-note">Para adicionar ou remover extras, usa o painel Servicos.</p>

              <button type="submit" className="primary-button">
                Guardar precos
              </button>
            </form>
          </section>
        ) : null}

        {activePanel === "unified" && !loading && !error ? (
          <section className="card admin-section">
            <div className="section-heading section-heading-row">
              <div>
                <p className="eyebrow">Ensaios</p>
                <h2>{filteredBookings.length === 0 ? 'Sem ensaios neste filtro' : historyCountLabel}</h2>
              </div>
              {currentUser.role === 'admin' ? (
                <button type="button" className="secondary-button" onClick={() => setShowFinance((value) => !value)}>
                  {showFinance ? 'Esconder contas' : 'Ver contas'}
                </button>
              ) : null}
            </div>

            {currentUser.role === 'admin' && showFinance ? (
              <div className="finance-panel">
                <div className="finance-stat-grid">
                  <div className="finance-stat">
                    <span>Total recebido</span>
                    <strong>{formatCurrency(totals.totalReceived)}</strong>
                  </div>
                  <div className="finance-stat">
                    <span>Total devolvido</span>
                    <strong>{formatCurrency(totals.totalRefunded)}</strong>
                  </div>
                  <div className="finance-stat">
                    <span>Liquido</span>
                    <strong>{formatCurrency(totals.netTotal)}</strong>
                  </div>
                  <div className="finance-stat">
                    <span>Pagamentos</span>
                    <strong>{String(totals.bookingCount)}</strong>
                  </div>
                </div>

                {financeData.length > 0 ? (
                  <div className="finance-export-bar">
                    <div className="finance-month-picker">
                      {financeData.map((month) => (
                        <label key={month.month} className="finance-month-toggle">
                          <input
                            type="checkbox"
                            checked={selectedFinanceMonths.includes(month.month)}
                            onChange={() => toggleFinanceMonth(month.month)}
                          />
                          <span>{month.month}</span>
                        </label>
                      ))}
                    </div>
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
                      const refundedEntries = month.bookings.filter((entry) => entry.paymentStatus === 'refunded');

                      return (
                        <article key={month.month} className="finance-month-card">
                          <div className="finance-month-head">
                            <strong>{month.month}</strong>
                            <span>{month.bookingCount} registos</span>
                          </div>
                          <div className="finance-month-values">
                            <p>Recebido: <strong>{formatCurrency(month.totalReceived)}</strong></p>
                            <p>Devolvido: <strong>{formatCurrency(month.totalRefunded)}</strong></p>
                            <p>Liquido: <strong>{formatCurrency(month.netTotal)}</strong></p>
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
                              <ul className="finance-bookings-list">
                                {receivedEntries.map((entry) => (
                                  <li key={entry.id}>
                                    <span>{entry.date}</span>
                                    <span>{entry.bandName || 'Banda'}</span>
                                    <span>{entry.roomName}</span>
                                    <strong>{formatCurrency(entry.amount)}</strong>
                                    <span>Recebido</span>
                                    <span>{entry.confirmedBy?.name || '-'}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {refundedEntries.length > 0 ? (
                            <div className="finance-bookings-group">
                              <p className="finance-bookings-group-title">Devoluções</p>
                              <div className="finance-breakdown-grid">
                                <div className="finance-breakdown-card">
                                  <span className="finance-breakdown-label">Por colaborador</span>
                                  <ul className="finance-breakdown-list">
                                    {summarizeFinanceEntries(refundedEntries, (entry) => entry.confirmedBy?.name || 'Sem colaborador').map((item) => (
                                      <li key={`refunded-collaborator-${item.name}`}>
                                        <span>{item.name}</span>
                                        <strong>{formatCurrency(item.total)}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="finance-breakdown-card">
                                  <span className="finance-breakdown-label">Por banda</span>
                                  <ul className="finance-breakdown-list">
                                    {summarizeFinanceEntries(refundedEntries, (entry) => entry.bandName || 'Sem banda').map((item) => (
                                      <li key={`refunded-band-${item.name}`}>
                                        <span>{item.name}</span>
                                        <strong>{formatCurrency(item.total)}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              <ul className="finance-bookings-list">
                                {refundedEntries.map((entry) => (
                                  <li key={entry.id}>
                                    <span>{entry.date}</span>
                                    <span>{entry.bandName || 'Banda'}</span>
                                    <span>{entry.roomName}</span>
                                    <strong>{formatCurrency(entry.amount)}</strong>
                                    <span>Devolvido</span>
                                    <span>{entry.confirmedBy?.name || '-'}</span>
                                  </li>
                                ))}
                              </ul>
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
                      <p>{selectedFinanceData.length > 0 ? `${selectedFinanceData.length} mês(es) selecionado(s)` : 'Nenhum mes selecionado'}</p>
                    </div>
                    <img className="finance-print-logo" src="/feedbook-logo.png" alt="Feedback - Ensaios" />
                  </div>

                  {selectedFinanceData.length === 0 ? (
                    <p className="finance-print-empty">Seleciona pelo menos um mes para exportar.</p>
                  ) : (
                    <>
                      <div className="finance-print-summary">
                        <div>
                          <span>Período</span>
                          <strong>{selectedFinanceData.map((month) => month.month).join(', ')}</strong>
                        </div>
                        <div>
                          <span>Recebido</span>
                          <strong>{formatCurrency(selectedFinanceData.reduce((sum, month) => sum + month.totalReceived, 0))}</strong>
                        </div>
                        <div>
                          <span>Devolvido</span>
                          <strong>{formatCurrency(selectedFinanceData.reduce((sum, month) => sum + month.totalRefunded, 0))}</strong>
                        </div>
                        <div>
                          <span>Líquido</span>
                          <strong>{formatCurrency(selectedFinanceData.reduce((sum, month) => sum + month.netTotal, 0))}</strong>
                        </div>
                      </div>

                      {selectedFinanceData.map((month) => {
                        const receivedEntries = month.bookings.filter((entry) => entry.paymentStatus === 'received');
                        const refundedEntries = month.bookings.filter((entry) => entry.paymentStatus === 'refunded');

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
                              <div>
                                <span>Devolvido</span>
                                <strong>{formatCurrency(month.totalRefunded)}</strong>
                              </div>
                              <div>
                                <span>Líquido</span>
                                <strong>{formatCurrency(month.netTotal)}</strong>
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

                            {refundedEntries.length > 0 ? (
                              <div className="finance-print-bookings-section">
                                <p className="finance-print-subhead">Devoluções</p>
                                <div className="finance-print-breakdown">
                                  <div className="finance-print-breakdown-card">
                                    <span>Por colaborador</span>
                                    <ul>
                                      {summarizeFinanceEntries(refundedEntries, (entry) => entry.confirmedBy?.name || 'Sem colaborador').map((item) => (
                                        <li key={`print-refunded-collaborator-${item.name}`}>
                                          <span>{item.name}</span>
                                          <strong>{formatCurrency(item.total)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="finance-print-breakdown-card">
                                    <span>Por banda</span>
                                    <ul>
                                      {summarizeFinanceEntries(refundedEntries, (entry) => entry.bandName || 'Sem banda').map((item) => (
                                        <li key={`print-refunded-band-${item.name}`}>
                                          <span>{item.name}</span>
                                          <strong>{formatCurrency(item.total)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                                {Array.from(new Map(refundedEntries.map((entry) => [entry.roomName || 'Outra sala', [] as typeof refundedEntries])).entries()).map(([roomName, _entries]) => {
                                  const roomEntries = refundedEntries.filter((entry) => (entry.roomName || 'Outra sala') === roomName);
                                  return (
                                    <div key={`print-room-refunded-${roomName}`} className={`finance-print-room-group ${financeRoomTone(roomName)}`}>
                                      <div className="finance-print-room-header">
                                        <strong>{roomName}</strong>
                                        <span>{roomEntries.length} registo(s)</span>
                                      </div>
                                      <div className="finance-print-payment-list">
                                        {roomEntries.map((entry) => (
                                          <div key={`print-refunded-${entry.id}`} className="finance-print-payment-card">
                                            <div className="finance-print-payment-field"><span>Data</span><strong>{entry.date}</strong></div>
                                            <div className="finance-print-payment-field"><span>Sala</span><strong>{entry.roomName}</strong></div>
                                            <div className="finance-print-payment-field"><span>Estado</span><strong>Devolvido</strong></div>
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

            <div className="history-filters" role="group" aria-label="Filtros de historico">
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'all' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'pending' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('pending')}
              >
                Por confirmar
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'confirmed' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('confirmed')}
              >
                Confirmados
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'past' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('past')}
              >
                Passados
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'cancelled' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('cancelled')}
              >
                Anulados
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'refunded' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('refunded')}
              >
                Devolvidos
              </button>
              <button
                type="button"
                className={`secondary-button history-filter ${viewFilter === 'rejected' ? 'history-filter-active' : ''}`}
                onClick={() => setViewFilter('rejected')}
              >
                Desmarcados
              </button>
            </div>

            {filteredBookings.length > 0 ? (
              <div className="history-table-wrap">
                <table className="history-table history-desktop">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Sala</th>
                      <th>Banda / Contacto</th>
                      <th>Participantes</th>
                      <th>Duracao</th>
                      <th>Abre a sala</th>
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
                        <td>{b.date}</td>
                        <td>{b.time}</td>
                        <td>{b.roomName}</td>
                        <td>
                          <span>{b.bandName || b.contactName || '-'}</span>
                          {b.contactPhone ? (
                            <span className="history-sub">{b.contactPhone}</span>
                          ) : null}
                        </td>
                        <td>{b.participants ?? '-'}</td>
                        <td>{b.duration}h</td>
                        <td>{b.assignedCollaborator?.name || '-'}</td>
                        <td>
                          No dia
                          <span className={`history-sub ${paymentStatusTone(b)}`}>{paymentStatusLabel(b)}</span>
                        </td>
                        <td className="status-cell">
                          <span className={`status-chip ${bookingMainTag(b).tone}`}>
                            {bookingMainTag(b).label}
                          </span>
                        </td>
                        <td>
                          <div className="history-actions">
                            {b.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={Boolean(actionLoading[b.id])}
                                  onClick={() => {
                                    void handleConfirmBooking(b.id);
                                  }}
                                >
                                  Confirmar
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
                                disabled={Boolean(actionLoading[b.id])}
                                onClick={() => {
                                  void handleConfirmPaymentReceipt(b.id);
                                }}
                              >
                                Confirmar pagamento
                              </button>
                            ) : null}
                            {String(b.paymentStatus || '').toLowerCase() !== 'refunded' ? (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={Boolean(actionLoading[b.id])}
                                onClick={() => {
                                  void handleRefundBooking(b.id);
                                }}
                              >
                                Devolver
                              </button>
                            ) : null}
                            {consegueAbrirWhatsApp(b) ? (
                              <button
                                type="button"
                                className="secondary-button whatsapp-icon-button"
                                aria-label="Enviar mensagem por WhatsApp"
                                title="Enviar mensagem por WhatsApp"
                                onClick={() => {
                                  abrirWhatsAppMensagem(b, currentUser?.name || 'Feedback - Ensaios', b.status === 'pending' ? 'confirm' : 'cancel');
                                }}
                              >
                                <WhatsAppIcon />
                              </button>
                            ) : null}
                          </div>
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
                        <span className={`status-chip ${bookingMainTag(b).tone}`}>{bookingMainTag(b).label}</span>
                      </div>

                      <p>
                        {b.date} · {b.time} · {b.duration}h
                      </p>
                      <p>
                        {b.bandName || b.contactName || '-'} · {b.participants ?? '-'} participantes
                      </p>
                      <p>Contacto: {b.contactPhone || '-'}</p>
                      <p>Abertura de sala: {b.assignedCollaborator?.name || '-'}</p>
                      <p>
                        Pagamento: No dia · <span className={paymentStatusTone(b)}>{paymentStatusLabel(b)}</span>
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
                              disabled={Boolean(actionLoading[b.id])}
                              onClick={() => {
                                void handleConfirmBooking(b.id);
                              }}
                            >
                              Confirmar
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
                            disabled={Boolean(actionLoading[b.id])}
                            onClick={() => {
                              void handleConfirmPaymentReceipt(b.id);
                            }}
                          >
                            Confirmar pagamento
                          </button>
                        ) : null}
                        {String(b.paymentStatus || '').toLowerCase() !== 'refunded' ? (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={Boolean(actionLoading[b.id])}
                            onClick={() => {
                              void handleRefundBooking(b.id);
                            }}
                          >
                            Devolver
                          </button>
                        ) : null}
                        {consegueAbrirWhatsApp(b) ? (
                          <button
                            type="button"
                            className="secondary-button whatsapp-icon-button"
                            aria-label="Enviar mensagem por WhatsApp"
                            title="Enviar mensagem por WhatsApp"
                            onClick={() => {
                              abrirWhatsAppMensagem(b, currentUser?.name || 'Feedback - Ensaios', b.status === 'pending' ? 'confirm' : 'cancel');
                            }}
                          >
                            <WhatsAppIcon />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        </div>
      </main>

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
    </div>
  );
}

export default AdminHistoryPage;
