import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { generateIcs } from '../lib/generateIcs.js';

// ============================================================
// Feedback - Ensaios — POST /api/notify (Vercel Serverless)
// Chamado pelo front (src/api.ts) após cada ação de marcação.
// Usa o servidor SMTP próprio com canal encriptado (SSL/TLS).
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   SMTP_HOST (default mail.feedbackproductions.pt)
//   SMTP_PORT (default 465; lido de process.env.SMTP_PORT)
//   SMTP_USER (default ensaios@feedbackproductions.pt)
//   SMTP_PASS (obrigatória; lida de process.env.SMTP_PASS)
//   SMTP_FROM (default "Feedback - Ensaios <ensaios@feedbackproductions.pt>")
//   SMTP_SECURE (default segue a porta: 465 = SSL/TLS direto)
// ============================================================

const SMTP_HOST = String(process.env.SMTP_HOST || 'mail.feedbackproductions.pt').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = String(process.env.SMTP_USER || 'ensaios@feedbackproductions.pt').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || 'Feedback - Ensaios <ensaios@feedbackproductions.pt>').trim();
// Porta 465 = SSL/TLS direto (secure); 587 = STARTTLS. Força sempre canal encriptado.
const SMTP_SECURE = String(process.env.SMTP_SECURE || (SMTP_PORT === 465 ? 'true' : 'false')).toLowerCase() === 'true';

// Supabase — usado para ler as subscrições Web Push dos admins.
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// Web Push (VAPID) — usado para notificar os admins no browser.
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:ensaios@feedbackproductions.pt').trim();
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); } catch (e) { console.error('VAPID inválido:', e); }
}

