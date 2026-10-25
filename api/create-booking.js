import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// POST /api/create-booking — criação pública segura de marcações.
// A service role é usada exclusivamente neste processo Node; nunca deve usar
// um nome de variável VITE_, pois essas variáveis são incluídas no browser.
const MAX_REHEARSAL_HOURS = 6;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimits = new Map();

function getSupabaseService() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateLimits.get(ip) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimits.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimits.set(ip, recent);
  return false;
}

function text(value, maxLength = 0) {
  const normalized = String(value ?? '').trim();
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
}

function validTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match) && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function calculateRoomPrice(hours, basePrice) {
  if (hours === 1) return basePrice;
  if (hours === 2) return basePrice * 2;
  let total = basePrice * 2;
  for (let hour = 3; hour <= hours; hour += 1) total += Math.max(0, basePrice - (hour - 2));
  return total;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed.' });
  const supabaseService = getSupabaseService();
  if (!supabaseService) return res.status(503).json({ message: 'Marcacoes indisponiveis: falta SUPABASE_SERVICE_ROLE_KEY.' });
  if (isRateLimited(clientIp(req))) return res.status(429).json({ message: 'Demasiados pedidos. Tenta novamente dentro de alguns minutos.' });

  try {
    const body = req.body || {};
    // Campo invisível opcional para bloquear submissões automatizadas simples.
    if (text(body.website, 200)) return res.status(400).json({ message: 'Pedido invalido.' });

    const roomId = text(body.roomId, 100);
    const date = text(body.date, 10);
    const time = text(body.time, 5);
    const duration = Number(body.duration);
    const contactName = text(body.contactName, 120);
    const contactPhone = text(body.contactPhone, 40) || null;
    const email = text(body.email, 254).toLowerCase();
    const bandName = text(body.bandName, 120) || contactName;
    const customerMessage = text(body.customerMessage, 2000) || null;
    const paymentMethod = text(body.paymentMethod, 40) || 'on-site';
    const requestedExtras = Array.isArray(body.extras)
      ? [...new Set(body.extras.map((item) => text(item, 100)).filter(Boolean))]
      : [];
    const today = new Date();
    const todayIso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');

    if (!roomId || !contactName || !contactPhone || !email || !validDate(date) || date < todayIso || !validTime(time)
      || !Number.isInteger(duration) || duration < 1 || duration > MAX_REHEARSAL_HOURS) {
      return res.status(400).json({ message: 'Dados de marcacao invalidos.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Indica um email valido.' });
    }
    if (!['on-site', 'mbway'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Metodo de pagamento invalido.' });
    }

    const [{ data: room, error: roomError }, { data: serviceRows, error: servicesError }] = await Promise.all([
      supabaseService.from('rooms').select('id, name, active, bookingMode, pricePerMemberHour').eq('id', roomId).maybeSingle(),
      supabaseService.from('services').select('id, price').eq('active', true),
    ]);
    if (roomError || !room || room.active === false || room.bookingMode !== 'booking') {
      return res.status(400).json({ message: 'Esta sala nao esta disponivel para marcacao direta.' });
    }
    if (servicesError) {
      console.error('Erro ao carregar servicos ativos:', servicesError);
      return res.status(503).json({ message: 'Nao foi possivel validar os servicos selecionados.' });
    }

    const servicesById = new Map((serviceRows || []).map((service) => [String(service.id), Number(service.price || 0)]));
    if (requestedExtras.some((extra) => !servicesById.has(extra))) {
      return res.status(400).json({ message: 'Um ou mais servicos selecionados ja nao estao disponiveis.' });
    }

    const roomPricePerHour = Number(room.pricePerMemberHour);
    const basePrice = Number.isFinite(roomPricePerHour) && roomPricePerHour > 0 ? roomPricePerHour : 7;
    const amount = Number((calculateRoomPrice(duration, basePrice)
      + requestedExtras.reduce((sum, extra) => sum + Number(servicesById.get(extra) || 0), 0)).toFixed(2));
    const createdAt = new Date().toISOString();
    const booking = {
      id: randomUUID(), roomId, roomName: text(room.name, 160), status: 'pending', date, time, duration,
      bandName, contactName, contactPhone, email, customerMessage, paymentMethod, paymentStatus: 'pending', amount,
      extras: requestedExtras, createdAt,
    };

    const { data, error } = await supabaseService.from('bookings').insert(booking).select().single();
    if (error) {
      const message = String(error.message || '');
      if (/hor.rio indispon.vel|intervalo|conflict/i.test(message)) {
        return res.status(409).json({ message: 'Horario indisponivel para esta sala.' });
      }
      console.error('Erro ao criar marcacao publica:', error);
      return res.status(500).json({ message: 'Nao foi possivel concluir a marcacao.' });
    }

    const audit = await supabaseService.from('audit_logs').insert({
      id: `AUDIT-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      action: 'booking-created', actor: { id: 'CLIENT_USER', name: contactName, role: 'client' }, target: booking.id,
      details: JSON.stringify({ banda: bandName, contacto: contactName, sala: booking.roomName, data }), createdAt,
    });
    if (audit.error) console.error('Falha ao registar auditoria da marcacao:', audit.error);

    return res.status(201).json({ booking: data });
  } catch (error) {
    console.error('Erro inesperado em /api/create-booking:', error);
    return res.status(500).json({ message: 'Nao foi possivel concluir a marcacao.' });
  }
}