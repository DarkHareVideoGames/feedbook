import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
  calculateRehearsalPrice,
  resolveRoomPricePerHour,
  MAX_REHEARSAL_HOURS,
} from './helpers/rehearsalPricing';

// ============================================================
// Camada de dados do Feedback - Ensaios sobre o Supabase.
// Espelha os shapes dos antigos endpoints /api/* do Express
// para manter as páginas praticamente intactas.
// ============================================================

export type Role = 'superuser' | 'admin' | 'collaborator' | 'technician';

// Função/cargo (metadado, não confere permissões — as permissões vêm do Role).
export type StaffFunction =
  | 'diretor-producao'
  | 'diretor-tecnico'
  | 'produtor-executivo'
  | 'gestor-operativo'
  | 'gestor-manutencao'
  | 'tecnico';

// O role privilegiado (superuser) é determinado apenas na base de dados
// (tabela profiles.role). O front-end não aplica qualquer fallback por email.
export const staffFunctionLabels: Record<StaffFunction, string> = {
  'diretor-producao': 'Diretor de Produção',
  'diretor-tecnico': 'Diretor Técnico',
  'produtor-executivo': 'Produtor Executivo',
  'gestor-operativo': 'Gestor Operativo',
  'gestor-manutencao': 'Gestor de Manutenção',
  tecnico: 'Técnico',
};

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  function: StaffFunction | null;
  createdAt: string;
};

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export type ActorStamp = { id: string; name: string; role: string; phone: string; at: string };

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
  rescheduledBy?: ActorStamp | null;
  assignedCollaborator?: { id: string; name: string } | null;
  // Pessoa que assegura o ensaio, congelada no momento em que o pagamento
  // foi confirmado (Issue #8). Espelha assignedCollaborator; nao e limpo
  // quando o ensaio muda de responsavel, preservando o vinculo do pagamento.
  paymentAssignee?: { id: string; name: string } | null;
  // Pessoa que RECEBEU o pagamento, escolhida no modal de confirmacao
  // (omissao: quem confirma no sistema). Distinta de paymentConfirmedBy,
  // que regista apenas quem executou a acao (auditoria).
  paymentReceivedBy?: { id: string; name: string } | null;
  createdAt?: string;
};

export type PricingConfig = {
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
  imageUrl?: string | null;
  gear: string[];
  gearEn: string[];
  accent: string;
  active: boolean;
  bookingMode: 'booking' | 'contact';
};

export type ApiService = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
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
  imageUrl?: string | null;
  gear?: string;
  gearEn?: string;
  accent?: string;
  active?: boolean;
  bookingMode?: 'booking' | 'contact';
};

export type ContactRequestStatus = 'pending' | 'contacted' | 'closed';

export type ApiContactRequest = {
  id: string;
  roomId: string;
  roomName: string;
  contactName: string;
  contactPhone: string;
  email: string;
  bandName?: string | null;
  message?: string | null;
  status: ContactRequestStatus;
  createdAt: string;
  updatedAt?: string;
};

export type ServiceDraft = {
  id?: string;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
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
  paymentAssignee?: { id: string; name: string } | null;
  paymentReceivedBy?: { id: string; name: string } | null;
};

export type FinanceMonthSummary = {
  month: string;
  totalReceived: number;
  totalRefunded: number;
  netTotal: number;
  bookingCount: number;
  bookings: FinanceBooking[];
};

const allowedRoles: Role[] = ['superuser', 'admin', 'collaborator', 'technician'];

const allowedFunctions: StaffFunction[] = [
  'diretor-producao',
  'diretor-tecnico',
  'produtor-executivo',
  'gestor-operativo',
  'gestor-manutencao',
  'tecnico',
];

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
    bookingMode: 'booking',
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
    bookingMode: 'booking',
  },
];

const fallbackServices: ApiService[] = [
  { id: 'engineer', name: 'Tecnico de sessao', nameEn: 'Session engineer', description: 'Tecnico de sessao durante o ensaio.', descriptionEn: 'Session engineer during the rehearsal.', price: 24, active: true, sortOrder: 0 },
  { id: 'recording', name: 'Captacao stereo do ensaio', nameEn: 'Stereo rehearsal capture', description: 'Gravacao stereo da sessao.', descriptionEn: 'Stereo recording of the session.', price: 18, active: true, sortOrder: 1 },
  { id: 'backline', name: 'Preparacao extra de backline', nameEn: 'Extra backline setup', description: 'Preparacao extra de backline.', descriptionEn: 'Extra backline setup.', price: 12, active: true, sortOrder: 2 },
];

