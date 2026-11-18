import { createClient } from '@supabase/supabase-js';
import { arcadeClientHash, createGameToken, validateSubmission } from '../lib/arcade.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ code: 'method' });
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return res.status(503).json({ code: 'unavailable' });
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (req.method === 'GET') {
      const { data, error } = await db.from('arcade_scores').select('nick,score')
        .order('score', { ascending: false }).order('created_at', { ascending: true }).limit(10);
      if (error) return res.status(503).json({ code: 'unavailable' });
      return res.status(200).json({ scores: data });
    }
    if (req.body?.action === 'start') return res.status(200).json({ token: createGameToken(secret) });
    const submission = validateSubmission(req.body, secret);
    if (!submission) return res.status(400).json({ code: 'invalid' });
    const { error } = await db.rpc('submit_arcade_score', {
      p_session: submission.id, p_nick: submission.nick, p_score: submission.score,
      p_client: arcadeClientHash(req, secret),
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ code: 'duplicate' });
      if (error.message?.includes('arcade_rate_limit')) return res.status(429).json({ code: 'rate_limit' });
      return res.status(503).json({ code: 'unavailable' });
    }
    return res.status(201).json({ saved: true });
  } catch {
    return res.status(503).json({ code: 'unavailable' });
  }
}