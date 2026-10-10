import cors from 'cors';
import express from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

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

// --- Configuração SMTP (servidor próprio; sem SMTP_PASS os emails são ignorados) ---
const SMTP_HOST = String(process.env.SMTP_HOST || 'mail.feedbackproductions.pt').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = String(process.env.SMTP_USER || 'ensaios@feedbackproductions.pt').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || 'Feedback - Ensaios <ensaios@feedbackproductions.pt>').trim();
// Porta 465 = SSL/TLS direto (secure); 587 = STARTTLS. Força sempre canal encriptado.
const SMTP_SECURE = String(process.env.SMTP_SECURE || (SMTP_PORT === 465 ? 'true' : 'false')).toLowerCase() === 'true';
const WHATSAPP_TWILIO_ACCOUNT_SID = String(process.env.WHATSAPP_TWILIO_ACCOUNT_SID || '').trim();
const WHATSAPP_TWILIO_AUTH_TOKEN = String(process.env.WHATSAPP_TWILIO_AUTH_TOKEN || '').trim();
const WHATSAPP_TWILIO_FROM = String(process.env.WHATSAPP_TWILIO_FROM || '').trim();

// Discord — alerta da equipa para novas marcações (canal #marcação-de-ensaios).
// Sem esta variável o alerta é ignorado e o resto do fluxo não é afetado.
const DISCORD_WEBHOOK_URL = String(process.env.DISCORD_WEBHOOK_URL || '').trim();

// Supabase — usado apenas na rota de convite (/api/user-invite).
// A service role key vive SOMENTE no servidor (nunca no bundle do browser).
// Local: as VITE_ do .env são usadas como fallback; produção define as
// variáveis sem prefixo no Vercel (Settings → Environment Variables).
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
// URL base da app para onde o link "define a password" redireciona.
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');

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
  return {
    color: 15548997,
    fields: [
      { inline: true, name: 'Utilizador', value: plainText(booking.contactName) },
      { inline: true, name: 'Banda', value: plainText(booking.bandName, plainText(booking.contactName)) },
      { inline: true, name: 'Data', value: plainText(formatDatePt(booking.date)) },
      { inline: true, name: 'Hora', value: plainText(booking.time) },
      { inline: true, name: 'Sala', value: plainText(booking.roomName) },
      { inline: true, name: 'Telefone do cliente', value: plainText(booking.contactPhone) },
    ],
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

async function sendWhatsApp(recipient, message) {
  if (!WHATSAPP_TWILIO_ACCOUNT_SID || !WHATSAPP_TWILIO_AUTH_TOKEN || !WHATSAPP_TWILIO_FROM) return;
  try {
    console.log(`[Simulação] Enviando WhatsApp para ${recipient}: ${message}`);
  } catch (e) {
    console.error('Erro ao enviar WhatsApp:', e);
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
    `<br><img src="https://feedbook-kappa.vercel.app/mailsign.png" width="108" height="42" style="width:108px;height:42px;display:block;border:0;" alt="Feedback Productions">` +
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
    } else if (status === 'pending') {
      subject = '📩 Reserva Recebida. Aguarda confirmação.';
      bodyHTML += `<p>Olá ${user}, recebemos o pedido de ensaio dos ${band}.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>`;
      bodyHTML += `<p>Iremos confirmar o mais rápido possível. Fica atento ao teu Email e WhatsApp!</p>`;
    }

    bodyHTML += emailSignature();
    await sendEmail(recipientEmail, subject, bodyHTML);
  }

  if (booking.contactPhone) {
    const message = `[Feedback - Ensaios] Seu ensaio foi ${status === 'confirmed' ? 'confirmado' : status === 'rejected' ? 'rejeitado' : 'cancelado'}!`;
    await sendWhatsApp(booking.contactPhone, message);
  }
}

// --- ROTAS ---

// POST /api/notify — chamado pelo front (src/api.ts) após cada ação
app.post('/api/notify', (req, res) => {
  const booking = req.body?.booking;
  const status = String(req.body?.status || '').trim();

  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Booking payload is required.' });
  }

  if (!['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid notification status.' });
  }

  void sendBookingNotifications(booking, status);
  return res.json({ message: 'Notification queued.' });
});

// POST /api/user-invite — chamado pelo front (src/api.ts) após criar um utilizador.
// Gera um link único "define a tua password" via Supabase Admin API (o Supabase
// NÃO envia email nenhum — só gera o link) e envia-o pelo nosso SMTP.
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

    const { data: profileRows } = await supabaseAuth
      .from('profiles')
      .select('role')
      .eq('id', actorData.user.id)
      .limit(1);
    const actorRole = String(profileRows?.[0]?.role || '');
    if (!['admin', 'superuser'].includes(actorRole)) {
      return res.status(403).json({ message: 'Only admins can send invites.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required.' });
    }

    const { data, error } = await supabaseService.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: APP_BASE_URL },
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

    const subject = '📩 A tua conta foi criada — define a tua password';
    let bodyHTML = '<h1 style="font-size: 24px;">Feedback - Ensaios — Conta criada</h1>';
    bodyHTML += `<p>Olá ${escapeHtml(name || email)},</p>`;
    bodyHTML += '<p>A tua conta foi criada na plataforma de marcações. Para entrares, define a tua password:</p>';
    bodyHTML += `<p style="margin:16px 0;"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:10px 20px;background-color:#222222;color:#ffffff !important;font-size:14px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;">🔑 Definir password</a></p>`;
    bodyHTML += '<p style="color:#999999;font-size:12px;">O link é único e expira dentro de 1 hora. Se não foste tu a criar esta conta, ignora este email.</p>';
    bodyHTML += emailSignature();

    // Disparo em segundo plano: a resposta nunca bloqueia no envio.
    void sendEmail(email, subject, bodyHTML);
    return res.status(202).json({ message: 'Invite queued.' });
  } catch (e) {
    console.error('Erro em /api/user-invite:', e);
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