const roomsById: Record<string, string> = {
  'sala-red': 'SALA RED',
  'sala-grey': 'SALA GREY',
};

const defaultPricing: PricingConfig = {
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

function normalizeFunction(value: unknown): StaffFunction | null {
  const fn = String(value ?? '').trim().toLowerCase();
  return allowedFunctions.includes(fn as StaffFunction) ? (fn as StaffFunction) : null;
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
  booking: {
    duration?: number | null;
    participants?: number | null;
    extras?: string[] | null;
    amount?: number | null;
    roomPricePerHour?: number | null;
  },
  pricingConfig: PricingConfig,
): number {
  if (Number.isFinite(Number(booking?.amount)) && booking?.amount !== null && booking?.amount !== undefined) {
    return Number(booking.amount);
  }

  // O preço da sala é por hora inteira, com desconto progressivo a partir do
  // preço/hora base da própria sala (já não há preço global — Issue #26).
  // Já não depende do número de elementos. Limitamos ao máximo de 6h
  // para nunca lançar erro ao estimar reservas antigas/legadas.
  const hours = Math.min(Math.ceil(Number(booking?.duration || 0)), MAX_REHEARSAL_HOURS);
  const pricePerHour = resolveRoomPricePerHour(booking?.roomPricePerHour);
  const roomPrice = calculateRehearsalPrice(hours, pricePerHour);
  const extras = Array.isArray(booking?.extras) ? booking.extras : [];
  const extraValue = extras.reduce((sum, extraName) => {
    return sum + Number(pricingConfig?.extras?.[extraName] ?? 0);
  }, 0);

  return Number((roomPrice + extraValue).toFixed(2));
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
  return { extras };
}

// Mapa roomId -> preço da sala (EUR/hora). Usado para calcular o valor
// de cada reserva com o preço/hora base correto de cada sala.
async function loadRoomPriceMap(): Promise<Record<string, number | null>> {
  try {
    const { rooms } = await listRooms({ includeInactive: true });
    const map: Record<string, number | null> = {};
    for (const room of rooms) {
      map[room.id] = room.pricePerMemberHour === null || room.pricePerMemberHour === undefined
        ? null
        : Number(room.pricePerMemberHour);
    }
    return map;
  } catch {
    return {};
  }
}

function mapBookingRow(row: Record<string, unknown>): ApiBooking {
  return {
    ...(row as unknown as ApiBooking),
    id: String(row.id ?? ''),
    roomId: (row.roomId ?? row.room_id ?? null) as string | null,
    roomName: String(row.roomName ?? row.room_name ?? ''),
    status: (row.status ?? 'pending') as ApiBooking['status'],
    date: String(row.date ?? ''),
    time: String(row.time ?? ''),
    duration: Number(row.duration ?? 0),
    bandName: row.bandName === undefined ? null : (row.bandName as string | null),
    contactName: String(row.contactName ?? row.contact_name ?? ''),
    contactPhone: row.contactPhone === undefined ? null : (row.contactPhone as string | null),
    email: String(row.email ?? ''),
    participants: row.participants === null || row.participants === undefined ? null : Number(row.participants),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
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
    const metadata = (user.user_metadata ?? {}) as { name?: string; role?: string; function?: string };
    return {
      id: user.id,
      name: metadata.name || String(user.email ?? '').split('@')[0],
      email: String(user.email ?? ''),
      role: normalizeRole(metadata.role),
      function: normalizeFunction(metadata.function),
      phone: '',
      createdAt: user.created_at ?? new Date().toISOString(),
    };
  }

  return {
    id: String(data.id),
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    role: normalizeRole(data.role),
    function: normalizeFunction(data.function),
    phone: String(data.phone ?? ''),
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

  const authUser = data.user;
  const profile = await profileFor(authUser);
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
    .select('id, roomId, roomName, status, date, time, duration')
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
    const roomPriceMap = await loadRoomPriceMap();

    const extras = Array.isArray(draft.extras) ? draft.extras.filter(Boolean) : [];
    const duration = Number(draft.duration);
    const participants = Number(draft.participants || 0);
    const amount = Number.isFinite(Number(draft.amount))
      ? Number(draft.amount)
      : estimateBookingAmount(
          { duration, participants, extras, roomPricePerHour: roomId ? roomPriceMap[roomId] ?? null : null },
          pricing,
        );

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

export type CreateContactRequestDraft = {
  roomId: string;
  contactName: string;
  contactPhone: string;
  email: string;
  bandName?: string;
  message?: string;
};

function mapContactRequestRow(row: Record<string, unknown>): ApiContactRequest {
  return {
    id: String(row.id ?? ''),
    roomId: String(row.roomId ?? row.room_id ?? ''),
    roomName: String(row.roomName ?? row.room_name ?? ''),
    contactName: String(row.contactName ?? row.contact_name ?? ''),
    contactPhone: String(row.contactPhone ?? row.contact_phone ?? ''),
    email: String(row.email ?? ''),
    bandName: row.bandName === undefined ? null : (row.bandName as string | null),
    message: row.message === undefined ? null : (row.message as string | null),
    status: (row.status ?? 'pending') as ContactRequestStatus,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
  };
}

export async function createContactRequest(draft: CreateContactRequestDraft): Promise<{ contactRequest: ApiContactRequest }> {
  const roomId = String(draft.roomId || '').trim();
  const contactName = String(draft.contactName || '').trim();
  const contactPhone = String(draft.contactPhone || '').trim();
  const email = String(draft.email || '').trim().toLowerCase();
  if (!roomId || !contactName || !contactPhone || !email) {
    throw new ApiError('Missing required contact request fields.', 400);
  }

  const response = await fetch('/api/contact-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      contactName,
      contactPhone,
      email,
      bandName: draft.bandName,
      message: draft.message,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { contactRequest?: ApiContactRequest; message?: string };
  if (!response.ok || !payload.contactRequest) {
    throw new ApiError(payload.message || 'Nao foi possivel enviar o pedido de contacto.', response.status || 500);
  }
  return { contactRequest: mapContactRequestRow(payload.contactRequest as Record<string, unknown>) };
}

export async function adminContactRequests(token: string): Promise<{ contactRequests: ApiContactRequest[] }> {
  await requireActor(token, ['superuser', 'admin', 'collaborator', 'technician']);
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw toError(error.message, 'Could not load contact requests.', 400);
  return { contactRequests: (data ?? []).map((row) => mapContactRequestRow(row as Record<string, unknown>)) };
}

export async function updateContactRequestStatus(
  token: string,
  contactRequestId: string,
  status: ContactRequestStatus,
): Promise<{ contactRequest: ApiContactRequest }> {
  if (!['pending', 'contacted', 'closed'].includes(status)) {
    throw new ApiError('Invalid contact request status.', 400);
  }
  const actor = await requireActor(token, ['superuser', 'admin', 'collaborator', 'technician']);
  const { data, error } = await supabase
    .from('contact_requests')
    .update({ status })
    .eq('id', contactRequestId)
    .select()
    .single();
  if (error || !data) throw toError(error?.message, 'Nao foi possivel atualizar o pedido de contacto.');
  const contactRequest = mapContactRequestRow(data as Record<string, unknown>);
  await recordAudit({
    action: 'contact-request-status-updated',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: contactRequest.id,
    details: { sala: contactRequest.roomName, estado: status },
  });
  return { contactRequest };
}

export async function deleteContactRequest(token: string, contactRequestId: string): Promise<{ message: string }> {
  const actor = await requireActor(token, ['superuser']);
  const { data: existing, error: existingError } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('id', contactRequestId)
    .maybeSingle();
  if (existingError) throw toError(existingError.message, 'Nao foi possivel consultar o pedido de contacto.');
  if (!existing) throw new ApiError('Pedido de contacto nao encontrado ou sem permissao para o consultar.', 404);

  const { data: deletedRows, error } = await supabase
    .from('contact_requests')
    .delete()
    .eq('id', contactRequestId)
    .select('id');
  if (error) throw toError(error.message, 'Nao foi possivel apagar o pedido de contacto.');
  if (!deletedRows || deletedRows.length !== 1) {
    throw new ApiError('O pedido de contacto nao foi apagado. Confirme se a politica DELETE para superuser foi aplicada no Supabase.', 403);
  }

  const contactRequest = mapContactRequestRow(existing as Record<string, unknown>);
  await recordAudit({
    action: 'contact-request-deleted',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: contactRequest.id,
    details: { sala: contactRequest.roomName, contacto: contactRequest.contactName },
  });
  return { message: 'Pedido de contacto apagado.' };
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
  await requireActor(token, ['superuser', 'admin', 'collaborator', 'technician']);

  const { data: rows, error } = await supabase
    .from('bookings')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    throw toError(error.message, 'Could not load bookings', 400);
  }

  const pricing = await loadPricingConfig();
  const roomPriceMap = await loadRoomPriceMap();

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

  // A atribuicao real (assignedCollaborator) vem directamente da BD, definida
  // na confirmacao: o admin escolhe o responsavel ou o colaborador assegura a si proprio.
  return {
    bookings: bookings.map((booking) => ({
      ...booking,
      paymentStatus: normalizePaymentStatus(booking.paymentStatus),
      amount: Number.isFinite(Number(booking.amount)) && booking.amount !== null
        ? Number(booking.amount)
        : estimateBookingAmount(
            { ...booking, roomPricePerHour: booking.roomId ? roomPriceMap[booking.roomId] ?? null : null },
            pricing,
          ),
    })),
  };
}

export type BookingAction = 'confirm' | 'reject' | 'cancel' | 'refund' | 'reschedule' | 'confirm-payment';

export async function bookingAction(
  token: string,
  bookingId: string,
  action: BookingAction,
  body?: {
    date?: string;
    time?: string;
    duration?: number;
    amount?: number;
    assignedCollaboratorId?: string;
    paymentReceivedById?: string;
  },
): Promise<{ booking: ApiBooking }> {
  const actor = await requireActor(token, ['superuser', 'admin', 'collaborator', 'technician']);

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
  const actorStamp: ActorStamp = { id: actor.id, name: actor.name, role: actor.role, phone: actor.phone, at: now };

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
    // Responsavel pelo ensaio:
    // - admin/superuser escolhe (via dropdown) — por defeito fica ele proprio;
    // - colaborador que confirma assegura sempre ele proprio.
    const isAdminLike = actor.role === 'admin' || actor.role === 'superuser';
    const requestedAssigneeId = String(body?.assignedCollaboratorId || '').trim();
    const assigneeId = isAdminLike && requestedAssigneeId ? requestedAssigneeId : actor.id;

    let assigneeName = actor.name;
    if (assigneeId !== actor.id) {
      const { data: assigneeProfile } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('id', assigneeId)
        .maybeSingle();
      if (!assigneeProfile) {
        throw new ApiError('Responsavel atribuido nao encontrado.', 400);
      }
      assigneeName = String(assigneeProfile.name || '');
    }

    patch.status = 'confirmed';
    patch.confirmedBy = actorStamp;
    patch.assignedCollaborator = { id: assigneeId, name: assigneeName };
    auditAction = 'booking-confirmed';
    auditDetails = {
      ...baseDetails,
      confirmadoPor: actor.name,
      designado: assigneeName,
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
    // Marcador persistente de reagendamento (nao e limpo na reconfirmacao),
    // usado pelo filtro "Reagendados" da administracao.
    patch.rescheduledBy = actorStamp;

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
    const roomPriceMap = await loadRoomPriceMap();

    patch.paymentStatus = 'received';
    patch.paymentConfirmedBy = actorStamp;
    patch.paymentConfirmedAt = now;
    // Issue #8: o pagamento fica vinculado a pessoa que assegura o ensaio
    // (responsavel escolhido no dropdown "Assegura:" na confirmacao do
    // ensaio), e nao a quem clicou em confirmar o pagamento.
    patch.paymentAssignee = booking.assignedCollaborator ?? null;

    // Quem RECEBEU o pagamento: por omissao quem confirma no sistema, mas
    // pode ser outra pessoa escolhida no dropdown do modal de pagamento.
    const requestedReceiverId = String(body?.paymentReceivedById || '').trim();
    const receiverId = requestedReceiverId || actor.id;
    let receiverName = actor.name;
    if (receiverId !== actor.id) {
      const { data: receiverProfile } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('id', receiverId)
        .maybeSingle();
      if (!receiverProfile) {
        throw new ApiError('Quem recebeu o pagamento nao encontrado.', 400);
      }
      receiverName = String(receiverProfile.name || '');
    }
    patch.paymentReceivedBy = { id: receiverId, name: receiverName };

    patch.amount = Number.isFinite(Number(body?.amount))
      ? Number(body?.amount)
      : Number(
          booking.amount ??
            estimateBookingAmount(
              { ...booking, roomPricePerHour: booking.roomId ? roomPriceMap[booking.roomId] ?? null : null },
              pricing,
            ),
        );

    auditAction = 'payment-confirmed';
    auditDetails = {
      ...baseDetails,
      montante: patch.amount,
      confirmadoPor: actor.name,
      assegura: booking.assignedCollaborator?.name || '-',
      recebidoPor: receiverName,
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
  await requireActor(token, ['admin', 'superuser']);

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
        paymentAssignee: booking.paymentAssignee ?? null,
        paymentReceivedBy: booking.paymentReceivedBy ?? null,
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

// --- Imagens das salas (Supabase Storage, bucket público) ------

// Bucket público onde ficam as fotos das salas. A leitura é anónima
// (o site carrega as fotos sem login); a escrita é restrita a autenticados.
export const ROOM_IMAGES_BUCKET = 'images';
const ROOM_IMAGES_FOLDER = 'rooms';
const ROOM_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ROOM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function normalizeRoomImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function roomImageExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.includes('.') ? fileName.split('.').pop() : '';
  if (fromName && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Envia a foto de uma sala para o bucket público e devolve o URL público.
 * Exige um ator admin/superuser (o cliente está autenticado → role authenticated).
 */
export async function uploadRoomImage(
  token: string,
  roomId: string,
  file: File,
): Promise<{ url: string }> {
  await requireActor(token, ['superuser', 'admin']);

  if (!ROOM_IMAGE_TYPES.includes(file.type)) {
    throw new ApiError('Formato de imagem inválido. Usa JPG, PNG ou WebP.', 400);
  }
  if (file.size > ROOM_IMAGE_MAX_BYTES) {
    throw new ApiError('Imagem demasiado grande. O máximo é 5 MB.', 400);
  }

  const safeRoom = String(roomId || '').trim() || `sala-${randHex(3).toLowerCase()}`;
  const ext = roomImageExtension(file.name, file.type);
  const path = `${ROOM_IMAGES_FOLDER}/${safeRoom}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(ROOM_IMAGES_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    throw toError(error.message, 'Could not upload room image', 400);
  }

  const { data } = supabase.storage.from(ROOM_IMAGES_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
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
    imageUrl: normalizeRoomImageUrl(row.imageUrl ?? (row as Record<string, unknown>).image_url),
    gear,
    gearEn,
    accent: String(row.accent ?? 'var(--room-red)'),
    active: row.active !== false,
    bookingMode: row.bookingMode === 'contact' ? 'contact' : 'booking',
  };
}

function mapServiceRow(row: Record<string, unknown>): ApiService {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    nameEn: String(row.nameEn ?? (row as Record<string, unknown>).name_en ?? ''),
    description: String(row.description ?? ''),
    descriptionEn: String(row.descriptionEn ?? (row as Record<string, unknown>).description_en ?? ''),
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
  const actor = await requireActor(token, ['admin', 'superuser']);
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
    imageUrl: normalizeRoomImageUrl(draft?.imageUrl),
    gear: splitLines(draft?.gear),
    gearEn: splitLines(draft?.gearEn),
    accent: String(draft?.accent || 'var(--room-red)'),
    active: draft?.active !== false,
    bookingMode: draft?.bookingMode === 'contact' ? 'contact' : 'booking',
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
  const actor = await requireActor(token, ['admin', 'superuser']);
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
    bookingMode: draft?.bookingMode === 'contact' ? 'contact' : 'booking',
    imageUrl: normalizeRoomImageUrl(draft?.imageUrl),
  };
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', roomId).select().single();
  if (error || !data) throw toError(error?.message, 'Could not update room');
  const room = mapRoomRow(data as Record<string, unknown>);
  await recordAudit({ action: 'room-updated', actor: { id: actor.id, name: actor.name, role: actor.role }, target: room.id, details: { name: room.name } });
  return { room };
}

export async function deleteRoom(token: string, roomId: string): Promise<{ message: string }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
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
  return { services };
}

export async function createService(token: string, draft: ServiceDraft): Promise<{ service: ApiService }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
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
    descriptionEn: String(draft?.descriptionEn ?? ''),
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
  const actor = await requireActor(token, ['admin', 'superuser']);
  const name = String(draft?.name || '').trim();
  const price = Number(draft?.price);
  if (!name) throw new ApiError('Service name is required.', 400);
  if (!Number.isFinite(price) || price < 0) throw new ApiError('Invalid service price.', 400);
  const patch: Record<string, unknown> = {
    name,
    nameEn: String(draft?.nameEn ?? ''),
    description: String(draft?.description ?? ''),
    descriptionEn: String(draft?.descriptionEn ?? ''),
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
  const actor = await requireActor(token, ['admin', 'superuser']);
  const { data: existing } = await supabase.from('services').select('*').eq('id', serviceId).maybeSingle();
  if (!existing) throw new ApiError('Service not found.', 404);
  // Apagar definitivo: remove o servico do catalogo (site + admin) mesmo que
  // tenha sido usado em marcacoes antigas — o historico guarda so o id.
  const { error } = await supabase.from('services').delete().eq('id', serviceId);
  if (error) throw toError(error.message, 'Could not delete service');
  // Limpa o legado na tabela pricing para nao "ressuscitar" o extra no site.
  try {
    const { data: pricingRow } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();
    const currentExtras = ((pricingRow?.extras ?? {}) as Record<string, unknown>);
    if (serviceId in currentExtras) {
      const nextExtras: Record<string, unknown> = { ...currentExtras };
      delete nextExtras[serviceId];
      await supabase.from('pricing').upsert({ id: 1, extras: nextExtras, updatedAt: new Date().toISOString() }, { onConflict: 'id' });
    }
  } catch {
    // Nao bloqueia o apagar se a limpeza do legado falhar.
  }
  await recordAudit({ action: 'service-deleted', actor: { id: actor.id, name: actor.name, role: actor.role }, target: serviceId, details: { name: String((existing as Record<string, unknown>).name ?? serviceId) } });
  return { message: 'Servico apagado definitivamente.' };
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

  return { pricing: { extras } };
}

export async function updatePricing(
  token: string,
  updates: { extras?: Record<string, number | string> },
): Promise<{ pricing: PricingConfig }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
  const { data: current } = await supabase.from('pricing').select('*').eq('id', 1).maybeSingle();
  // Fonte unica de extras: tabela services. Se updates.extras vier omitido,
  // nao toca no legado — evita ressuscitar servicos apagados.
  const { data: liveServices } = await supabase.from('services').select('id,price').eq('active', true);
  const mergedExtras: Record<string, number> = {};
  if (updates.extras) {
    const currentExtras = ((current?.extras ?? {}) as Record<string, unknown>);
    const knownIds = new Set<string>([
      ...fallbackServices.map((service) => service.id),
      ...Object.keys(currentExtras),
      ...Object.keys(updates.extras ?? {}),
    ]);
    for (const id of knownIds) {
      const candidate = updates.extras && id in updates.extras ? updates.extras[id] : currentExtras[id];
      const fallbackPrice = fallbackServices.find((service) => service.id === id)?.price ?? 0;
      mergedExtras[id] = Number.isFinite(Number(candidate)) ? Number(candidate) : Number(fallbackPrice);
    }
  } else if (liveServices) {
    for (const row of liveServices) {
      const id = String((row as Record<string, unknown>).id ?? '');
      if (id) mergedExtras[id] = Number((row as Record<string, unknown>).price ?? 0);
    }
  }

  const merged: PricingConfig = {
    extras: mergedExtras,
  };

  const { error } = await supabase
    .from('pricing')
    .upsert(
      {
        id: 1,
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

// --- Definições da app (feature flags globais) ---------------

// Estado global do badge "Beta". Leitura pública (sem login): o site precisa de
// o mostrar/esconder em todos os dispositivos. Se a tabela ainda não existir
// (migração não corrida), assume o badge ativo para não esconder nada por engano.
export async function getAppSettings(): Promise<{ betaEnabled: boolean }> {
  if (!isSupabaseConfigured) {
    return { betaEnabled: true };
  }
  const { data, error } = await supabase
    .from('app_settings')
    .select('"betaEnabled"')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { betaEnabled: true };
    throw toError(error.message, 'Could not load app settings');
  }
  return { betaEnabled: data?.betaEnabled !== false };
}

// Atualiza o estado do badge. Reservado a admin/superuser.
export async function updateAppSettings(
  token: string,
  updates: { betaEnabled: boolean },
): Promise<{ betaEnabled: boolean }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
  const betaEnabled = updates.betaEnabled !== false;

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { id: true, betaEnabled, updatedAt: new Date().toISOString() },
      { onConflict: 'id' },
    );

  if (error) {
    throw toError(error.message, 'Could not update app settings');
  }

  await recordAudit({
    action: 'app-settings-updated',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: 'app_settings',
    details: { betaEnabled },
  });

  return { betaEnabled };
}

// --- Utilizadores (admin) ------------------------------------

export async function adminUsers(token: string): Promise<{ users: ApiUser[] }> {
  await requireActor(token, ['admin', 'superuser']);

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
      phone: String(row.phone ?? ''),
      role: normalizeRole(row.role),
      function: normalizeFunction(row.function),
      createdAt: String(row.createdAt ?? ''),
    })),
  };
}

// Password provisória aleatória (16 hex) — usada APENAS para criar a conta quando
// o admin deixa o campo em branco. Nunca é mostrada a ninguém; o convite por email
// permite ao utilizador definir a password definitiva.
function generateProvisionalPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createUser(
  token: string,
  draft: { name: string; email: string; password?: string; phone: string; role: Role; function?: StaffFunction | null },
): Promise<{ message: string; user: ApiUser }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
  const email = String(draft?.email || '').trim().toLowerCase();
  const phone = String(draft?.phone || '').trim();
  const staffFunction = draft?.function ? normalizeFunction(draft.function) : null;
  // Password vazia -> provisória aleatória; o convite por email define a definitiva.
  const password = String(draft?.password || '').trim() || generateProvisionalPassword();

  if (!draft?.name || !email || !phone || !allowedRoles.includes(draft.role)) {
    throw new ApiError('Invalid user data provided. Nome, email e telemovel sao obrigatorios.', 400);
  }

  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).limit(1);
  if (existing && existing.length > 0) {
    throw new ApiError('Email already in use.', 409);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: draft.name, phone, role: draft.role, function: staffFunction } },
  });

  if (error || !data.user) {
    throw toError(error?.message, 'Could not create user', 409);
  }

  const profile = await profileFor(data.user);

  await recordAudit({
    action: 'user-created',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: profile.id,
    details: { name: profile.name, email: profile.email, phone: profile.phone },
  });

  // Convite "define a tua password" em segundo plano (nunca bloqueia a criação;
  // falhas ficam nos logs do servidor).
  sendUserInvite(token, profile.email, profile.name);

  return { message: 'User created successfully', user: profile };
}

export async function updateUser(
  token: string,
  draft: { id: string; name: string; email: string; password?: string; role: Role; phone?: string; function?: StaffFunction | null },
): Promise<{ message: string; user: ApiUser }> {
  const actor = await requireActor(token, ['admin', 'superuser']);
  const staffFunction = draft.function ? normalizeFunction(draft.function) : null;
  const email = String(draft?.email || '').trim().toLowerCase();
  const phone = String(draft?.phone || '').trim();

  if (!draft?.name || !email || !phone) {
    throw new ApiError('Invalid user data provided. Nome, email e telemovel sao obrigatorios.', 400);
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', draft.id)
    .maybeSingle();

  if (!target) {
    throw new ApiError('User not found.', 404);
  }

  if (normalizeRole(target.role) === 'superuser' && actor.role !== 'superuser') {
    throw new ApiError('A conta Superuser só pode ser alterada pelo próprio Superuser.', 403);
  }

  const { data, error } = await supabase.rpc('admin_update_user', {
    p_id: draft.id,
    p_email: email,
    p_name: draft.name,
    p_phone: phone,
    p_role: draft.role,
    p_function: staffFunction,
    p_password: draft.password && draft.password.trim() ? draft.password.trim() : null,
  });

  if (error) {
    throw toError(error.message, 'Could not update user', 400);
  }

  const row = data as { id: string; name: string; email: string; role: string; phone: string; function?: string; createdAt: string };
  const user: ApiUser = {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    role: normalizeRole(row.role),
    function: normalizeFunction(row.function),
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
  const actor = await requireActor(token, ['admin', 'superuser']);

  const { data: target } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!target) {
    throw new ApiError('User not found.', 404);
  }

  if (normalizeRole(target.role) === 'superuser') {
    throw new ApiError('A conta Superuser está protegida e não pode ser apagada.', 403);
  }

  const { error } = await supabase.rpc('admin_delete_user', {
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

// --- Limpeza total de ensaios (apenas superuser) ---------------

// Apaga TODAS as marcacoes (independentemente do estado/data) para
// permitir arrancar "do zero" antes do lancamento. Operacao irreversivel:
// exige role 'superuser' e deve ser chamada apos dupla confirmacao na UI.
export async function clearAllBookings(token: string): Promise<{ deletedCount: number; message: string }> {
  const actor = await requireActor(token, ['superuser']);

  let deletedCount = 0;
  for (let page = 0; page < 50; page += 1) {
    const { data: rows, error: listError } = await supabase
      .from('bookings')
      .select('id')
      .limit(1000);

    if (listError) {
      throw toError(listError.message, 'Could not list bookings for cleanup', 400);
    }

    const ids = (rows ?? []).map((row) => String((row as Record<string, unknown>).id ?? '')).filter(Boolean);
    if (ids.length === 0) break;

    const { error: deleteError } = await supabase.from('bookings').delete().in('id', ids);
    if (deleteError) {
      throw toError(deleteError.message, 'Could not delete bookings', 400);
    }
    deletedCount += ids.length;
    if (ids.length < 1000) break;
  }

  await recordAudit({
    action: 'bookings-cleared',
    actor: { id: actor.id, name: actor.name, role: actor.role },
    target: 'bookings',
    details: { apagados: deletedCount },
  });

  return { deletedCount, message: `Base de dados limpa: ${deletedCount} ensaio(s) apagado(s).` };
}

// --- Auditoria ----------------------------------------------

export async function auditLogs(token: string): Promise<{ auditLogs: ApiAuditEntry[] }> {
  await requireActor(token, ['admin', 'superuser']);

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

// Envia o email de convite "define a tua password" (disparo em segundo plano;
// falhas não afetam a criação do utilizador — ver logs do servidor).
export function sendUserInvite(token: string, email: string, name: string): void {
  void fetch('/api/user-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, name }),
  }).catch((err) => console.error('Erro ao enviar convite de utilizador:', err));
}

// Reenvia o link de redefinição de password a um utilizador existente (Issue #9).
// Reservado ao superuser — o servidor valida o role e devolve 403 caso contrário.
// Ao contrário de sendUserInvite, aguarda a resposta para a UI mostrar feedback.
export async function resendPasswordReset(token: string, email: string, name: string): Promise<{ message: string }> {
  const response = await fetch('/api/user-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, name, mode: 'reset' }),
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(payload.message || 'Nao foi possivel reenviar o link de redefinicao.', response.status);
  }
  return { message: payload.message || 'Link de redefinicao reenviado.' };
}

function notifyBooking(booking: ApiBooking, status: 'pending' | 'confirmed' | 'rejected' | 'cancelled'): void {
  void fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking, status }),
  }).catch(() => {
    // Sem servidor de email a correr — a marcacao fica na mesma registada.
  });
}
