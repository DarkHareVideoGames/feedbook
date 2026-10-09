import cors from 'cors';
import express from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const recipientEmail = booking.email;

  if (recipientEmail && emailTransport) {
    let subject = '';
    let bodyHTML = `<h1 style="font-size: 24px;">Feedback - Ensaios Status da Reserva</h1>`;
    const user = escapeHtml(booking.contactName);
    const band = escapeHtml(booking.bandName || booking.contactName);
    const date = escapeHtml(formatDatePt(booking.date));
    const time = escapeHtml(booking.time);
    const room = escapeHtml(booking.roomName);

    if (status === 'confirmed') {
      subject = '✅ Reserva Confirmada! Seu ensaio está agendado.';
      bodyHTML += `<p>Olá ${user}, o seu ensaio foi confirmado.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>`;
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
