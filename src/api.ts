import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// ============================================================
// Camada de dados do FeedBook sobre o Supabase.
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
  extras: { engineer: number; recording: number; backline: number };
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
    return sum + Number(pricingConfig?.extras?.[extraName as keyof PricingConfig['extras']] ?? 0);
  }, 0);

  return Number((basePrice + extraValue).toFixed(2));
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
    const roomId = String(draft?.roomId || '').trim() || null;
    const roomName =
      String(draft?.roomName || '').trim() || (roomId ? roomsById[roomId] || '' : '');

    if (!roomName || !draft?.date || !draft?.time || !draft?.duration || !draft?.contactName || !draft?.email) {
      throw new ApiError('Missing required booking fields.', 400);
    }

    const { data: pricingData, error: pricingError } = await supabase
      .from('pricing')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (pricingError) {
      throw toError(pricingError.message, 'Failed to load pricing.');
    }
    const pricing: PricingConfig = pricingData
      ? {
          perMemberPerHour: Number(pricingData.perMemberPerHour ?? defaultPricing.perMemberPerHour),
          extras: {
            engineer: Number(pricingData.extras?.engineer ?? defaultPricing.extras.engineer),
            recording: Number(pricingData.extras?.recording ?? defaultPricing.extras.recording),
            backline: Number(pricingData.extras?.backline ?? defaultPricing.extras.backline),
          },
        }
      : defaultPricing;

    const extras = Array.isArray(draft.extras) ? draft.extras.filter(Boolean) : [];
    const duration = Number(draft.duration);
    const participants = Number(draft.participants || 0);
    const amount = Number.isFinite(Number(draft.amount))
      ? Number(draft.amount)
      : estimateBookingAmount({ duration, participants, extras }, pricing);

    const row = {
      id: `BOOKING-${randHex(8).toUpperCase()}`,
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

    const { data, error } = await supabase.from('bookings').insert(row).select().single();
    if (error || !data) {
      throw toError(error?.message, 'Falha ao criar marcacao.');
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
  const actor = await requireActor(token, ['admin']);

  const [{ data: rows, error }, profilesResult, pricingResult] = await Promise.all([
    supabase.from('bookings').select('*').order('date', { ascending: true }),
    supabase.from('profiles').select('id, name'),
    supabase.from('pricing').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (error) {
    throw toError(error.message, 'Could not load bookings', 400);
  }

  const pricing: PricingConfig = pricingResult.data
    ? {
        perMemberPerHour: Number(pricingResult.data.perMemberPerHour ?? defaultPricing.perMemberPerHour),
        extras: {
          engineer: Number(pricingResult.data.extras?.engineer ?? defaultPricing.extras.engineer),
          recording: Number(pricingResult.data.extras?.recording ?? defaultPricing.extras.recording),
          backline: Number(pricingResult.data.extras?.backline ?? defaultPricing.extras.backline),
        },
      }
    : defaultPricing;

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

    const { data: pricingData } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();
    const pricing: PricingConfig = pricingData
      ? {
          perMemberPerHour: Number(pricingData.perMemberPerHour ?? defaultPricing.perMemberPerHour),
          extras: {
            engineer: Number(pricingData.extras?.engineer ?? defaultPricing.extras.engineer),
            recording: Number(pricingData.extras?.recording ?? defaultPricing.extras.recording),
            backline: Number(pricingData.extras?.backline ?? defaultPricing.extras.backline),
          },
        }
      : defaultPricing;

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

  const [{ data: rows, error }, pricingResult] = await Promise.all([
    supabase.from('bookings').select('*'),
    supabase.from('pricing').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (error) {
    throw toError(error.message, 'Could not load finance', 400);
  }

  const extrasCatalog: Record<string, number> = {
    engineer: Number(pricingResult.data?.extras?.engineer ?? defaultPricing.extras.engineer),
    recording: Number(pricingResult.data?.extras?.recording ?? defaultPricing.extras.recording),
    backline: Number(pricingResult.data?.extras?.backline ?? defaultPricing.extras.backline),
  };

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

export async function pricing(): Promise<{ pricing: PricingConfig }> {
  const { data, error } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();
  if (error) {
    throw toError(error.message, 'Could not load pricing');
  }

  if (!data) {
    return { pricing: defaultPricing };
  }

  return {
    pricing: {
      perMemberPerHour: Number(data.perMemberPerHour ?? defaultPricing.perMemberPerHour),
      extras: {
        engineer: Number(data.extras?.engineer ?? defaultPricing.extras.engineer),
        recording: Number(data.extras?.recording ?? defaultPricing.extras.recording),
        backline: Number(data.extras?.backline ?? defaultPricing.extras.backline),
      },
    },
  };
}

export async function updatePricing(
  token: string,
  updates: { perMemberPerHour?: number; extras?: Partial<PricingConfig['extras']> },
): Promise<{ pricing: PricingConfig }> {
  const actor = await requireActor(token, ['admin']);
  const { data: current } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();

  const merged: PricingConfig = {
    perMemberPerHour: Number.isFinite(Number(updates.perMemberPerHour))
      ? Number(updates.perMemberPerHour)
      : Number(current?.perMemberPerHour ?? defaultPricing.perMemberPerHour),
    extras: {
      engineer: Number.isFinite(Number(updates.extras?.engineer))
        ? Number(updates.extras?.engineer)
        : Number(current?.extras?.engineer ?? defaultPricing.extras.engineer),
      recording: Number.isFinite(Number(updates.extras?.recording))
        ? Number(updates.extras?.recording)
        : Number(current?.extras?.recording ?? defaultPricing.extras.recording),
      backline: Number.isFinite(Number(updates.extras?.backline))
        ? Number(updates.extras?.backline)
        : Number(current?.extras?.backline ?? defaultPricing.extras.backline),
    },
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
