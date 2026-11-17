import { describe, expect, it } from 'vitest';
import { arcadeClientHash, createGameToken, validateSubmission } from './arcade.js';

describe('arcade signed sessions', () => {
  const secret = 'test-only-secret';
  const now = 100000;
  const token = createGameToken(secret, now);
  const valid = { token, nick: 'ABC', score: 50 };
  it('aceita uma pontuação plausível com sessão válida', () => {
    expect(validateSubmission(valid, secret, now + 5100)).toMatchObject({ nick: 'ABC', score: 50 });
  });
  it('rejeita token alterado, ausente ou assinado com outra chave', () => {
    expect(validateSubmission({ ...valid, token: token + 'a' }, secret, now + 5100)).toBeNull();
    expect(validateSubmission(valid, 'wrong', now + 5100)).toBeNull();
    expect(validateSubmission({}, secret)).toBeNull();
  });
  it('rejeita pontos impossíveis, fracionários ou negativos', () => {
    for (const score of [1000, -1, 0, 2.5, '50', Infinity]) {
      expect(validateSubmission({ ...valid, score }, secret, now + 5100)).toBeNull();
    }
  });
  it('rejeita sessões expiradas e nicks inválidos', () => {
    expect(validateSubmission(valid, secret, now + 3600001)).toBeNull();
    expect(validateSubmission(valid, secret, now - 1)).toBeNull();
    expect(validateSubmission({ ...valid, nick: '<img>' }, secret, now + 5100)).toBeNull();
  });
  it('não usa forwarded-for não fiável no servidor Express', () => {
    const req = { headers: { 'x-forwarded-for': 'spoof' }, socket: { remoteAddress: 'test-address' } };
    expect(arcadeClientHash(req, secret)).toBe(arcadeClientHash({ ...req, headers: {} }, secret));
    expect(arcadeClientHash(req, secret)).not.toContain('test-address');
  });
});