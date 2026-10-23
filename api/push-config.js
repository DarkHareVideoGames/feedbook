export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed.' });
  }

  const publicKey = String(process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  if (!publicKey) {
    return res.status(503).json({ message: 'VAPID public key not configured.', publicKey: '' });
  }

  return res.status(200).json({ publicKey });
}
