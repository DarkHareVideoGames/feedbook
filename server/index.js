import cors from 'cors';
import express from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { fileURLToPath } from 'url';
import createBookingHandler from '../api/create-booking.js';

// Carrega as variáveis do ficheiro .env (raiz do projeto) para process.env.
// Necessário para que SMTP_* e DISCORD_WEBHOOK_URL funcionem em desenvolvimento.
// No Vercel/produção estas vêm das Environment Variables e este passo é inofensivo.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // .env ausente: seguimos apenas com as variáveis do ambiente (ex.: Vercel).
}

// ============================================================
// Feedback - Ensaios — servidor de notificações (emails)
// Desde a migração para o Supabase, autenticação, marcações,
// preçário e auditoria vivem no Supabase; este processo fica
// apenas com o envio de e-mails (SMTP) e em servir o build.
// ============================================================

const app = express();
const PORT = Number(process.env.PORT || 4000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Refactoring CORS Origin Definition for maximum compatibility
const allowedOriginsList = ['http://localhost:5173', 'http://localhost:5174'];

if (process.env.CLIENT_ORIGINS) {
    const dynamicOrigins = String(process.env.CLIENT_ORIGINS).split(',');
    dynamicOrigins.forEach((origin) => allowedOriginsList.push(origin.trim()));
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOriginsList.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());

// Espelha a função Vercel para que a criação pública segura de marcações
// também funcione com `npm run dev:api`.
app.post('/api/create-booking', createBookingHandler);

// --- Configuração SMTP (servidor próprio; sem SMTP_PASS os emails são ignorados) ---
const SMTP_HOST = String(process.env.SMTP_HOST || 'mail.feedbackproductions.pt').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = String(process.env.SMTP_USER || 'ensaios@feedbackproductions.pt').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || 'Feedback - Ensaios <ensaios@feedbackproductions.pt>').trim();
// Porta 465 = SSL/TLS direto (secure); 587 = STARTTLS. Força sempre canal encriptado.
const SMTP_SECURE = String(process.env.SMTP_SECURE || (SMTP_PORT === 465 ? 'true' : 'false')).toLowerCase() === 'true';

// Discord — alerta da equipa para novas marcações (canal #marcação-de-ensaios).
// Sem esta variável o alerta é ignorado e o resto do fluxo não é afetado.
const DISCORD_WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || '').trim();

// Web Push (VAPID) — usado para notificar os admins no browser.
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:ensaios@feedbackproductions.pt').trim();
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); } catch (e) { console.error('VAPID inválido:', e); }
}

// Supabase — usado apenas na rota de convite (/api/user-invite).
// A service role key vive SOMENTE no servidor (nunca no bundle do browser).
// Local: as VITE_ do .env são usadas como fallback; produção define as
// variáveis sem prefixo no Vercel (Settings → Environment Variables).
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
// URL base da app para onde o link "define a password" redireciona.
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://www.ensaiosfeedback.pt').trim().replace(/\/+$/, '');

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function plainText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

// Embed Discord para novas marcações pendentes (canal #marcação-de-ensaios).
function buildDiscordEmbed(booking) {
  // Link direto para a página de gestão (sempre em produção — é um alerta para a equipa).
  const ADMIN_URL = 'https://www.ensaiosfeedback.pt/admin';
  // Layout compacto na description (markdown) em vez de campos inline:
  // no telemóvel os campos inline empilham-se um por linha e alongam o card,
  // enquanto a description flui o texto e mantém-se curta.
  const description = [
    `**👉 [GERIR RESERVA!](${ADMIN_URL})**`,
    `👤 ${plainText(booking.contactName)} · 🎸 ${plainText(booking.bandName, plainText(booking.contactName))}`,
    `📅 ${plainText(formatDatePt(booking.date))} · 🕐 ${plainText(booking.time)}`,
    `🚪 ${plainText(booking.roomName)} · 📞 ${plainText(booking.contactPhone)}`,
  ].join('\n');
  return {
    color: 15548997,
    url: ADMIN_URL,
    description,
    timestamp: new Date().toISOString(),
    title: '🚨 Novo Pedido de Marcação!',
  };
}

