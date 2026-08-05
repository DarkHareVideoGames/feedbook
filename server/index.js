import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  ...String(process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(cors());
app.use(express.json());

const rooms = {
  'sala-red': { id: 'sala-red', name: 'SALA RED', maxMembers: 6 },
  'sala-grey': { id: 'sala-grey', name: 'SALA GREY', maxMembers: 5 },
};

const defaultPricing = {
  perMemberPerHour: 3,
  extras: {
    engineer: 24,
    recording: 18,
    backline: 12,
  },
};

const defaultAdminEmail = String(process.env.ADMIN_EMAIL || 'admin@feedbook.local').trim().toLowerCase();
const defaultAdminPassword = String(process.env.ADMIN_PASSWORD || 'admin123');
const allowedRoles = ['admin', 'collaborator', 'technician'];
const allowedPaymentMethods = ['mbway', 'on-site'];
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || 'FeedBook <no-reply@feedbook.local>').trim();
const WHATSAPP_TWILIO_ACCOUNT_SID = String(process.env.WHATSAPP_TWILIO_ACCOUNT_SID || '').trim();
const WHATSAPP_TWILIO_AUTH_TOKEN = String(process.env.WHATSAPP_TWILIO_AUTH_TOKEN || '').trim();
const WHATSAPP_TWILIO_FROM = String(process.env.WHATSAPP_TWILIO_FROM || '').trim();

const initialState = loadState();
const bookings = initialState.bookings;
const users = initialState.users;
const pricing = initialState.pricing;
const notifications = initialState.notifications;
const auditLogs = initialState.auditLogs;

const sessions = new Map();
const emailTransport = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

