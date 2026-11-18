import { afterEach, describe, expect, it, vi } from 'vitest';
const { rpc, limit } = vi.hoisted(() => ({ rpc: vi.fn(), limit: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc,
  from: () => ({ select: () => ({ order: () => ({ order: () => ({ limit }) }) }) }),
}) }));
import handler from './arcade.js';
import { createGameToken } from '../lib/arcade.js';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function call(method, body) {
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-secret');
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ method, body, headers: {}, socket: {} }, res);
  return res;
}

describe('arcade endpoint', () => {
  it('lista ranking público sem dados privados', async () => {
    limit.mockResolvedValue({ data: [{ nick: 'ABC', score: 10 }] });
    const res = await call('GET');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ scores: [{ nick: 'ABC', score: 10 }] });
  });
  it('cria sessão e rejeita métodos e pontuações inválidos', async () => {
    expect((await call('POST', { action: 'start' })).status).toHaveBeenCalledWith(200);
    expect((await call('DELETE')).status).toHaveBeenCalledWith(405);
    expect((await call('POST', {})).status).toHaveBeenCalledWith(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('guarda uma vez e distingue duplicados e rate limit', async () => {
    const body = { token: createGameToken('test-secret', Date.now() - 5000), nick: 'ABC', score: 40 };
    rpc.mockResolvedValueOnce({ error: null });
    expect((await call('POST', body)).status).toHaveBeenCalledWith(201);
    rpc.mockResolvedValueOnce({ error: { code: '23505' } });
    expect((await call('POST', body)).status).toHaveBeenCalledWith(409);
    rpc.mockResolvedValueOnce({ error: { message: 'arcade_rate_limit' } });
    expect((await call('POST', body)).status).toHaveBeenCalledWith(429);
  });
  it('trata a migração ausente sem expor erros internos', async () => {
    limit.mockResolvedValue({ error: { message: 'private details' } });
    const res = await call('GET');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ code: 'unavailable' });
  });
});