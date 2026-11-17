import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const sign = (value, secret) => createHmac('sha256', secret).update(`arcade-v1:${value}`).digest('base64url');

export function createGameToken(secret, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({ id: randomUUID(), started: now })).toString('base64url');
  return `${value}.${sign(value, secret)}`;
}

export function validateSubmission(body, secret, now = Date.now()) {
  if (!body || typeof body.token !== 'string' || body.token.length > 512) return null;
  const [value, signature, extra] = body.token.split('.');
  if (!value || !signature || extra) return null;
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(value, 'base64url').toString());
    const elapsed = (now - session.started) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 3600 ||
        !/^[0-9a-f-]{36}$/.test(session.id) ||
        !Number.isInteger(body.score) || body.score < 1 || body.score > 36000 ||
        body.score > Math.floor(elapsed * 10) + 2 ||
        typeof body.nick !== 'string' || !/^[A-Z0-9_-]{3,12}$/.test(body.nick)) return null;
    return { id: session.id, nick: body.nick, score: body.score };
  } catch {
    return null;
  }
}

export function arcadeClientHash(req, secret) {
  // Vercel replaces this header. On Express use the socket, not client-supplied forwarding headers.
  const address = process.env.VERCEL === '1'
    ? String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';
  return sign(`client:${address}`, secret);
}