// Disparo em segundo plano: nunca bloqueia nem falha a resposta principal.
async function sendDiscordAlert(booking) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      body: JSON.stringify({ embeds: [buildDiscordEmbed(booking)] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch (e) {
    console.error('Erro ao enviar alerta Discord:', e);
  }
}

async function sendPushAlert(booking) {
  if (!supabaseService || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const { data: rows, error } = await supabaseService
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth');
    if (error || !Array.isArray(rows)) return;

    const title = '🚨 Novo Pedido de Marcação!';
    const body = [
      plainText(booking.contactName),
      plainText(booking.bandName || booking.contactName),
      `${plainText(formatDatePt(booking.date))} ${plainText(booking.time)}`,
      plainText(booking.roomName),
    ].filter(Boolean).join(' · ');
    const payload = JSON.stringify({ title, body, url: '/admin' });

    await Promise.allSettled(rows.map(async (row) => {
      const subscription = {
        endpoint: String(row.endpoint || '').trim(),
        keys: { p256dh: String(row.p256dh || '').trim(), auth: String(row.auth || '').trim() },
      };
      if (!subscription.endpoint || !subscription.keys.p256dh || !subscription.keys.auth) return;
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (e) {
        const status = Number(e?.statusCode || 0);
        if (status === 404 || status === 410) {
          try { await supabaseService.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint); } catch {}
        } else {
          console.error('Erro ao enviar Web Push:', e?.message || e);
        }
      }
    }));
  } catch (e) {
    console.error('Erro ao preparar Web Push:', e);
  }
}

const emailTransport = SMTP_HOST && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Garante canal encriptado: SSL/TLS direto (465) ou STARTTLS (587).
      requireTLS: !SMTP_SECURE,
      tls: { minVersion: 'TLSv1.2' },
    })
  : null;

async function sendEmail(to, subject, htmlContent) {
  if (!emailTransport) return;
  try {
    await emailTransport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`Email sent to ${to}`);
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e);
  }
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

async function sendBookingNotifications(booking, status) {
  // Alerta Discord em segundo plano para novas marcações (não bloqueia a resposta).
  if (status === 'pending') {
    void sendDiscordAlert(booking);
    void sendPushAlert(booking);
  }

  const recipientEmail = booking.email;

  if (recipientEmail && emailTransport) {
    let subject = '';
    let bodyHTML = `<h1 style="font-size: 24px;">Feedback - Ensaios Status da Reserva</h1>`;
    const user = escapeHtml(booking.contactName);
    const band = escapeHtml(booking.bandName || booking.contactName);
    const date = escapeHtml(formatDatePt(booking.date));
    const time = escapeHtml(booking.time);
    const room = escapeHtml(booking.roomName);
    const confirmerName = escapeHtml(booking.confirmedBy && booking.confirmedBy.name ? booking.confirmedBy.name : '');
    const confirmerPhone = escapeHtml(booking.confirmedBy && booking.confirmedBy.phone ? booking.confirmedBy.phone : '');
    const confirmerLine = [confirmerName, confirmerPhone].filter(Boolean).join(' — ');

    if (status === 'confirmed') {
      subject = '✅ Reserva Confirmada! Seu ensaio está agendado.';
      bodyHTML += `<p>Olá ${user}, o seu ensaio foi confirmado.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>`;
      if (confirmerLine) bodyHTML += `<p>Confirmado por: ${confirmerLine}</p>`;
    } else if (status === 'rejected') {
      subject = '❌ Reserva Rejeitada.';
      bodyHTML += `<p>Olá ${user}, a sua reserva foi rejeitada pela equipa.</p>`;
      bodyHTML += `<p>Por favor, entre em contacto connosco para reagendar.</p>`;
    } else if (status === 'cancelled') {
      subject = '⚠️ Reserva Cancelada.';
      bodyHTML += `<p>Olá ${user}, o seu ensaio foi cancelado pela equipa de administração.</p>`;
    } else if (status === 'rescheduled') {
      subject = '🔄 Reserva Reagendada.';
      bodyHTML += `<p>Olá ${user}, o seu ensaio foi reagendado.</p>`;
      bodyHTML += `<p>Novos detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>`;
    } else if (status === 'pending') {
      subject = '📩 Reserva Recebida. Aguarda confirmação.';
      bodyHTML += `<p>Olá ${user}, recebemos o pedido de ensaio dos ${band}.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>`;
      bodyHTML += `<p>Iremos confirmar o mais rápido possível. Fica atento ao teu Email e WhatsApp!</p>`;
    }

    bodyHTML += emailSignature();
    await sendEmail(recipientEmail, subject, bodyHTML);
  }

}

// --- ROTAS ---

