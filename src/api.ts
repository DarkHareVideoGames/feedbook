import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';

// ============================================================
// Camada de dados do Feedback - Ensaios sobre o Supabase.
// Espelha os shapes dos antigos endpoints /api/* do Express
// para manter as páginas praticamente intactas.
// ============================================================

export type Role = 'admin' | 'collaborator' | 'technician';

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export type ActorStamp = { id: string; name: string; role: string; at: string };

export type ApiBooking = {
  id: string;
  roomId: string | null;
  roomName: string;
  status: BookingStatus;
  date: string;
  time: string;
  duration: number;
  bandName?: string | null;
  contactName: string;
  contactPhone?: string | null;
  email: string;
  participants?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string;
  amount?: number | null;
  paymentConfirmedAt?: string | null;
  extras?: string[];
  confirmedBy?: ActorStamp | null;
  rejectedBy?: ActorStamp | null;
  cancelledBy?: ActorStamp | null;
  refundedBy?: ActorStamp | null;
  paymentConfirmedBy?: ActorStamp | null;
  assignedCollaborator?: { id: string; name: string } | null;
  createdAt?: string;
};

export type PricingConfig = {
  perMemberPerHour: number;
  extras: Record<string, number>;
};

// --- Salas + Serviços (pie-menu, tabelas rooms/services) -----

export type ApiRoom = {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
  maxMembers: number;
  pricePerMemberHour: number | null;
  gear: string[];
  gearEn: string[];
  accent: string;
  active: boolean;
};

export type ApiService = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  price: number;
  active: boolean;
  sortOrder: number;
};

export type RoomDraft = {
  id?: string;
  name: string;
  description?: string;
  descriptionEn?: string;
  maxMembers: number;
  pricePerMemberHour?: number | null;
  gear?: string;
  gearEn?: string;
  accent?: string;
  active?: boolean;
};

export type ServiceDraft = {
  id?: string;
  name: string;
  nameEn?: string;
  description?: string;
  price: number;
  active?: boolean;
  sortOrder?: number;
};

export type ApiAuditEntry = {
  id: string;
  action: string;
  actor: { id: string; name: string; role: string };
  target: string;
  details: string;
  createdAt: string;
};

export type FinanceBooking = {
  id: string;
  bandName?: string | null;
  roomName: string;
  date: string;
  amount: number;
  paymentStatus?: string;
  extras?: string[];
  extrasBreakdown?: Array<{ key: string; amount: number }>;
  confirmedBy?: ActorStamp | null;
};

export type FinanceMonthSummary = {
  month: string;
  totalReceived: number;
  totalRefunded: number;
  netTotal: number;
  bookingCount: number;
  bookings: FinanceBooking[];
};

const allowedRoles: Role[] = ['admin', 'collaborator', 'technician'];

const fallbackRooms: ApiRoom[] = [
  {
    id: 'sala-red',
    name: 'SALA RED',
    description: 'Sala de impacto forte para ensaios completos e passagens de alinhamento com pressao real.',
    descriptionEn: 'High-impact room for full-band rehearsals and pressure-tested run-throughs.',
    maxMembers: 6,
    pricePerMemberHour: null,
    gear: ['Bateria completa', '2 amps de guitarra', 'PA com monitores'],
    gearEn: ['Full drum kit', '2 guitar amps', 'PA with monitors'],
    accent: 'var(--room-red)',
    active: true,
  },
  {
    id: 'sala-grey',
    name: 'SALA GREY',
    description: 'Sala equilibrada para composicao, vozes e trabalho de detalhe com mais controlo dinamico.',
    descriptionEn: 'Balanced room for songwriting, vocals, and detail-focused arrangement work.',
    maxMembers: 5,
    pricePerMemberHour: null,
    gear: ['Bateria compacta', 'Amp de baixo', 'PA com efeitos de voz'],
    gearEn: ['Compact drum kit', 'Bass amp', 'PA with vocal FX'],
    accent: 'var(--room-grey)',
    active: true,
  },
];

const fallbackServices: ApiService[] = [
  { id: 'engineer', name: 'Tecnico de sessao', nameEn: 'Session engineer', description: '', price: 24, active: true, sortOrder: 0 },
  { id: 'recording', name: 'Captacao stereo do ensaio', nameEn: 'Stereo rehearsal capture', description: '', price: 18, active: true, sortOrder: 1 },
  { id: 'backline', name: 'Preparacao extra de backline', nameEn: 'Extra backline setup', description: '', price: 12, active: true, sortOrder: 2 },
];

const roomsById: Record<string, string> = {
  'sala-red': 'SALA RED',
  'sala-grey': 'SALA GREY',
};

