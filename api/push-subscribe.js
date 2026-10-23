import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  const authHeader = String(req.headers?.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ message: 'Missing auth token.' });
  }

  const body = req.body || {};
  const userId = String(body.userId || '').trim();
  const subscription = body.subscription || {};
  const endpoint = String(subscription.endpoint || '').trim();
  const keys = subscription.keys || {};
  const p256dh = String(keys.p256dh || '').trim();
  const auth = String(keys.auth || '').trim();

  if (!userId || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ message: 'Invalid subscription payload.' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ message: 'Supabase not configured on server.' });
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user || userData.user.id !== userId) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const payload = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: String(req.headers?.['user-agent'] || ''),
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient
    .from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });

  if (error) {
    console.error('push_subscriptions upsert error:', error);
    return res.status(500).json({ message: 'Could not save subscription.' });
  }

  return res.status(200).json({ message: 'Subscription saved.' });
}