// Envia e-mail ao utilizador e alerta Discord para pedidos de contacto.
async function sendContactRequestNotification(contactRequest) {
  const recipientEmail = String(contactRequest.email || '').trim().toLowerCase();
  if (recipientEmail && emailTransport) {
    let subject = '📩 Recebemos o teu pedido de contacto';
    let bodyHTML = '<h1 style="font-size: 24px;">Feedback - Ensaios — Novo Pedido de Contacto</h1>';
    bodyHTML += `<p>Olá ${escapeHtml(contactRequest.contactName)},</p>`;
    bodyHTML += `<p>Recebemos o teu pedido de contacto para a sala ${escapeHtml(contactRequest.roomName)}. A nossa equipa irá contactar-te em breve.</p>`;
    if (contactRequest.contactPhone) bodyHTML += `<p>📞 ${escapeHtml(contactRequest.contactPhone)}</p>`;
    if (contactRequest.email) bodyHTML += `<p>✉️ ${escapeHtml(contactRequest.email)}</p>`;
    if (contactRequest.message) bodyHTML += `<p>💬 ${escapeHtml(contactRequest.message)}</p>`;
    bodyHTML += emailSignature();
    await sendEmail(recipientEmail, subject, bodyHTML);
  }

  if (DISCORD_WEBHOOK_URL) {
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: '📩 Novo Pedido de Contacto',
              description: `Sala: ${contactRequest.roomName}\nNome: ${contactRequest.contactName}\nTel: ${contactRequest.contactPhone}\nEmail: ${contactRequest.email}\nMensagem: ${contactRequest.message || '—'}`,
              color: 3447003,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (e) {
      console.error('Erro ao enviar alerta Discord:', e);
    }
  }
}

// POST /api/contact-request — cria pedido de contacto e envia e-mail ao utilizador.
app.post('/api/contact-request', async (req, res) => {
  try {
    const body = req.body || {};
    if (!supabaseService) {
      return res.status(503).json({ message: 'Supabase nao configurado no servidor.' });
    }
    const roomId = String(body.roomId || '').trim();
    const contactName = String(body.contactName || '').trim();
    const contactPhone = String(body.contactPhone || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const bandName = String(body.bandName || '').trim() || null;
    const message = String(body.message || '').trim() || null;

    if (!roomId || !contactName || !contactPhone || !email) {
      return res.status(400).json({ message: 'Missing required contact request fields.' });
    }

    const { data: room, error: roomError } = await supabaseService
      .from('rooms')
      .select('id, name, active, bookingMode')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError || !room || room.active === false || room.bookingMode !== 'contact') {
      return res.status(400).json({ message: 'This room is not available for contact requests.' });
    }

    const createdAt = new Date().toISOString();
    const contactRequest = {
      id: randomUUID(),
      roomId,
      roomName: String(room.name ?? ''),
      contactName,
      contactPhone,
      email,
      bandName,
      message,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    };

    const { error } = await supabaseService.from('contact_requests').insert(contactRequest);
    if (error) {
      return res.status(500).json({ message: 'Nao foi possivel enviar o pedido de contacto.' });
    }

    void sendContactRequestNotification(contactRequest);
    return res.status(201).json({ contactRequest });
  } catch (e) {
    console.error('Erro ao criar pedido de contacto:', e);
    return res.status(500).json({ message: 'Nao foi possivel enviar o pedido de contacto.' });
  }
});

// POST /api/notify — chamado pelo front (src/api.ts) após cada ação
app.post('/api/notify', (req, res) => {
  const booking = req.body?.booking;
  const status = String(req.body?.status || '').trim();

  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Booking payload is required.' });
  }

  if (!['pending', 'confirmed', 'rejected', 'cancelled', 'rescheduled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid notification status.' });
  }

  void sendBookingNotifications(booking, status);
  return res.json({ message: 'Notification queued.' });
});

