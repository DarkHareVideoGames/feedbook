// FeedBook — Notificações por email/WhatsApp (Versao Vercel Function)
//
// Substitui o server/index.js (Express, processo persistente) para que o
// deploy no Vercel nao precise de uma aplicacao node em execucao.
// O comportamento e identico: email via SMTP, WhatsApp via Twilio (simulado),
// e a marcacao fica registada mesmo se o servidor de email nao estiver a correr.
//
// Variaveis de ambiente (no Vercel: Project Settings -> Environment Variables):
//   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (false), SMTP_USER, SMTP_PASS,
//   SMTP_FROM, WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN,
//   WHATSAPP_TWILIO_FROM

import nodemailer from 'nodemailer';

const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || 'FeedBook <no-reply@feedbook.local>').trim();
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
    await emailTransport.sendMail({ from: SMTP_FROM, to, subject, html: htmlContent });
    console.log(`[Vercel] Email enviado para ${to}`);
  } catch (e) {
    console.error('[Vercel] Erro ao enviar email:', e.message);
  }
}

async function sendWhatsApp(recipient, message) {
  if (!WHATSAPP_TWILIO_ACCOUNT_SID || !WHATSAPP_TWILIO_AUTH_TOKEN || !WHATSAPP_TWILIO_FROM) return;
  try {
    console.log(`[Vercel] [Simulado] WhatsApp para ${recipient}: ${message}`);
  } catch (e) {
    console.error('[Vercel] Erro ao enviar WhatsApp:', e.message);
  }
}

async function sendBookingNotifications(booking, status) {
  const recipientEmail = booking.email;

  if (recipientEmail && emailTransport) {
    let subject = '';
    let bodyHTML = `<h1 style="font-size: 24px;">FeedBook Booking Status</h1>`;

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
      bodyHTML += `<p>Iremos confirmar o mais rapido possivel.</p>`;
    }

    await sendEmail(recipientEmail, subject, bodyHTML);
  }

  if (booking.contactPhone) {
    const message = `[FeedBook] Seu ensaio foi ${status === 'confirmed' ? 'confirmado' : status === 'rejected' ? 'rejeitado' : 'cancelado'}!`;
    await sendWhatsApp(booking.contactPhone, message);
  }
}

// Vercel Function handler — responde a POST /api/notify
// (mesmo payload que o src/api.ts envia: { booking, status })
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { booking, status } = req.body || {};
  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Booking payload is required.' });
  }

  if (!['pending', 'confirmed', 'rejected', 'cancelled'].includes(String(status || '').trim())) {
    return res.status(400).json({ message: 'Invalid notification status.' });
  }

  await sendBookingNotifications(booking, String(status).trim());
  return res.json({ message: 'Notification queued.' });
}
