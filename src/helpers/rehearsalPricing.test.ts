// src/helpers/rehearsalPricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateRehearsalPrice, MAX_REHEARSAL_HOURS } from './rehearsalPricing';

describe('calculateRehearsalPrice', () => {
  it('calcula os preços acumulados da tabela', () => {
    expect(calculateRehearsalPrice(1)).toBe(7);
    expect(calculateRehearsalPrice(2)).toBe(14);
    expect(calculateRehearsalPrice(3)).toBe(20);
    expect(calculateRehearsalPrice(4)).toBe(25);
    expect(calculateRehearsalPrice(5)).toBe(29);
    expect(calculateRehearsalPrice(6)).toBe(32);
  });

  it('retorna 0 para 0 e negativos', () => {
    expect(calculateRehearsalPrice(0)).toBe(0);
    expect(calculateRehearsalPrice(-1)).toBe(0);
  });

  it('lança RangeError acima do limite máximo', () => {
    expect(() => calculateRehearsalPrice(7)).toThrow(RangeError);
  });

  it('usa o limite máximo de 6 horas', () => {
    expect(MAX_REHEARSAL_HOURS).toBe(6);
  });
});
