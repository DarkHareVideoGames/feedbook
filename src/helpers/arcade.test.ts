import { describe, expect, it } from 'vitest';
import { collides, difficulty, GRAVITY, JUMP, validNick } from './arcade';

describe('404 arcade', () => {
  it('aumenta dificuldade com limite e adapta velocidade ao mobile', () => {
    expect(difficulty(0, 760).speed).toBe(300);
    expect(difficulty(600, 760).speed).toBe(440);
    expect(difficulty(99999, 760)).toEqual(difficulty(600, 760));
    expect(difficulty(0, 280).speed).toBe(195);
    expect(difficulty(600, 760).interval).toBeLessThan(difficulty(0, 760).interval);
  });
  it('mantém intervalo mínimo maior do que a duração de um salto', () => {
    expect(difficulty(600, 760).interval).toBeGreaterThan(2 * JUMP / GRAVITY);
  });
  it('deteta colisões e permite saltar amplificadores', () => {
    expect(collides(70, 0)).toBe(true);
    expect(collides(110, 0)).toBe(true);
    expect(collides(112, 0)).toBe(false);
    expect(collides(70, 60)).toBe(false);
    expect(collides(300, 0)).toBe(false);
    expect(collides(0, 0)).toBe(false);
  });
  it('valida nicks arcade e rejeita HTML/dados longos', () => {
    expect(validNick('ROCKER_42')).toBe(true);
    for (const nick of ['AB', 'aBc', '<script>', 'NAME WITH SPACE', 'ABCDEFGHIJKLM']) expect(validNick(nick)).toBe(false);
  });
});