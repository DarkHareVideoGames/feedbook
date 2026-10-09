import nodemailer from 'nodemailer';

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
function emailSignature() {
  return (
    `<br><img src="https://feedbackproductions.pt/mailsign.png" width="108" height="42" style="width:108px;height:42px;display:block;border:0;" alt="Feedback Productions">` +
    `<p style="color:#555555;font-size:14px;line-height:1.5;margin:12px 0 0 0;">` +
    `Feedback Productions<br>` +
    `Estúdios de Ensaio &amp; Produção Musical<br>` +
    `📍 Parque de Exposições Acácio Dores — Montijo, Portugal<br>` +
    `📞 91 817 62 67 / 93 232 1079 / 91 651 58 02<br>` +
    `🌐 Link do site: <a href="https://estudiofeedback.weebly.com/">https://estudiofeedback.weebly.com/</a>` +
    `</p>` +
    `<p style="color:#555555;font-size:14px;line-height:1.5;margin:8px 0 0 0;">` +
    `📸 Instagram: <a href="https://www.instagram.com/feedbackproductions/">https://www.instagram.com/feedbackproductions/</a><br>` +
    `🎥 YouTube: <a href="https://www.youtube.com/@FEEDBACKPRODUCTIONS">https://www.youtube.com/@FEEDBACKPRODUCTIONS</a>` +
    `</p>` +
    `<p style="color:#999999;font-size:11px;line-height:1.5;margin:12px 0 0 0;">` +
    `Este é um e-mail automático enviado a partir do sistema de marcações. Por favor, não responda diretamente para este endereço.` +
    `</p>`
  );
}

function buildMessage(booking, status) {
  const head = '<h1 style="font-size: 24px;">Feedback - Ensaios Status da Reserva</h1>';
  const user = escapeHtml(booking.contactName);
  const band = escapeHtml(booking.bandName || booking.contactName);
  const date = escapeHtml(formatDatePt(booking.date));
  const time = escapeHtml(booking.time);
  const room = escapeHtml(booking.roomName);
  const signature = emailSignature();
  if (status === 'confirmed') {
    return {
      subject: '✅ Reserva Confirmada! Seu ensaio está agendado.',
      html:
        head +
        `<p>Olá ${user}, o seu ensaio foi confirmado.</p>` +
        `<p>Detalhes: Data: ${date} | Hora: ${time} | Sala: ${room}</p>` +
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
        `<p>Olá ${user}, o seu ensaio foi cancelado pela equipa de administração.</p>` +
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  const booking = req.body?.booking;
  const status = String(req.body?.status || '').trim();

  if (!booking || typeof booking !== 'object') {
    return res.status(400).json({ message: 'Booking payload is required.' });
  }
  if (!['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid notification status.' });
  }

  const transport = getTransport();
  if (!transport) {
    console.warn('SMTP desativado: falta SMTP_PASS nas variáveis de ambiente.');
    return res.json({ message: 'Email disabled (missing SMTP_PASS).' });
  }

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
    });
    console.log(`Email sent to ${booking.email}`);
    return res.json({ message: 'Notification sent.' });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e);
    return res.status(502).json({ message: 'Failed to send email.' });
  }
}
