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

// --- Configuração SMTP (opcional; sem config, os emails são ignorados) ---
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || 'Feedback - Ensaios <no-reply@feedbook.local>').trim();
const WHATSAPP_TWILIO_ACCOUNT_SID = String(process.env.WHATSAPP_TWILIO_ACCOUNT_SID || '').trim();
const WHATSAPP_TWILIO_AUTH_TOKEN = String(process.env.WHATSAPP_TWILIO_AUTH_TOKEN || '').trim();
const WHATSAPP_TWILIO_FROM = String(process.env.WHATSAPP_TWILIO_FROM || '').trim();

const emailTransport = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
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

async function sendBookingNotifications(booking, status) {
  const recipientEmail = booking.email;

  if (recipientEmail && emailTransport) {
    let subject = '';
    let bodyHTML = `<h1 style="font-size: 24px;">Feedback - Ensaios Booking Status</h1>`;

    if (status === 'confirmed') {
      subject = '✅ Reserva Confirmada! Seu ensaio está agendado.';
      bodyHTML += `<p>Olá ${booking.contactName}, o seu ensaio foi confirmado.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${booking.date} | Hora: ${booking.time} | Sala: ${booking.roomName}</p>`;
    } else if (status === 'rejected') {
      subject = '❌ Reserva Rejeitada.';
      bodyHTML += `<p>Olá ${booking.contactName}, a sua reserva foi rejeitada pela equipa.</p>`;
      bodyHTML += `<p>Por favor, entre em contacto connosco para reagendar.</p>`;
    } else if (status === 'cancelled') {
      subject = '⚠️ Reserva Cancelada.';
      bodyHTML += `<p>Olá ${booking.contactName}, o seu ensaio foi cancelado pela equipa de administração.</p>`;
    } else if (status === 'pending') {
      subject = '📩 Reserva Recebida. Aguarda confirmação.';
      bodyHTML += `<p>Olá ${booking.contactName}, recebemos o pedido de ensaio.</p>`;
      bodyHTML += `<p>Detalhes: Data: ${booking.date} | Hora: ${booking.time} | Sala: ${booking.roomName}</p>`;
      bodyHTML += `<p>Iremos confirmar o mais rápido possível.</p>`;
    }

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
});