const defaultPricing: PricingConfig = {
  perMemberPerHour: 3,
  extras: { engineer: 24, recording: 18, backline: 12 },
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function isNetworkMessage(message: string): boolean {
  return /failed to fetch|networkerror|network error|load failed/i.test(message);
}

function toError(message: string | undefined, fallback: string, status = 400): Error {
  const text = String(message || '').trim() || fallback;
  if (isNetworkMessage(text)) {
    return new TypeError('Failed to fetch');
  }
  return new ApiError(text || fallback, status);
}

function randHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function generateBookingId(): string {
  const buffer = new Uint8Array(4);
  crypto.getRandomValues(buffer);
  const value =
    (buffer[0] * 0x1000000 + buffer[1] * 0x10000 + buffer[2] * 0x100 + buffer[3]) % 1_000_000;
  return `FB-${String(value).padStart(6, '0')}`;
}

function normalizeRole(value: unknown): Role {
  const role = String(value ?? '').trim().toLowerCase();
  return allowedRoles.includes(role as Role) ? (role as Role) : 'collaborator';
}

export function normalizePaymentStatus(value: unknown): string {
  const status = String(value ?? '').trim().toLowerCase();
  if (!status) return 'pending';
  if (['received', 'paid', 'pago'].includes(status)) return 'received';
  if (['refunded', 'refund', 'devolvido', 'devolucao'].includes(status)) return 'refunded';
  if (
    ['pending', 'pending_confirmation', 'pending-confirmation', 'pending_mbway', 'pending-mbway',
      'pay-on-site', 'pay_on_site', 'on-site'].includes(status)
  ) {
    return 'pending';
  }
  return status;
}

export function estimateBookingAmount(
  booking: { duration?: number | null; participants?: number | null; extras?: string[] | null; amount?: number | null },
  pricingConfig: PricingConfig,
): number {
  if (Number.isFinite(Number(booking?.amount)) && booking?.amount !== null && booking?.amount !== undefined) {
    return Number(booking.amount);
  }

  const duration = Number(booking?.duration || 0);
  const participants = Number(booking?.participants || 0);
  const baseMembers = participants > 0 ? participants : 1;
  const basePrice = duration * Number(pricingConfig?.perMemberPerHour || 0) * baseMembers;
  const extras = Array.isArray(booking?.extras) ? booking.extras : [];
  const extraValue = extras.reduce((sum, extraName) => {
    return sum + Number(pricingConfig?.extras?.[extraName] ?? 0);
  }, 0);

  return Number((basePrice + extraValue).toFixed(2));
}

async function loadPricingConfig(): Promise<PricingConfig> {
  const [{ data: pricingData }, servicesResult] = await Promise.all([
    supabase.from('pricing').select('*').eq('id', 1).maybeSingle(),
    supabase.from('services').select('*').eq('active', true).order('sortOrder', { ascending: true }),
  ]);
  const extras: Record<string, number> = {};
  if (servicesResult.data && !isMissingTableError(servicesResult.error)) {
    for (const row of servicesResult.data ?? []) {
      const service = mapServiceRow(row as Record<string, unknown>);
      if (service.active) extras[service.id] = Number(service.price || 0);
    }
  }
  if (Object.keys(extras).length === 0) {
    const legacy = ((pricingData?.extras ?? {}) as Record<string, unknown>);
    for (const fallback of fallbackServices) {
      const legacyValue = legacy[fallback.id];
      extras[fallback.id] = Number.isFinite(Number(legacyValue)) ? Number(legacyValue) : fallback.price;
    }
  }
  return {
    perMemberPerHour: Number(pricingData?.perMemberPerHour ?? defaultPricing.perMemberPerHour),
    extras,
  };
}

function mapBookingRow(row: Record<string, unknown>): ApiBooking {
  return {
    ...(row as unknown as ApiBooking),
    duration: Number(row.duration ?? 0),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    participants:
      row.participants === null || row.participants === undefined ? null : Number(row.participants),
    extras: Array.isArray(row.extras) ? (row.extras as string[]) : [],
    paymentStatus: normalizePaymentStatus(row.paymentStatus),
  };
}

// --- Sessão / Autenticação (Supabase Auth) -------------------

async function authUserFrom(token: string): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    return sessionData.session.user;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError('Session expired or invalid.', 401);
  }
  return data.user;
}

async function profileFor(user: User): Promise<ApiUser> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) {
    throw toError(error.message, 'Could not load user profile.', 401);
  }

  if (!data) {
    const metadata = (user.user_metadata ?? {}) as { name?: string; role?: string };
    return {
      id: user.id,
      name: metadata.name || String(user.email ?? '').split('@')[0],
      email: String(user.email ?? ''),
      role: normalizeRole(metadata.role),
      createdAt: user.created_at ?? new Date().toISOString(),
    };
  }

  return {
    id: String(data.id),
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    role: normalizeRole(data.role),
    createdAt: String(data.createdAt ?? ''),
  };
}

async function requireActor(token: string, roles: Role[]): Promise<ApiUser> {
  const user = await authUserFrom(token);
  const profile = await profileFor(user);
  if (!roles.includes(profile.role)) {
    throw new ApiError('Access denied.', 403);
  }
  return profile;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: ApiUser }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });

  if (error || !data.session) {
    const message = String(error?.message || '');
    if (isNetworkMessage(message)) {
      throw new TypeError('Failed to fetch');
    }
    if (message.toLowerCase().includes('invalid login')) {
      throw new Error('Invalid credentials');
    }
    throw new Error(message || 'Invalid credentials');
  }

  const profile = await profileFor(data.user);
  return { token: data.session.access_token, user: profile };
}

export async function me(token: string): Promise<{ user: ApiUser }> {
  const user = await authUserFrom(token);
  const profile = await profileFor(user);
  return { user: profile };
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // A limpeza local é feita pela página; falhas de rede aqui não são críticas.
  }
}

// --- Bookings (público) -------------------------------------

export async function listBookings(): Promise<{ bookings: ApiBooking[] }> {
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase não configurado: define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', 500);
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('createdAt', { ascending: true });

  if (error) {
    throw toError(error.message, 'Failed to load bookings.');
  }

  return { bookings: (data ?? []).map(mapBookingRow) };
}

export type CreateBookingDraft = {
  roomId?: string;
  roomName?: string;
  date: string;
  time: string;
  duration: number;
  extras?: string[];
  bandName?: string;
  contactName: string;
  contactPhone?: string;
  email: string;
  focus?: string;
  locale?: string;
  participants?: number;
  paymentMethod?: string;
  amount?: number;
};

