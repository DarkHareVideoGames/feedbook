// src/helpers/rehearsalPricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateRehearsalPrice, MAX_REHEARSAL_HOURS, DEFAULT_PRICE_PER_HOUR } from './rehearsalPricing';

describe('calculateRehearsalPrice', () => {
  it('calcula a tabela acumulada de referência (base 7€)', () => {
    expect(calculateRehearsalPrice(1)).toBe(7);
    expect(calculateRehearsalPrice(2)).toBe(14);
    expect(calculateRehearsalPrice(3)).toBe(20);
    expect(calculateRehearsalPrice(4)).toBe(25);
    expect(calculateRehearsalPrice(5)).toBe(29);
    expect(calculateRehearsalPrice(6)).toBe(32);
  });

  it('aplica desconto progressivo a partir do preço/hora base da sala', () => {
    // base 10€: 1h=10, 2h=20, 3h=20+9=29, 4h=29+8=37, 5h=37+7=44, 6h=44+6=50
    expect(calculateRehearsalPrice(1, 10)).toBe(10);
    expect(calculateRehearsalPrice(2, 10)).toBe(20);
    expect(calculateRehearsalPrice(3, 10)).toBe(29);
    expect(calculateRehearsalPrice(4, 10)).toBe(37);
    expect(calculateRehearsalPrice(5, 10)).toBe(44);
    expect(calculateRehearsalPrice(6, 10)).toBe(50);
  });

  it('nunca deixa o preço de uma hora ficar negativo (base baixa)', () => {
    // base 3€: 1h=3, 2h=6, 3h=6+2=8, 4h=8+1=9, 5h=9+0=9, 6h=9+0=9
    expect(calculateRehearsalPrice(3, 3)).toBe(8);
    expect(calculateRehearsalPrice(4, 3)).toBe(9);
    expect(calculateRehearsalPrice(5, 3)).toBe(9);
    expect(calculateRehearsalPrice(6, 3)).toBe(9);
  });

  it('retorna 0 para 0 e negativos', () => {
    expect(calculateRehearsalPrice(0)).toBe(0);
    expect(calculateRehearsalPrice(-1)).toBe(0);
  });

  it('usa o preço de referência quando a base é inválida', () => {
    expect(calculateRehearsalPrice(2, 0)).toBe(DEFAULT_PRICE_PER_HOUR * 2);
    expect(calculateRehearsalPrice(2, Number.NaN)).toBe(DEFAULT_PRICE_PER_HOUR * 2);
  });

  it('lança RangeError acima do limite máximo', () => {
    expect(() => calculateRehearsalPrice(7)).toThrow(RangeError);
    expect(() => calculateRehearsalPrice(7, 10)).toThrow(RangeError);
  });

  it('usa o limite máximo de 6 horas', () => {
    expect(MAX_REHEARSAL_HOURS).toBe(6);
  });
});
