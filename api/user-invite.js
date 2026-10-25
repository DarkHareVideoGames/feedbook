import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// Feedback - Ensaios — POST /api/user-invite (Vercel Serverless)
// Chamado pelo front (src/api.ts) após criar um utilizador.
// Gera um link único "define a tua password" via Supabase Admin API
// (o Supabase NÃO envia email nenhum — só gera o link) e envia-o
// pelo nosso SMTP, com a identidade Feedback Productions.
// Espelho de server/index.js (mesmo comportamento em dev e produção).
//
// Body: { email, name?, mode? }
//   mode 'invite' (default) — convite de conta nova; requer role admin|superuser.
//   mode 'reset'            — reenvio de link de redefinição de password;
//                             APENAS superuser (Issue #9).
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   SUPABASE_URL / SUPABASE_ANON_KEY (ou as VITE_ do projeto)
//   SUPABASE_SERVICE_ROLE_KEY (obrigatória; NUNCA com prefixo VITE_)
//   APP_BASE_URL (ex.: https://feedbook-kappa.vercel.app; tem de estar
//                 na Redirect URL allow-list do Supabase)
//   SMTP_* (igual a /api/notify)
// ============================================================

const SMTP_HOST = String(process.env.SMTP_HOST || 'mail.feedbackproductions.pt').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = String(process.env.SMTP_USER || 'ensaios@feedbackproductions.pt').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || 'Feedback - Ensaios <ensaios@feedbackproductions.pt>').trim();
// Porta 465 = SSL/TLS direto (secure); 587 = STARTTLS. Força sempre canal encriptado.
const SMTP_SECURE = String(process.env.SMTP_SECURE || (SMTP_PORT === 465 ? 'true' : 'false')).toLowerCase() === 'true';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://www.ensaiosfeedback.pt').trim().replace(/\/+$/, '');

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

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

// Assinatura partilhada por todos os e-mails (mesma de notify.js).
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

function buildInviteMessage(nameOrEmail, inviteUrl) {
  const head = '<h1 style="font-size: 24px;">Feedback - Ensaios — Conta criada</h1>';
  const user = escapeHtml(nameOrEmail);
  const button =
    `<p style="margin:16px 0;"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:10px 20px;background-color:#222222;color:#ffffff !important;font-size:14px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;">🔑 Definir password</a></p>`;
  const note = '<p style="color:#999999;font-size:12px;">O link é único e expira dentro de 1 hora. Se não foste tu a criar esta conta, ignora este email.</p>';
  return (
    head +
    `<p>Olá ${user},</p>` +
    '<p>A tua conta foi criada na plataforma de marcações. Para entrares, define a tua password:</p>' +
    button +
    note +
    emailSignature()
  );
}

// Email de reenvio do link de redefinição de password (mode 'reset', Issue #9).
function buildResetMessage(nameOrEmail, resetUrl) {
  const head = '<h1 style="font-size: 24px;">Feedback - Ensaios — Redefinir password</h1>';
  const user = escapeHtml(nameOrEmail);
  const button =
    `<p style="margin:16px 0;"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:10px 20px;background-color:#222222;color:#ffffff !important;font-size:14px;font-family:Arial,sans-serif;text-decoration:none;border-radius:20px;">🔑 Redefinir password</a></p>`;
  const note = '<p style="color:#999999;font-size:12px;">O link é único e expira dentro de 1 hora. Se não foste tu a pedir este reenvio, ignora este email.</p>';
  return (
    head +
    `<p>Olá ${user},</p>` +
    '<p>Foi pedido o reenvio do link para redefinir a tua password na plataforma de marcações:</p>' +
    button +
    note +
    emailSignature()
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.' });
  }

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

  const transport = getTransport();
  if (!transport) {
    console.warn(`SMTP desativado: falta SMTP_PASS; convite NAO enviado para ${email}`);
    return res.status(202).json({ message: 'Invite link generated (email disabled).' });
  }

  try {
    const isReset = mode === 'reset';
    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: isReset ? '🔐 Link para redefinir a tua password' : '📩 A tua conta foi criada — define a tua password',
      html: isReset ? buildResetMessage(name || email, inviteUrl) : buildInviteMessage(name || email, inviteUrl),
    });
    console.log(`${isReset ? 'Reset' : 'Invite'} email sent to ${email}`);
    return res.status(202).json({ message: isReset ? 'Reset link sent.' : 'Invite sent.' });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e);
    return res.status(502).json({ message: 'Failed to send email.' });
  }
}