function getTransport() {
  if (!SMTP_HOST || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: !SMTP_SECURE,
    tls: { minVersion: 'TLSv1.2' },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Data ISO (YYYY-MM-DD) -> Dia/Mês/Ano (DD/MM/YYYY); fallback ao valor original.
function formatDatePt(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(value || '').trim();
}

// Assinatura partilhada por todos os e-mails de marcação.
// Nota: SVG é removido pelo Gmail/Outlook, por isso usam-se botões de texto.
function emailSignature() {
  const btnStyle = 'display:inline-block;margin:0 8px 8px 0;padding:8px 16px;background-color:#222222;color:#ffffff !important;font-size:13px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;';
  return (
    `<br><img src="https://www.ensaiosfeedback.pt/mailsign.png" width="108" height="42" style="width:108px;height:42px;display:block;border:0;" alt="Feedback Productions">` +
    `<p style="color:#555555;font-size:14px;line-height:1.5;margin:12px 0 0 0;">` +
    `Feedback Productions<br>` +
    `Estúdios de Ensaio &amp; Produção Musical<br>` +
    `📍 Parque de Exposições Acácio Dores — Montijo, Portugal<br>` +
    `📞 91 817 62 67 / 93 232 1079 / 91 651 58 02` +
    `</p>` +
    `<p style="margin:12px 0 0 0;line-height:1;">` +
    `<a href="https://feedbackproductions.pt/" style="${btnStyle}">🌐 Site</a>` +
    `<a href="https://www.instagram.com/feedbackproductions/" style="${btnStyle}">📸 Instagram</a>` +
    `<a href="https://www.youtube.com/@FEEDBACKPRODUCTIONS" style="${btnStyle}">🎥 YouTube</a>` +
    `</p>` +
    `<p style="color:#999999;font-size:11px;line-height:1.5;margin:12px 0 0 0;">` +
    `Este é um e-mail automático enviado a partir do sistema de marcações. Por favor, não responda diretamente para este endereço.` +
    `</p>`
  );
}

function plainText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function buildCalendarLinks(booking) {
  const durationHours = Number(booking.duration) || 1;
  const start = new Date(`${booking.date}T${booking.time}:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const toIso = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = encodeURIComponent(`Ensaio — ${booking.bandName || booking.contactName} (${booking.roomName})`);
  const details = encodeURIComponent(`Ensaio: ${booking.bandName || booking.contactName}\nSala: ${booking.roomName}\nData: ${formatDatePt(booking.date)}\nHora: ${booking.time}`);
  const location = encodeURIComponent(`${booking.roomName}, Parque de Exposições Acácio Dores — Montijo, Portugal`);
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${toIso(start)}/${toIso(end)}&details=${details}&location=${location}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${text}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${details}&location=${location}`;
  return { google, outlook };
}
function buildMessage(booking, status) {
  const head = '<h1 style="font-size: 24px;">Feedback - Ensaios Status da Reserva</h1>';
  const user = escapeHtml(booking.contactName);
  const band = escapeHtml(booking.bandName || booking.contactName);
  const date = escapeHtml(formatDatePt(booking.date));
  const time = escapeHtml(booking.time);
  const room = escapeHtml(booking.roomName);
  const confirmerName = escapeHtml(booking.confirmedBy?.name || '');
  const confirmerPhone = escapeHtml(booking.confirmedBy?.phone || '');
  const confirmerLine = [confirmerName, confirmerPhone].filter(Boolean).join(' — ');
  const signature = emailSignature();
  if (status === 'confirmed') {
    return {
      subject: '✅ Reserva Confirmada! Seu ensaio está agendado.',
      html:
        head +
        `<p>Olá ${user}, o seu ensaio foi confirmado.</p>` +
        `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>` +
        (confirmerLine ? `<p>Confirmado por: ${confirmerLine}</p>` : '') +
        `<p><a href="${'${'}buildCalendarLinks(booking).google${'}'}">Adicionar ao Google Calendar</a> | <a href="${'${'}buildCalendarLinks(booking).outlook${'}'}">Adicionar ao Outlook</a></p>` +
        signature,
    };
  }
  if (status === 'rejected') {
    return {
      subject: '❌ Reserva Rejeitada.',
      html:
        head +
        `<p>Olá ${user}, a sua reserva foi rejeitada pela equipa.</p>` +
        `<p>Por favor, entre em contacto connosco para reagendar.</p>` +
        signature,
    };
  }
  if (status === 'cancelled') {
    return {
      subject: '⚠️ Reserva Cancelada.',
      html:
        head +
        `<p>Olá ${user}, o seu ensaio foi desmarcado pela equipa de administração.</p>` +
        signature,
    };
  }
  if (status === 'rescheduled') {
    return {
      subject: '🔄 Reserva Reagendada.',
      html:
        head +
        `<p>Olá ${user}, o seu ensaio foi reagendado.</p>` +
        `<p>Novos detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>` +
        `<p><a href="${'${'}buildCalendarLinks(booking).google${'}'}">Adicionar ao Google Calendar</a> | <a href="${'${'}buildCalendarLinks(booking).outlook${'}'}">Adicionar ao Outlook</a></p>` +
        signature,
    };
  }
  if (status === 'pending') {
    return {
      subject: '📩 Reserva Recebida. Aguarda confirmação.',
      html:
        head +
        `<p>Olá ${user}, recebemos o pedido de ensaio dos ${band}.</p>` +
        `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>` +
        `<p>Iremos confirmar o mais rápido possível. Fica atento ao teu Email e WhatsApp!</p>` +
        signature,
    };
  }
  return null;
}

// Notificação Web Push para os admins (em segundo plano; nunca bloqueia a resposta).
async function sendPushAlert(booking) {
  if (!supabaseService || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const { data: settings, error: settingsError } = await supabaseService
      .from('app_settings')
      .select('betaEnabled')
      .eq('id', true)
      .maybeSingle();
    if (settingsError) return;

    let subscriptionsQuery = supabaseService
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth');

    let recipientProfiles = [];

    if (settings?.betaEnabled !== false) {
      const { data: developers, error: developersError } = await supabaseService
        .from('profiles')
        .select('id, name, email')
        .eq('isDeveloper', true);
      if (developersError || !Array.isArray(developers) || developers.length === 0) return;
      recipientProfiles = developers;
      subscriptionsQuery = subscriptionsQuery.in('user_id', developers.map((profile) => profile.id));
    }

    const { data: rows, error } = await subscriptionsQuery;
    if (error || !Array.isArray(rows)) return;

    if (settings?.betaEnabled === false && rows.length > 0) {
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
      const { data: profiles, error: profilesError } = await supabaseService
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);
      if (!profilesError && Array.isArray(profiles)) recipientProfiles = profiles;
    }

    const profilesById = new Map(recipientProfiles.map((profile) => [profile.id, profile]));

    const title = '🚨 Novo Pedido de Marcação!';
    const body = [
      plainText(booking.contactName),
      plainText(booking.bandName || booking.contactName),
      `${plainText(formatDatePt(booking.date))} ${plainText(booking.time)}`,
      plainText(booking.roomName),
    ].filter(Boolean).join(' · ');
    const payload = JSON.stringify({ title, body, url: '/admin' });

    const results = await Promise.all(rows.map(async (row) => {
      const profile = profilesById.get(row.user_id);
      const recipient = {
        userId: row.user_id,
        name: profile?.name || 'Utilizador sem nome',
        email: profile?.email || 'Email indisponível',
      };
      const subscription = {
        endpoint: String(row.endpoint || '').trim(),
        keys: { p256dh: String(row.p256dh || '').trim(), auth: String(row.auth || '').trim() },
      };
      if (!subscription.endpoint || !subscription.keys.p256dh || !subscription.keys.auth) {
        return { ...recipient, status: 'subscrição inválida' };
      }
      try {
        await webpush.sendNotification(subscription, payload);
        return { ...recipient, status: 'enviado' };
      } catch (e) {
        const status = Number(e?.statusCode || 0);
        if (status === 404 || status === 410) {
          try { await supabaseService.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint); } catch {}
          return { ...recipient, status: 'subscrição expirada removida' };
        } else {
          console.error('Erro ao enviar Web Push:', e?.message || e);
          return { ...recipient, status: `falhou${status ? ` (${status})` : ''}` };
        }
      }
    }));

    console.info('Web Push — resumo do envio:', {
      betaEnabled: settings?.betaEnabled !== false,
      bookingId: booking.id || null,
      recipients: results,
    });
  } catch (e) {
    console.error('Erro ao preparar Web Push:', e);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  const booking = req.body?.booking;
  const status = String(req.body?.status || '').trim();

  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Booking payload is required.' });
  }
  if (!['pending', 'confirmed', 'rejected', 'cancelled', 'rescheduled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid notification status.' });
  }

  const transport = getTransport();

  if (status === 'pending') {
    void sendPushAlert(booking);
  }

  if (!transport) {
    console.warn('SMTP desativado: falta SMTP_PASS nas variáveis de ambiente.');
    return res.json({ message: 'Email disabled (missing SMTP_PASS).' });
  }

  const durationHours = Number(booking.duration) || 1;
  const start = new Date(`${booking.date}T${booking.time}:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

  const method = status === 'cancelled' ? 'CANCEL' : 'REQUEST';
  const icsStatus = status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';
  const sequence = status === 'cancelled' ? 1 : 0;

  const icsContent = generateIcs({
    uid: `booking-${booking.id || booking.date + booking.time}@ensaiosfeedback.pt`,
    summary: `Ensaio — ${booking.bandName || booking.contactName} (${booking.roomName})`,
    description: [
      `Ensaio: ${booking.bandName || booking.contactName}`,
      `Sala: ${booking.roomName}`,
      `Data: ${formatDatePt(booking.date)}`,
      `Hora: ${booking.time} (${durationHours}h)`,
      booking.contactName ? `Contacto: ${booking.contactName}` : '',
      booking.contactPhone ? `Telefone: ${booking.contactPhone}` : '',
      booking.confirmedBy?.name ? `Confirmado por: ${booking.confirmedBy.name}${booking.confirmedBy.phone ? ' — ' + booking.confirmedBy.phone : ''}` : '',
    ].filter(Boolean).join('\n'),
    location: `${booking.roomName}, Parque de Exposições Acácio Dores — Montijo, Portugal`,
    start,
    end,
    organizerEmail: SMTP_USER,
    attendeeEmail: booking.email,
  }, { method, status: icsStatus, sequence, reminders: [{ minutes: 24 * 60 }, { minutes: 60 }] });

  const message = buildMessage(booking, status);
  if (!booking.email || !message) {
    return res.json({ message: 'Nothing to send.' });
  }

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: booking.email,
      subject: message.subject,
      html: message.html,
      attachments: icsContent
        ? [{ filename: 'ensaio.ics', content: icsContent, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }]
        : undefined,
    });
    console.log(`Email sent to ${booking.email}`);
    return res.json({ message: 'Notification sent.' });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e);
    return res.status(502).json({ message: 'Failed to send email.' });
  }
}