export async function createBooking(draft: CreateBookingDraft): Promise<{ booking: ApiBooking }> {
  try {
    if (!isSupabaseConfigured) {
      throw new ApiError('Supabase não configurado: define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', 500);
    }
    const roomId = String(draft?.roomId || '').trim() || null;
    let roomName = String(draft?.roomName || '').trim();
    if (!roomName && roomId) {
      try {
        const { rooms } = await listRooms({ includeInactive: true });
        roomName = rooms.find((room) => room.id === roomId)?.name || roomsById[roomId] || '';
      } catch {
        roomName = roomsById[roomId] || '';
      }
    }

    if (!roomName || !draft?.date || !draft?.time || !draft?.duration || !draft?.contactName || !draft?.email) {
      throw new ApiError('Missing required booking fields.', 400);
    }

    const pricing = await loadPricingConfig();

    const extras = Array.isArray(draft.extras) ? draft.extras.filter(Boolean) : [];
    const duration = Number(draft.duration);
    const participants = Number(draft.participants || 0);
    const amount = Number.isFinite(Number(draft.amount))
      ? Number(draft.amount)
      : estimateBookingAmount({ duration, participants, extras }, pricing);

    const row = {
      roomId,
      status: 'pending',
      roomName,
      date: new Date(draft.date).toISOString().split('T')[0],
      time: draft.time,
      duration,
      bandName: draft.bandName || draft.contactName || '-',
      contactName: draft.contactName,
      contactPhone: draft.contactPhone ?? null,
      email: draft.email,
      participants: Number.isFinite(participants) && participants > 0 ? participants : null,
      paymentMethod: draft.paymentMethod || 'on-site',
      paymentStatus: 'pending',
      amount,
      extras,
      createdAt: new Date().toISOString(),
    };

    let data: Record<string, unknown> | null = null;
    let insertError: { message?: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await supabase
        .from('bookings')
        .insert({ ...row, id: generateBookingId() })
        .select()
        .single();
      data = (result.data as Record<string, unknown> | null) ?? null;
      insertError = result.error;
      // 23505 = chave primaria duplicada: gera outro numero e tenta de novo.
      if (!result.error || String(result.error.code) !== '23505') break;
    }
    if (insertError || !data) {
      throw toError(insertError?.message, 'Falha ao criar marcacao.');
    }

    const booking = mapBookingRow(data as Record<string, unknown>);

    await recordAudit({
      action: 'booking-created',
      actor: { id: 'CLIENT_USER', name: draft.contactName || 'Client', role: 'client' },
      target: booking.id,
      details: {
        banda: booking.bandName,
        contacto: booking.contactName,
        sala: booking.roomName,
        data: booking.date,
      },
    });

    notifyBooking(booking, 'pending');

    return { booking };
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) {
      throw error;
    }
    throw toError(error instanceof Error ? error.message : undefined, 'Nao foi possivel concluir a marcacao.');
  }
}

// --- Bookings (admin) ---------------------------------------