// POST /api/user-invite — chamado pelo front (src/api.ts) após criar um utilizador.
// Gera um link único "define a tua password" via Supabase Admin API (o Supabase
// NÃO envia email nenhum — só gera o link) e envia-o pelo nosso SMTP.
// Body: { email, name?, mode? } — mode 'reset' = reenvio de link de redefinição
// (Issue #9), reservado APENAS ao superuser; default 'invite' (admin|superuser).
app.post('/api/user-invite', async (req, res) => {
  try {
    if (!supabaseAuth || !supabaseService) {
      return res.status(503).json({ message: 'Convite indisponivel: falta SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_URL/anon key).' });
    }

    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ message: 'Missing session token.' });
    }

    const { data: actorData, error: actorError } = await supabaseAuth.auth.getUser(token);
    if (actorError || !actorData?.user) {
      return res.status(401).json({ message: 'Invalid session token.' });
    }

    // Usa a service role key para ler o perfil (bypassa RLS; a anon key
    // nao teria permissao para ler perfis de outros utilizadores).
    const { data: profileRows } = await supabaseService
      .from('profiles')
      .select('role')
      .eq('id', actorData.user.id)
      .limit(1);
    const actorRole = String(profileRows?.[0]?.role || '');
    // mode 'reset' (Issue #9): reenvio de link de redefinição — APENAS superuser.
    const mode = String(req.body?.mode || 'invite') === 'reset' ? 'reset' : 'invite';
    const allowedRoles = mode === 'reset' ? ['superuser'] : ['admin', 'superuser'];
    if (!allowedRoles.includes(actorRole)) {
      return res.status(403).json({ message: mode === 'reset' ? 'Only the superuser can resend reset links.' : 'Only admins can send invites.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required.' });
    }

    const { data, error } = await supabaseService.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${APP_BASE_URL}/admin` },
    });
    const inviteUrl = String(data?.properties?.action_link || '');
    if (error || !inviteUrl) {
      const message = String(error?.message || '');
      if (/not found/i.test(message)) {
        return res.status(404).json({ message: 'User not found.' });
      }
      console.error('Erro ao gerar link de convite:', error);
      return res.status(502).json({ message: 'Could not generate invite link.' });
    }

    const isReset = mode === 'reset';
    const subject = isReset ? '🔐 Link para redefinir a tua password' : '📩 A tua conta foi criada — define a tua password';
    let bodyHTML = isReset
      ? '<h1 style="font-size: 24px;">Feedback - Ensaios — Redefinir password</h1>'
      : '<h1 style="font-size: 24px;">Feedback - Ensaios — Conta criada</h1>';
    bodyHTML += `<p>Olá ${escapeHtml(name || email)},</p>`;
    if (isReset) {
      bodyHTML += '<p>Foi pedido o reenvio do link para redefinir a tua password na plataforma de marcações:</p>';
      bodyHTML += `<p style="margin:16px 0;"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:10px 20px;background-color:#222222;color:#ffffff !important;font-size:14px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;">🔑 Redefinir password</a></p>`;
      bodyHTML += '<p style="color:#999999;font-size:12px;">O link é único e expira dentro de 1 hora. Se não foste tu a pedir este reenvio, ignora este email.</p>';
    } else {
      bodyHTML += '<p>A tua conta foi criada na plataforma de marcações. Para entrares, define a tua password:</p>';
      bodyHTML += `<p style="margin:16px 0;"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:10px 20px;background-color:#222222;color:#ffffff !important;font-size:14px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;">🔑 Definir password</a></p>`;
      bodyHTML += '<p style="color:#999999;font-size:12px;">O link é único e expira dentro de 1 hora. Se não foste tu a criar esta conta, ignora este email.</p>';
    }
    bodyHTML += emailSignature();

    // Disparo em segundo plano: a resposta nunca bloqueia no envio.
    void sendEmail(email, subject, bodyHTML);
    return res.status(202).json({ message: isReset ? 'Reset link queued.' : 'Invite queued.' });
  } catch (e) {
    console.error('Erro em /api/user-invite:', e);
    return res.status(500).json({ message: 'Unexpected error.' });
  }
});

// --- Web Push (diagnóstico/configuração Admin) ---
app.get('/api/push/config', (req, res) => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  if (!publicKey) return res.status(503).json({ message: 'VAPID public key not configured.', publicKey: '' });
  return res.status(200).json({ publicKey });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const authHeader = String(req.headers?.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token || !supabaseAuth || !supabaseService) return res.status(401).json({ message: 'Missing auth or Supabase config.' });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    const userId = String(req.body?.userId || '').trim();
    if (userError || !userData?.user || userData.user.id !== userId) {
      return res.status(401).json({ message: 'Invalid or expired session.' });
    }

    const subscription = req.body?.subscription || {};
    const endpoint = String(subscription.endpoint || '').trim();
    const keys = subscription.keys || {};
    const p256dh = String(keys.p256dh || '').trim();
    const auth = String(keys.auth || '').trim();
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ message: 'Invalid subscription payload.' });
    }

    const { error } = await supabaseService
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: String(req.headers?.['user-agent'] || ''),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('push_subscriptions upsert error:', error);
      return res.status(500).json({ message: 'Could not save subscription.' });
    }
    return res.status(200).json({ message: 'Subscription saved.' });
  } catch (e) {
    console.error('Erro em /api/push/subscribe:', e);
    return res.status(500).json({ message: 'Unexpected error.' });
  }
});

// --- SERVE APP BUILD (Frontend) ---
const DIST_PATH = path.join(__dirname, '../dist');
app.use(express.static(DIST_PATH));

// React SPA fallback (ignore API routes)
app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(PORT, () => {
  console.log(`Feedback - Ensaios notifications running on port ${PORT}`);
  console.log(`SMTP: ${SMTP_HOST}:${SMTP_PORT} secure=${SMTP_SECURE} user=${SMTP_USER} ${emailTransport ? 'ativo' : 'DESATIVADO (falta SMTP_PASS)'}`);
});