function loadState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      bookings: [],
      users: [
        buildUser({
          id: 'USR-ADMIN-1',
          name: 'FeedBook Admin',
          email: defaultAdminEmail,
          password: defaultAdminPassword,
          role: 'admin',
        }),
      ],
      pricing: JSON.parse(JSON.stringify(defaultPricing)),
      notifications: [],
      auditLogs: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }

  try {
    const rawContent = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(rawContent);

    const parsedUsers = Array.isArray(parsed.users) ? parsed.users : [];
    const normalizedUsers = parsedUsers
      .map(normalizeStoredUser)
      .filter(Boolean);

    if (!normalizedUsers.some((user) => user.role === 'admin')) {
      normalizedUsers.unshift(
        buildUser({
          id: 'USR-ADMIN-1',
          name: 'FeedBook Admin',
          email: defaultAdminEmail,
          password: defaultAdminPassword,
          role: 'admin',
        }),
      );
    }

    const state = {
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
      users: normalizedUsers,
      pricing: normalizePricing(parsed.pricing),
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
    return state;
  } catch (_error) {
    const fallback = {
      bookings: [],
      users: [
        buildUser({
          id: 'USR-ADMIN-1',
          name: 'FeedBook Admin',
          email: defaultAdminEmail,
          password: defaultAdminPassword,
          role: 'admin',
        }),
      ],
      pricing: JSON.parse(JSON.stringify(defaultPricing)),
      notifications: [],
      auditLogs: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function saveState() {
  const state = {
    bookings,
    users,
    pricing,
    notifications,
    auditLogs,
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function normalizePricing(candidate) {
  const perMemberPerHour = Number(candidate?.perMemberPerHour);
  const engineer = Number(candidate?.extras?.engineer);
  const recording = Number(candidate?.extras?.recording);
  const backline = Number(candidate?.extras?.backline);

  if (
    !Number.isFinite(perMemberPerHour) ||
    !Number.isFinite(engineer) ||
    !Number.isFinite(recording) ||
    !Number.isFinite(backline)
  ) {
    return JSON.parse(JSON.stringify(defaultPricing));
  }

  return {
    perMemberPerHour,
    extras: {
      engineer,
      recording,
      backline,
    },
  };
}

function hashPassword(password, salt) {
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, effectiveSalt, 64).toString('hex');
  return {
    passwordSalt: effectiveSalt,
    passwordHash: hash,
  };
}

function buildUser({ id, name, email, password, role }) {
  const passwordData = hashPassword(String(password));
  return {
    id,
    name,
    email,
    role,
    createdAt: new Date().toISOString(),
    ...passwordData,
  };
}

function normalizeStoredUser(rawUser) {
  if (!rawUser || typeof rawUser !== 'object') {
    return null;
  }

  const role = allowedRoles.includes(rawUser.role) ? rawUser.role : null;
  const email = typeof rawUser.email === 'string' ? rawUser.email.trim().toLowerCase() : '';
  const name = typeof rawUser.name === 'string' ? rawUser.name.trim() : '';

  if (!role || !email || !name) {
    return null;
  }

  if (typeof rawUser.passwordHash === 'string' && typeof rawUser.passwordSalt === 'string') {
    return {
      id: rawUser.id || createUserId(),
      name,
      email,
      role,
      createdAt: rawUser.createdAt || new Date().toISOString(),
      passwordHash: rawUser.passwordHash,
      passwordSalt: rawUser.passwordSalt,
    };
  }

  if (typeof rawUser.password === 'string' && rawUser.password) {
    return {
      id: rawUser.id || createUserId(),
      name,
      email,
      role,
      createdAt: rawUser.createdAt || new Date().toISOString(),
      ...hashPassword(rawUser.password),
    };
  }

  return null;
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) {
    return false;
  }

  const passwordData = hashPassword(String(password), user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(user.passwordHash, 'hex'), Buffer.from(passwordData.passwordHash, 'hex'));
}

function createBookingId() {
  const numericPart = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  const alphaPart = Math.random().toString(36).slice(2, 4).toUpperCase().padEnd(2, 'X');
  return `FB-${numericPart}-${alphaPart}`;
}

function createUserId() {
  return `USR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function createNotificationId() {
  return `NTF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createAuditLogId() {
  return `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function createSessionToken() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function sanitizeUser(user) {
  const { password, passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice(7);
}

function getAuthUser(req) {
  const token = getBearerToken(req);
  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;

  return users.find((user) => user.id === session.userId) ?? null;
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }

  return user;
}

function requireRole(req, res, roles) {
  const user = requireAuth(req, res);
  if (!user) {
    return null;
  }

  if (!roles.includes(user.role)) {
    res.status(403).json({ message: 'You do not have permission for this action.' });
    return null;
  }

  return user;
}

function getBookingDisplayName(booking) {
  return booking.bandName || booking.contactName || booking.email;
}

function getPaymentLabel(locale, paymentMethod) {
  if (locale === 'en') {
    return paymentMethod === 'on-site' ? 'On rehearsal day' : 'MB WAY (full)';
  }

  return paymentMethod === 'on-site' ? 'No dia do ensaio' : 'MB WAY (total)';
}

function buildNotificationText(booking, eventType) {
  const locale = booking.locale === 'en' ? 'en' : 'pt-PT';
  const paymentLabel = getPaymentLabel(locale, booking.paymentMethod);

  if (locale === 'en') {
    if (eventType === 'confirmed') {
      return `Your rehearsal booking for ${booking.roomName} on ${booking.date} at ${booking.time} has been confirmed. Payment method: ${paymentLabel}.`;
    }

    return `We received your rehearsal booking for ${booking.roomName} on ${booking.date} at ${booking.time}. Payment method: ${paymentLabel}.`;
  }

  if (eventType === 'confirmed') {
    return `A tua reserva para ${booking.roomName} em ${booking.date} às ${booking.time} foi confirmada. Metodo de pagamento: ${paymentLabel}.`;
  }

  return `Recebemos a tua reserva para ${booking.roomName} em ${booking.date} às ${booking.time}. Metodo de pagamento: ${paymentLabel}.`;
}

function buildNotificationSubject(booking, eventType) {
  const locale = booking.locale === 'en' ? 'en' : 'pt-PT';
  if (locale === 'en') {
    return eventType === 'confirmed'
      ? 'FeedBook - Booking confirmed'
      : 'FeedBook - Booking received';
  }

  return eventType === 'confirmed'
    ? 'FeedBook - Reserva confirmada'
    : 'FeedBook - Reserva recebida';
}

function appendNotification(entry) {
  notifications.unshift(entry);
  saveState();
}

function appendAuditLog(entry) {
  auditLogs.unshift(entry);
  saveState();
}

function recordAuditAction({ action, actor, target, details }) {
  appendAuditLog({
    id: createAuditLogId(),
    action,
    actor: {
      id: actor.id,
      name: actor.name,
      role: actor.role,
    },
    target: target || '',
    details: details || '',
    createdAt: new Date().toISOString(),
  });
}

async function sendEmailNotification(booking, eventType) {
  if (!emailTransport) {
    return { status: 'skipped', reason: 'SMTP not configured' };
  }

  const subject = buildNotificationSubject(booking, eventType);
  const text = buildNotificationText(booking, eventType);

  await emailTransport.sendMail({
    from: SMTP_FROM,
    to: booking.email,
    subject,
    text,
  });

  return { status: 'sent' };
}

async function sendWhatsAppNotification(booking, eventType) {
  if (!WHATSAPP_TWILIO_ACCOUNT_SID || !WHATSAPP_TWILIO_AUTH_TOKEN || !WHATSAPP_TWILIO_FROM || !booking.contactPhone) {
    return { status: 'skipped', reason: 'WhatsApp not configured or phone missing' };
  }

  const payload = new URLSearchParams();
  payload.set('From', WHATSAPP_TWILIO_FROM);
  payload.set('To', booking.contactPhone.startsWith('whatsapp:') ? booking.contactPhone : `whatsapp:${booking.contactPhone}`);
  payload.set('Body', buildNotificationText(booking, eventType));

  const authToken = Buffer.from(`${WHATSAPP_TWILIO_ACCOUNT_SID}:${WHATSAPP_TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${WHATSAPP_TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }

  return { status: 'sent' };
}

async function sendBookingNotifications(booking, eventType) {
  const attempts = [];

  try {
    const emailResult = await sendEmailNotification(booking, eventType);
    attempts.push({ channel: 'email', ...emailResult });
  } catch (error) {
    attempts.push({
      channel: 'email',
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Unknown email error',
    });
  }

  if (booking.contactPhone) {
    try {
      const whatsappResult = await sendWhatsAppNotification(booking, eventType);
      attempts.push({ channel: 'whatsapp', ...whatsappResult });
    } catch (error) {
      attempts.push({
        channel: 'whatsapp',
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown WhatsApp error',
      });
    }
  }

  attempts.forEach((attempt) => {
    appendNotification({
      id: createNotificationId(),
      bookingId: booking.id,
      eventType,
      channel: attempt.channel,
      status: attempt.status,
      reason: attempt.reason || '',
      to: attempt.channel === 'email' ? booking.email : booking.contactPhone || '',
      createdAt: new Date().toISOString(),
    });
  });

  return attempts;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/bookings', (_req, res) => {
  res.json({ bookings });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = createSessionToken();
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return res.json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getBearerToken(req);
  if (token) {
    sessions.delete(token);
  }

  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) {
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

app.get('/api/admin/users', (req, res) => {
  const user = requireRole(req, res, ['admin']);
  if (!user) {
    return;
  }

  res.json({ users: users.map(sanitizeUser) });
});

app.post('/api/admin/users', (req, res) => {
  const actor = requireRole(req, res, ['admin']);
  if (!actor) {
    return;
  }

  const { name, email, password, role } = req.body ?? {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName || !normalizedEmail || !password || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid user payload.' });
  }

  const alreadyExists = users.some((item) => item.email.toLowerCase() === normalizedEmail);
  if (alreadyExists) {
    return res.status(409).json({ message: 'Email already exists.' });
  }

  const newUser = {
    id: createUserId(),
    name: normalizedName,
    email: normalizedEmail,
    role,
    createdAt: new Date().toISOString(),
    ...hashPassword(String(password)),
  };

  users.unshift(newUser);
  saveState();
  recordAuditAction({
    action: 'user-created',
    actor,
    target: newUser.id,
    details: `${newUser.role}:${newUser.email}`,
  });
  return res.status(201).json({ user: sanitizeUser(newUser) });
});

app.patch('/api/admin/users/:id', (req, res) => {
  const actor = requireRole(req, res, ['admin']);
  if (!actor) {
    return;
  }

  const targetId = req.params.id;
  const targetUser = users.find((item) => item.id === targetId);

  if (!targetUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const { name, email, password, role } = req.body ?? {};
  const nextName = typeof name === 'string' ? name.trim() : targetUser.name;
  const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : targetUser.email;
  const nextRole = typeof role === 'string' && allowedRoles.includes(role) ? role : targetUser.role;
  const nextPassword = typeof password === 'string' ? password.trim() : '';

  if (!nextName || !nextEmail || !nextRole) {
    return res.status(400).json({ message: 'Invalid user payload.' });
  }

  const duplicateEmail = users.some(
    (item) => item.id !== targetUser.id && item.email.toLowerCase() === nextEmail,
  );
  if (duplicateEmail) {
    return res.status(409).json({ message: 'Email already exists.' });
  }

  targetUser.name = nextName;
  targetUser.email = nextEmail;
  targetUser.role = nextRole;

  if (nextPassword) {
    Object.assign(targetUser, hashPassword(nextPassword));
  }

  saveState();
  recordAuditAction({
    action: 'user-updated',
    actor,
    target: targetUser.id,
    details: `${targetUser.role}:${targetUser.email}`,
  });

  return res.json({ user: sanitizeUser(targetUser) });
});

app.delete('/api/admin/users/:id', (req, res) => {
  const actor = requireRole(req, res, ['admin']);
  if (!actor) {
    return;
  }

  const targetId = req.params.id;
  if (targetId === actor.id) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const index = users.findIndex((item) => item.id === targetId);
  if (index === -1) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const [removedUser] = users.splice(index, 1);
  saveState();
  recordAuditAction({
    action: 'user-deleted',
    actor,
    target: removedUser.id,
    details: `${removedUser.role}:${removedUser.email}`,
  });

  return res.json({ ok: true });
});

app.get('/api/admin/bookings', (req, res) => {
  const user = requireRole(req, res, ['admin', 'collaborator', 'technician']);
  if (!user) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const period = req.query.period; // 'future' | 'past' | undefined (all)

  let result = bookings;
  if (period === 'future') {
    result = bookings.filter((b) => b.date >= today);
  } else if (period === 'past') {
    result = bookings.filter((b) => b.date < today);
  }

  res.json({ bookings: result });
});

app.get('/api/admin/audit-logs', (req, res) => {
  const user = requireRole(req, res, ['admin']);
  if (!user) {
    return;
  }

  // Enrich booking-related audit entries so old plain-text details still show useful info
  const enriched = auditLogs.map((entry) => {
    const isBookingAction =
      entry.action === 'booking-confirmed' || entry.action === 'booking-rejected';

    if (!isBookingAction) {
      return entry;
    }

    // Try to parse existing details as JSON — if it works, no enrichment needed
    try {
      const parsed = JSON.parse(entry.details);
      if (parsed && typeof parsed === 'object') {
        return entry;
      }
    } catch {
      // fall through to enrichment
    }

    // Look up the booking by target (booking ID)
    const booking = bookings.find((b) => b.id === entry.target);
    if (!booking) {
      return entry;
    }

    // Find the collaborator name from the users list if we only have an ID
    let designado = booking.assignedCollaborator?.name || 'Nao designado';
    if (!booking.assignedCollaborator?.name && entry.details.startsWith('assigned=')) {
      const collaboratorId = entry.details.replace('assigned=', '').trim();
      const found = users.find((u) => u.id === collaboratorId);
      if (found) designado = found.name;
    }

    const richDetails = JSON.stringify({
      banda: booking.bandName || booking.contactName || '-',
      contacto: booking.contactName || '-',
      sala: booking.roomName,
      data: booking.date,
      confirmadoPor: entry.action === 'booking-confirmed' ? entry.actor.name : undefined,
      rejeitadoPor: entry.action === 'booking-rejected' ? entry.actor.name : undefined,
      designado,
    });

    return { ...entry, details: richDetails };
  });

  res.json({ auditLogs: enriched });
});

app.get('/api/pricing', (_req, res) => {
  res.json({ pricing });
});

app.patch('/api/pricing', (req, res) => {
  const user = requireRole(req, res, ['admin']);
  if (!user) {
    return;
  }

  const { perMemberPerHour, extras } = req.body ?? {};

  const nextPerMemberPerHour = Number(perMemberPerHour);
  const nextExtras = extras ?? {};

  const engineer = Number(nextExtras.engineer);
  const recording = Number(nextExtras.recording);
  const backline = Number(nextExtras.backline);

  const numericValues = [nextPerMemberPerHour, engineer, recording, backline];
  const hasInvalidNumber = numericValues.some((value) => !Number.isFinite(value) || value < 0);

  if (hasInvalidNumber) {
    return res.status(400).json({ message: 'Pricing values must be valid non-negative numbers.' });
  }

  pricing.perMemberPerHour = Math.round(nextPerMemberPerHour * 100) / 100;
  pricing.extras = {
    engineer: Math.round(engineer * 100) / 100,
    recording: Math.round(recording * 100) / 100,
    backline: Math.round(backline * 100) / 100,
  };

  saveState();
  recordAuditAction({
    action: 'pricing-updated',
    actor: user,
    target: 'pricing',
    details: `perMemberPerHour=${pricing.perMemberPerHour}`,
  });

  return res.json({ pricing });
});

app.post('/api/bookings', (req, res) => {
  const {
    roomId,
    date,
    time,
    duration,
    extras,
    bandName,
    contactName,
    contactPhone,
    email,
    focus,
    locale,
    participants,
    paymentMethod,
  } = req.body ?? {};

  if (!roomId || !rooms[roomId]) {
    return res.status(400).json({ message: 'Invalid room selection.' });
  }

  if (!date || !time || !duration || !email) {
    return res.status(400).json({ message: 'Missing required booking fields.' });
  }

  const participantsCount = Number(participants);
  if (!Number.isFinite(participantsCount) || participantsCount < 1) {
    return res.status(400).json({ message: 'Invalid participant count.' });
  }

  if (participantsCount > rooms[roomId].maxMembers) {
    return res.status(400).json({ message: 'Participant count exceeds room capacity.' });
  }

  const normalizedPaymentMethod = allowedPaymentMethods.includes(paymentMethod)
    ? paymentMethod
    : 'mbway';
  const paymentStatus = normalizedPaymentMethod === 'mbway' ? 'pending-mbway' : 'pay-on-site';

  const durationHours = Number(duration);
  const extrasList = Array.isArray(extras) ? extras : [];
  const extrasTotal = extrasList.reduce((sum, extraId) => {
    const extraPrice = pricing.extras[extraId] || 0;
    return sum + extraPrice;
  }, 0);
  const roomTotal = pricing.perMemberPerHour * participantsCount * durationHours;
  const total = roomTotal + extrasTotal;

  const booking = {
    id: createBookingId(),
    status: 'pending',
    roomId,
    roomName: rooms[roomId].name,
    date,
    time,
    duration: durationHours,
    extras: extrasList,
    bandName: bandName || '',
    contactName: contactName || '',
    contactPhone: contactPhone || '',
    email,
    focus: focus || '',
    locale: locale === 'en' ? 'en' : 'pt-PT',
    participants: participantsCount,
    paymentMethod: normalizedPaymentMethod,
    paymentStatus,
    roomTotal,
    extrasTotal,
    total,
    requestedAt: new Date().toISOString(),
  };

  bookings.unshift(booking);
  saveState();

  void sendBookingNotifications(booking, 'created');

  return res.status(201).json({ booking });
});

app.patch('/api/bookings/:id/confirm', (req, res) => {
  const actor = requireRole(req, res, ['admin', 'collaborator', 'technician']);
  if (!actor) {
    return;
  }

  const { collaboratorId } = req.body ?? {};
  const booking = bookings.find((item) => item.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  if (booking.status === 'rejected') {
    return res.status(400).json({ message: 'Rejected booking cannot be confirmed.' });
  }

  let assignedCollaborator = null;
  if (actor.role === 'admin' && collaboratorId) {
    assignedCollaborator =
      users.find((user) => user.id === collaboratorId && ['admin', 'collaborator', 'technician'].includes(user.role)) ?? null;
    if (!assignedCollaborator) {
      return res.status(400).json({ message: 'Assignable user not found.' });
    }
  }

  if (!assignedCollaborator && actor.role !== 'admin') {
    assignedCollaborator = actor;
  }

  booking.status = 'confirmed';
  booking.confirmedBy = {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    at: new Date().toISOString(),
  };

  if (assignedCollaborator) {
    booking.assignedCollaborator = {
      id: assignedCollaborator.id,
      name: assignedCollaborator.name,
    };
  }

  saveState();
  recordAuditAction({
    action: 'booking-confirmed',
    actor,
    target: booking.id,
    details: JSON.stringify({
      banda: booking.bandName || booking.contactName || '-',
      contacto: booking.contactName || '-',
      sala: booking.roomName,
      data: booking.date,
      confirmadoPor: actor.name,
      designado: assignedCollaborator ? assignedCollaborator.name : 'Nao designado',
    }),
  });

  void sendBookingNotifications(booking, 'confirmed');

  return res.json({ booking });
});

app.patch('/api/bookings/:id/reject', (req, res) => {
  const actor = requireRole(req, res, ['admin', 'collaborator', 'technician']);
  if (!actor) {
    return;
  }

  const booking = bookings.find((item) => item.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }

  booking.status = 'rejected';
  booking.rejectedBy = {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    at: new Date().toISOString(),
  };
  saveState();
  recordAuditAction({
    action: 'booking-rejected',
    actor,
    target: booking.id,
    details: JSON.stringify({
      banda: booking.bandName || booking.contactName || '-',
      contacto: booking.contactName || '-',
      sala: booking.roomName,
      data: booking.date,
      rejeitadoPor: actor.name,
    }),
  });
  return res.json({ booking });
});

// Serve the Vite production build
const DIST_PATH = path.join(__dirname, "../dist");

app.use(express.static(DIST_PATH));

// React SPA fallback (ignore API routes)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  res.sendFile(path.join(DIST_PATH, "index.html"));
});

app.listen(PORT, () => {
  console.log(`FeedBook running on port ${PORT}`);
});