function bookingDate(booking: ApiBooking): Date | null {
  const parsed = new Date(`${booking.date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function adminBookings(
  token: string,
  period?: 'future' | 'past',
): Promise<{ bookings: ApiBooking[] }> {
  const actor = await requireActor(token, ['admin', 'collaborator', 'technician']);

  const [{ data: rows, error }, profilesResult] = await Promise.all([
    supabase.from('bookings').select('*').order('date', { ascending: true }),
    supabase.from('profiles').select('id, name'),
  ]);

  if (error) {
    throw toError(error.message, 'Could not load bookings', 400);
  }

  const pricing = await loadPricingConfig();

  let bookings = (rows ?? []).map((row) => mapBookingRow(row as Record<string, unknown>));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === 'future') {
    bookings = bookings.filter((b) => {
      if (b.status === 'pending') return true;
      if (b.status !== 'confirmed') return false;
      const parsed = bookingDate(b);
      return parsed ? parsed >= today : true;
    });
  } else if (period === 'past') {
    bookings = bookings.filter((b) => {
      if (b.status === 'cancelled' || b.status === 'rejected') return true;
      if (b.status !== 'confirmed') return false;
      const parsed = bookingDate(b);
      return parsed ? parsed < today : false;
    });
  }

  // Mock de atribuição para a UI (mesma lógica do antigo endpoint)
  const profiles = (profilesResult.data ?? []) as Array<{ id: string; name: string }>;
  const mockAssignee =
    actor.role === 'admin' && profiles.length > 1
      ? profiles.find((candidate) => candidate.id !== actor.id) ?? null
      : null;

  return {
    bookings: bookings.map((booking) => ({
      ...booking,
      assignedCollaborator: mockAssignee ? { id: mockAssignee.id, name: mockAssignee.name } : null,
      paymentStatus: normalizePaymentStatus(booking.paymentStatus),
      amount: Number.isFinite(Number(booking.amount)) && booking.amount !== null
        ? Number(booking.amount)
        : estimateBookingAmount(booking, pricing),
    })),
  };
}

export type BookingAction = 'confirm' | 'reject' | 'cancel' | 'refund' | 'reschedule' | 'confirm-payment';

export async function bookingAction(
  token: string,
  bookingId: string,
  action: BookingAction,
  body?: { date?: string; time?: string; duration?: number; amount?: number },
): Promise<{ booking: ApiBooking }> {
  const actor = await requireActor(token, ['admin', 'collaborator', 'technician']);

  const { data: existing, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (fetchError) {
    throw toError(fetchError.message, 'Booking not found.', 404);
  }
  if (!existing) {
    throw new ApiError('Booking not found.', 404);
  }

  const booking = mapBookingRow(existing as Record<string, unknown>);
  const now = new Date().toISOString();
  const actorStamp: ActorStamp = { id: actor.id, name: actor.name, role: actor.role, at: now };

  const patch: Record<string, unknown> = {};
  let auditAction = '';
  let auditDetails: Record<string, unknown> = {};
  let notifyStatus: 'confirmed' | 'rejected' | 'cancelled' | null = null;

  const baseDetails = {
    banda: booking.bandName || booking.contactName || '-',
    contacto: booking.contactName || '-',
    sala: booking.roomName,
    data: booking.date,
  };

  if (action === 'confirm') {
    patch.status = 'confirmed';
    patch.confirmedBy = actorStamp;
    patch.assignedCollaborator = actor.role === 'admin' ? { id: actor.id, name: actor.name } : null;
    auditAction = 'booking-confirmed';
    auditDetails = {
      ...baseDetails,
      confirmadoPor: actor.name,
      designado: actor.role === 'admin' ? actor.name : 'Nao designado',
    };
    notifyStatus = 'confirmed';
  } else if (action === 'reject') {
    patch.status = 'rejected';
    patch.rejectedBy = actorStamp;
    auditAction = 'booking-rejected';
    auditDetails = { ...baseDetails, rejeitadoPor: actor.name };
    notifyStatus = 'rejected';
  } else if (action === 'cancel') {
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new ApiError('Cannot cancel a cancelled or rejected booking.', 400);
    }
    patch.status = 'cancelled';
    patch.cancelledBy = actorStamp;
    auditAction = 'booking-cancelled';
    auditDetails = { ...baseDetails, canceladoPor: actor.name };
    notifyStatus = 'cancelled';
  } else if (action === 'refund') {
    if (normalizePaymentStatus(booking.paymentStatus) === 'refunded') {
      throw new ApiError('Booking is already refunded.', 400);
    }
    patch.paymentStatus = 'refunded';
    if (booking.status === 'confirmed') {
      patch.status = 'cancelled';
    }
    patch.refundedBy = actorStamp;
    auditAction = 'booking-refunded';
    auditDetails = { ...baseDetails, devolvidoPor: actor.name };
  } else if (action === 'reschedule') {
    if (normalizePaymentStatus(booking.paymentStatus) === 'refunded') {
      throw new ApiError('Cannot reschedule a refunded booking.', 400);
    }

    const nextDate = String(body?.date || '').trim();
    const nextTime = String(body?.time || '').trim();
    const nextDuration = Number(body?.duration);

    if (!nextDate || !nextTime || !Number.isFinite(nextDuration) || nextDuration <= 0) {
      throw new ApiError('Invalid reschedule data.', 400);
    }

    const parsedDate = new Date(nextDate);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new ApiError('Invalid date provided.', 400);
    }

    const previous = `${booking.date} ${booking.time} (${booking.duration}h)`;
    const next = `${parsedDate.toISOString().split('T')[0]} ${nextTime} (${nextDuration}h)`;

    patch.date = parsedDate.toISOString().split('T')[0];
    patch.time = nextTime;
    patch.duration = nextDuration;
    patch.status = 'pending';
    patch.confirmedBy = null;
    patch.cancelledBy = null;
    patch.rejectedBy = null;
    patch.assignedCollaborator = null;

    auditAction = 'booking-rescheduled';
    auditDetails = {
      ...baseDetails,
      de: previous,
      para: next,
      reagendadoPor: actor.name,
    };
  } else if (action === 'confirm-payment') {
    if (booking.status !== 'confirmed') {
      throw new ApiError('Only confirmed bookings can receive payment confirmation.', 400);
    }
    if (normalizePaymentStatus(booking.paymentStatus) === 'refunded') {
      throw new ApiError('A refunded booking cannot confirm payment.', 400);
    }
    if (normalizePaymentStatus(booking.paymentStatus) === 'received') {
      throw new ApiError('Payment was already received for this booking.', 400);
    }

    const pricing = await loadPricingConfig();

    patch.paymentStatus = 'received';
    patch.paymentConfirmedBy = actorStamp;
    patch.paymentConfirmedAt = now;
    patch.amount = Number.isFinite(Number(body?.amount))
      ? Number(body?.amount)
      : Number(booking.amount ?? estimateBookingAmount(booking, pricing));

    auditAction = 'payment-confirmed';
    auditDetails = {
      ...baseDetails,
      montante: patch.amount,
      confirmadoPor: actor.name,
    };
  } else {
    throw new ApiError('Unknown booking action.', 400);
  }

  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', bookingId)
    .select()
    .single();

  if (updateError || !updated) {
    throw toError(updateError?.message, 'Could not update booking');
  }

  await recordAudit({
    action: auditAction,
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: bookingId,
    details: auditDetails,
  });

  const bookingOut = mapBookingRow(updated as Record<string, unknown>);
  if (notifyStatus) {
    notifyBooking(bookingOut, notifyStatus);
  }

  return { booking: bookingOut };
}

// --- Finance (portado do antigo /api/admin/finance) ---------

export async function adminFinance(token: string): Promise<{
  totals: { totalReceived: number; totalRefunded: number; netTotal: number; bookingCount: number };
  months: FinanceMonthSummary[];
  extrasCatalog: Record<string, number>;
}> {
  await requireActor(token, ['admin']);

  const [{ data: rows, error }] = await Promise.all([
    supabase.from('bookings').select('*'),
  ]);

  if (error) {
    throw toError(error.message, 'Could not load finance', 400);
  }

  const extrasCatalog = (await loadPricingConfig()).extras;

  const monthlyMap = new Map<string, FinanceMonthSummary>();

  for (const raw of rows ?? []) {
    const booking = mapBookingRow(raw as Record<string, unknown>);
    const monthKey = String(booking.paymentConfirmedAt || booking.date || '').slice(0, 7) || 'sem-data';
    const amount = Number(booking.amount || 0);

    let bucket = monthlyMap.get(monthKey);
    if (!bucket) {
      bucket = {
        month: monthKey,
        totalReceived: 0,
        totalRefunded: 0,
        netTotal: 0,
        bookingCount: 0,
        bookings: [],
      };
      monthlyMap.set(monthKey, bucket);
    }

    const extras = Array.isArray(booking.extras) ? booking.extras : [];
    const extrasBreakdown = extras.map((key) => ({
      key: String(key || '').trim(),
      amount: Number(extrasCatalog[key] || 0),
    }));

    const paymentStatus = normalizePaymentStatus(booking.paymentStatus);
    if (paymentStatus === 'received' || paymentStatus === 'refunded') {
      const summary: FinanceBooking = {
        id: booking.id,
        bandName: booking.bandName,
        roomName: booking.roomName,
        date: booking.date,
        amount,
        paymentStatus,
        extras,
        extrasBreakdown,
        confirmedBy: booking.paymentConfirmedBy,
      };

      if (paymentStatus === 'received') {
        bucket.totalReceived += amount;
        bucket.netTotal += amount;
        bucket.bookingCount += 1;
      } else {
        bucket.totalRefunded += amount;
        bucket.netTotal -= amount;
      }
      bucket.bookings.push(summary);
    }
  }

  const months = Array.from(monthlyMap.values()).sort((left, right) =>
    right.month.localeCompare(left.month),
  );

  const totals = months.reduce(
    (accumulator, monthItem) => {
      accumulator.totalReceived += monthItem.totalReceived;
      accumulator.totalRefunded += monthItem.totalRefunded;
      accumulator.netTotal += monthItem.netTotal;
      accumulator.bookingCount += monthItem.bookingCount;
      return accumulator;
    },
    { totalReceived: 0, totalRefunded: 0, netTotal: 0, bookingCount: 0 },
  );

  return { totals, months, extrasCatalog };
}

// --- Preçário -----------------------------------------------

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('could not find the table');
}

function mapRoomRow(row: Record<string, unknown>): ApiRoom {
  const gear = Array.isArray(row.gear) ? (row.gear as unknown[]).map((item) => String(item)) : [];
  const gearEn = Array.isArray(row.gearEn)
    ? (row.gearEn as unknown[]).map((item) => String(item))
    : Array.isArray((row as Record<string, unknown>).gear_en)
      ? ((row as Record<string, unknown>).gear_en as unknown[]).map((item) => String(item))
      : [];
  const rawPrice = row.pricePerMemberHour ?? (row as Record<string, unknown>).price_per_member_hour ?? null;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    descriptionEn: String(row.descriptionEn ?? (row as Record<string, unknown>).description_en ?? ''),
    maxMembers: Number(row.maxMembers ?? (row as Record<string, unknown>).max_members ?? 4),
    pricePerMemberHour: rawPrice === null || rawPrice === undefined || rawPrice === '' ? null : Number(rawPrice),
    gear,
    gearEn,
    accent: String(row.accent ?? 'var(--room-red)'),
    active: row.active !== false,
  };
}

function mapServiceRow(row: Record<string, unknown>): ApiService {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    nameEn: String(row.nameEn ?? (row as Record<string, unknown>).name_en ?? ''),
    description: String(row.description ?? ''),
    price: Number(row.price ?? 0),
    active: row.active !== false,
    sortOrder: Number(row.sortOrder ?? (row as Record<string, unknown>).sort_order ?? 0),
  };
}

function slugify(value: string, fallback: string): string {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function splitLines(value: string | undefined): string[] {
  return String(value || '')
    .split(/\r?\n|,/) 
    .map((item) => item.trim())
    .filter(Boolean);
}

export function servicesToPricingExtras(services: ApiService[]): Record<string, number> {
  const extras: Record<string, number> = {};
  for (const service of services) {
    if (service.active) extras[service.id] = Number(service.price || 0);
  }
  if (Object.keys(extras).length === 0) {
    for (const fallback of fallbackServices) extras[fallback.id] = fallback.price;
  }
  return extras;
}

// --- Salas (pie-menu) -----------------------------------------

export async function listRooms(options?: { includeInactive?: boolean }): Promise<{ rooms: ApiRoom[] }> {
  if (!isSupabaseConfigured) {
    const rooms = options?.includeInactive ? fallbackRooms : fallbackRooms.filter((room) => room.active);
    return { rooms };
  }
  const query = supabase.from('rooms').select('*').order('createdAt', { ascending: true });
  const { data, error } = options?.includeInactive ? await query : await query.eq('active', true);
  if (error) {
    if (isMissingTableError(error)) {
      const rooms = options?.includeInactive ? fallbackRooms : fallbackRooms.filter((room) => room.active);
      return { rooms };
    }
    throw toError(error.message, 'Could not load rooms');
  }
  const rooms = (data ?? []).map((row) => mapRoomRow(row as Record<string, unknown>));
  if (rooms.length === 0) {
    const fallback = options?.includeInactive ? fallbackRooms : fallbackRooms.filter((room) => room.active);
    return { rooms: fallback };
  }
  return { rooms };
}

export async function createRoom(token: string, draft: RoomDraft): Promise<{ room: ApiRoom }> {
  const actor = await requireActor(token, ['admin']);
  const name = String(draft?.name || '').trim();
  const maxMembers = Number(draft?.maxMembers);
  if (!name) throw new ApiError('Room name is required.', 400);
  if (!Number.isFinite(maxMembers) || maxMembers <= 0) throw new ApiError('Invalid capacity.', 400);
  const rawPrice: unknown = draft?.pricePerMemberHour;
  const pricePerMemberHour =
    rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === '' ? null : Number(rawPrice);
  if (pricePerMemberHour !== null && (!Number.isFinite(pricePerMemberHour) || pricePerMemberHour < 0)) {
    throw new ApiError('Invalid room price.', 400);
  }
  const id = String(draft?.id || '').trim() || slugify(name, `sala-${randHex(3).toLowerCase()}`);
  const row = {
    id,
    name,
    description: String(draft?.description ?? ''),
    descriptionEn: String(draft?.descriptionEn ?? ''),
    maxMembers: Math.floor(maxMembers),
    pricePerMemberHour,
    gear: splitLines(draft?.gear),
    gearEn: splitLines(draft?.gearEn),
    accent: String(draft?.accent || 'var(--room-red)'),
    active: draft?.active !== false,
    updatedAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('rooms').insert(row).select().single();
  if (error) {
    if (String(error.code) === '23505') throw new ApiError('Room id already exists.', 409);
    throw toError(error.message, 'Could not create room');
  }
  const room = mapRoomRow(data as Record<string, unknown>);
  await recordAudit({ action: 'room-created', actor: { id: actor.id, name: actor.name, role: actor.role }, target: room.id, details: { name: room.name } });
  return { room };
}

export async function updateRoom(token: string, roomId: string, draft: RoomDraft): Promise<{ room: ApiRoom }> {
  const actor = await requireActor(token, ['admin']);
  const name = String(draft?.name || '').trim();
  const maxMembers = Number(draft?.maxMembers);
  if (!name) throw new ApiError('Room name is required.', 400);
  if (!Number.isFinite(maxMembers) || maxMembers <= 0) throw new ApiError('Invalid capacity.', 400);
  const rawPrice: unknown = draft?.pricePerMemberHour;
  const pricePerMemberHour =
    rawPrice === null || rawPrice === undefined || String(rawPrice).trim() === '' ? null : Number(rawPrice);
  if (pricePerMemberHour !== null && (!Number.isFinite(pricePerMemberHour) || pricePerMemberHour < 0)) {
    throw new ApiError('Invalid room price.', 400);
  }
  const patch: Record<string, unknown> = {
    name,
    description: String(draft?.description ?? ''),
    descriptionEn: String(draft?.descriptionEn ?? ''),
    maxMembers: Math.floor(maxMembers),
    pricePerMemberHour,
    gear: splitLines(draft?.gear),
    gearEn: splitLines(draft?.gearEn),
    accent: String(draft?.accent || 'var(--room-red)'),
    active: draft?.active !== false,
  };
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', roomId).select().single();
  if (error || !data) throw toError(error?.message, 'Could not update room');
  const room = mapRoomRow(data as Record<string, unknown>);
  await recordAudit({ action: 'room-updated', actor: { id: actor.id, name: actor.name, role: actor.role }, target: room.id, details: { name: room.name } });
  return { room };
}

export async function deleteRoom(token: string, roomId: string): Promise<{ message: string }> {
  const actor = await requireActor(token, ['admin']);
  const { data: existing } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (!existing) throw new ApiError('Room not found.', 404);
  const { data: linked } = await supabase.from('bookings').select('id').eq('roomId', roomId).limit(1);
  if (linked && linked.length > 0) {
    const { error } = await supabase.from('rooms').update({ active: false }).eq('id', roomId);
    if (error) throw toError(error.message, 'Could not archive room');
    await recordAudit({ action: 'room-archived', actor: { id: actor.id, name: actor.name, role: actor.role }, target: roomId, details: { name: String((existing as Record<string, unknown>).name ?? roomId) } });
    return { message: 'Room archived (has bookings).' };
  }
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw toError(error.message, 'Could not delete room');
  await recordAudit({ action: 'room-deleted', actor: { id: actor.id, name: actor.name, role: actor.role }, target: roomId, details: { name: String((existing as Record<string, unknown>).name ?? roomId) } });
  return { message: 'Room deleted successfully' };
}

// --- Serviços (pie-menu) --------------------------------------

export async function listServices(options?: { includeInactive?: boolean }): Promise<{ services: ApiService[] }> {
  if (!isSupabaseConfigured) {
    const services = options?.includeInactive ? fallbackServices : fallbackServices.filter((service) => service.active);
    return { services };
  }
  const query = supabase.from('services').select('*').order('sortOrder', { ascending: true });
  const { data, error } = options?.includeInactive ? await query : await query.eq('active', true);
  if (error) {
    if (isMissingTableError(error)) {
      const services = options?.includeInactive ? fallbackServices : fallbackServices.filter((service) => service.active);
      return { services };
    }
    throw toError(error.message, 'Could not load services');
  }
  const services = (data ?? []).map((row) => mapServiceRow(row as Record<string, unknown>));
  if (services.length === 0) {
    const fallback = options?.includeInactive ? fallbackServices : fallbackServices.filter((service) => service.active);
    return { services: fallback };
  }
  return { services };
}

export async function createService(token: string, draft: ServiceDraft): Promise<{ service: ApiService }> {
  const actor = await requireActor(token, ['admin']);
  const name = String(draft?.name || '').trim();
  const price = Number(draft?.price);
  if (!name) throw new ApiError('Service name is required.', 400);
  if (!Number.isFinite(price) || price < 0) throw new ApiError('Invalid service price.', 400);
  const id = String(draft?.id || '').trim() || slugify(name, `servico-${randHex(3).toLowerCase()}`);
  const { data: existingServices } = await supabase.from('services').select('sortOrder').order('sortOrder', { ascending: false }).limit(1);
  const nextOrder = Number.isFinite(Number(draft?.sortOrder))
    ? Number(draft?.sortOrder)
    : Number((existingServices?.[0] as Record<string, unknown> | undefined)?.sortOrder ?? fallbackServices.length) + 1;
  const row = {
    id,
    name,
    nameEn: String(draft?.nameEn ?? ''),
    description: String(draft?.description ?? ''),
    price,
    active: draft?.active !== false,
    sortOrder: nextOrder,
    updatedAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('services').insert(row).select().single();
  if (error) {
    if (String(error.code) === '23505') throw new ApiError('Service id already exists.', 409);
    throw toError(error.message, 'Could not create service');
  }
  const service = mapServiceRow(data as Record<string, unknown>);
  await recordAudit({ action: 'service-created', actor: { id: actor.id, name: actor.name, role: actor.role }, target: service.id, details: { name: service.name, price: service.price } });
  return { service };
}

export async function updateService(token: string, serviceId: string, draft: ServiceDraft): Promise<{ service: ApiService }> {
  const actor = await requireActor(token, ['admin']);
  const name = String(draft?.name || '').trim();
  const price = Number(draft?.price);
  if (!name) throw new ApiError('Service name is required.', 400);
  if (!Number.isFinite(price) || price < 0) throw new ApiError('Invalid service price.', 400);
  const patch: Record<string, unknown> = {
    name,
    nameEn: String(draft?.nameEn ?? ''),
    description: String(draft?.description ?? ''),
    price,
    active: draft?.active !== false,
  };
  if (Number.isFinite(Number(draft?.sortOrder))) patch.sortOrder = Number(draft?.sortOrder);
  const { data, error } = await supabase.from('services').update(patch).eq('id', serviceId).select().single();
  if (error || !data) throw toError(error?.message, 'Could not update service');
  const service = mapServiceRow(data as Record<string, unknown>);
  await recordAudit({ action: 'service-updated', actor: { id: actor.id, name: actor.name, role: actor.role }, target: service.id, details: { name: service.name, price: service.price } });
  return { service };
}

export async function deleteService(token: string, serviceId: string): Promise<{ message: string }> {
  const actor = await requireActor(token, ['admin']);
  const { data: existing } = await supabase.from('services').select('*').eq('id', serviceId).maybeSingle();
  if (!existing) throw new ApiError('Service not found.', 404);
  const { data: linked } = await supabase.from('bookings').select('id,extras').limit(50);
  const inUse = (linked ?? []).some((row) => Array.isArray((row as Record<string, unknown>).extras) && ((row as Record<string, unknown>).extras as unknown[]).includes(serviceId));
  if (inUse) {
    const { error } = await supabase.from('services').update({ active: false }).eq('id', serviceId);
    if (error) throw toError(error.message, 'Could not archive service');
    await recordAudit({ action: 'service-archived', actor: { id: actor.id, name: actor.name, role: actor.role }, target: serviceId, details: { name: String((existing as Record<string, unknown>).name ?? serviceId) } });
    return { message: 'Service archived (in use).' };
  }
  const { error } = await supabase.from('services').delete().eq('id', serviceId);
  if (error) throw toError(error.message, 'Could not delete service');
  await recordAudit({ action: 'service-deleted', actor: { id: actor.id, name: actor.name, role: actor.role }, target: serviceId, details: { name: String((existing as Record<string, unknown>).name ?? serviceId) } });
  return { message: 'Service deleted successfully' };
}

export async function pricing(): Promise<{ pricing: PricingConfig }> {
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase não configurado: define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.', 500);
  }
  const [{ data, error }, servicesResult] = await Promise.all([
    supabase.from('pricing').select('*').eq('id', 1).maybeSingle(),
    supabase.from('services').select('*').eq('active', true).order('sortOrder', { ascending: true }),
  ]);
  if (error) {
    throw toError(error.message, 'Could not load pricing');
  }

  const extras: Record<string, number> = {};
  if (servicesResult.data && !isMissingTableError(servicesResult.error)) {
    for (const row of servicesResult.data ?? []) {
      const service = mapServiceRow(row as Record<string, unknown>);
      if (service.active) extras[service.id] = Number(service.price || 0);
    }
  }
  if (Object.keys(extras).length === 0) {
    const legacy = (data?.extras ?? {}) as Record<string, unknown>;
    for (const fallback of fallbackServices) {
      const legacyValue = legacy[fallback.id];
      extras[fallback.id] = Number.isFinite(Number(legacyValue)) ? Number(legacyValue) : fallback.price;
    }
  }

  if (!data) {
    return { pricing: { ...defaultPricing, extras } };
  }

  return {
    pricing: {
      perMemberPerHour: Number(data.perMemberPerHour ?? defaultPricing.perMemberPerHour),
      extras,
    },
  };
}

export async function updatePricing(
  token: string,
  updates: { perMemberPerHour?: number; extras?: Record<string, number | string> },
): Promise<{ pricing: PricingConfig }> {
  const actor = await requireActor(token, ['admin']);
  const { data: current } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();
  const currentExtras = ((current?.extras ?? {}) as Record<string, unknown>);
  const knownIds = new Set<string>([
    ...fallbackServices.map((service) => service.id),
    ...Object.keys(currentExtras),
    ...Object.keys(updates.extras ?? {}),
  ]);
  const mergedExtras: Record<string, number> = {};
  for (const id of knownIds) {
    const candidate = updates.extras && id in updates.extras ? updates.extras[id] : currentExtras[id];
    const fallbackPrice = fallbackServices.find((service) => service.id === id)?.price ?? 0;
    mergedExtras[id] = Number.isFinite(Number(candidate)) ? Number(candidate) : Number(fallbackPrice);
  }

  const merged: PricingConfig = {
    perMemberPerHour: Number.isFinite(Number(updates.perMemberPerHour))
      ? Number(updates.perMemberPerHour)
      : Number(current?.perMemberPerHour ?? defaultPricing.perMemberPerHour),
    extras: mergedExtras,
  };

  const { error } = await supabase
    .from('pricing')
    .upsert(
      {
        id: 1,
        perMemberPerHour: merged.perMemberPerHour,
        extras: merged.extras,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) {
    throw toError(error.message, 'Could not update pricing');
  }

  await recordAudit({
    action: 'pricing-updated',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: 'pricing',
    details: { pricing: merged },
  });

  return { pricing: merged };
}

// --- Utilizadores (admin) ------------------------------------

export async function adminUsers(token: string): Promise<{ users: ApiUser[] }> {
  await requireActor(token, ['admin']);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('createdAt', { ascending: true });

  if (error) {
    throw toError(error.message, 'Could not load users', 400);
  }

  return {
    users: (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      email: String(row.email ?? ''),
      role: normalizeRole(row.role),
      createdAt: String(row.createdAt ?? ''),
    })),
  };
}

export async function createUser(
  token: string,
  draft: { name: string; email: string; password: string; role: Role },
): Promise<{ message: string; user: ApiUser }> {
  const actor = await requireActor(token, ['admin']);
  const email = String(draft?.email || '').trim().toLowerCase();

  if (!draft?.name || !email || !draft?.password || !allowedRoles.includes(draft.role)) {
    throw new ApiError('Invalid user data provided.', 400);
  }

  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).limit(1);
  if (existing && existing.length > 0) {
    throw new ApiError('Email already in use.', 409);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: draft.password,
    options: { data: { name: draft.name, role: draft.role } },
  });

  if (error || !data.user) {
    throw toError(error?.message, 'Could not create user', 409);
  }

  const profile = await profileFor(data.user);

  await recordAudit({
    action: 'user-created',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: profile.id,
    details: { name: profile.name, email: profile.email },
  });

  return { message: 'User created successfully', user: profile };
}

export async function updateUser(
  token: string,
  draft: { id: string; name: string; email: string; password?: string; role: Role },
): Promise<{ message: string; user: ApiUser }> {
  const actor = await requireActor(token, ['admin']);

  const { data, error } = await supabase.rpc('admin_update_user', {
    p_actor: actor.id,
    p_id: draft.id,
    p_email: String(draft.email || '').trim().toLowerCase(),
    p_name: draft.name,
    p_role: draft.role,
    p_password: draft.password && draft.password.trim() ? draft.password.trim() : null,
  });

  if (error) {
    throw toError(error.message, 'Could not update user', 400);
  }

  const row = data as { id: string; name: string; email: string; role: string; createdAt: string };
  const user: ApiUser = {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    role: normalizeRole(row.role),
    createdAt: String(row.createdAt ?? ''),
  };

  await recordAudit({
    action: 'user-updated',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: user.id,
    details: { name: user.name, role: user.role },
  });

  return { message: 'User updated successfully', user };
}

export async function deleteUser(token: string, userId: string): Promise<{ message: string }> {
  const actor = await requireActor(token, ['admin']);

  const { data: target } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!target) {
    throw new ApiError('User not found.', 404);
  }

  const { error } = await supabase.rpc('admin_delete_user', {
    p_actor: actor.id,
    p_id: userId,
  });

  if (error) {
    throw toError(error.message, 'Could not delete user', 403);
  }

  await recordAudit({
    action: 'user-deleted',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: userId,
    details: { email: String(target.email ?? '') },
  });

  return { message: 'User deleted successfully' };
}

// --- Auditoria ----------------------------------------------

export async function auditLogs(token: string): Promise<{ auditLogs: ApiAuditEntry[] }> {
  await requireActor(token, ['admin']);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('createdAt', { ascending: true });

  if (error) {
    throw toError(error.message, 'Could not load audit logs', 400);
  }

  return {
    auditLogs: (data ?? []).map((row) => ({
      id: String(row.id),
      action: String(row.action),
      actor: (row.actor ?? {}) as ApiAuditEntry['actor'],
      target: String(row.target ?? ''),
      details: String(row.details ?? ''),
      createdAt: String(row.createdAt ?? ''),
    })),
  };
}

async function recordAudit(entry: {
  action: string;
  actor: { id: string; name: string; role: string };
  target: string;
  details: Record<string, unknown> | string;
}): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      id: `AUDIT-${randHex(6).toUpperCase()}`,
      action: entry.action,
      actor: entry.actor,
      target: entry.target,
      details: typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details),
      createdAt: new Date().toISOString(),
    });
    if (error) {
      console.error('Falha ao registar auditoria:', error.message);
    }
  } catch (failure) {
    console.error('Falha ao registar auditoria:', failure);
  }
}

// --- Notificações (Express fica só para emails) --------------

function notifyBooking(booking: ApiBooking, status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'): void {
  void fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking, status }),
  }).catch(() => {
    // Sem servidor de email a correr — a marcacao fica na mesma registada.
  });
}
