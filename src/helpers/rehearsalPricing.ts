/**
 * Cálculo do preço do aluguer de uma sala de ensaios, por hora inteira,
 * com desconto progressivo a partir do preço/hora base de cada sala.
 *
 * Regra (base = preço de UMA hora da sala):
 *   - 1.ª hora            = base
 *   - 2.ª hora            = 2 × base (dobro)
 *   - 3.ª hora e seguintes: cada hora adicional desconta 1€ face ao preço
 *     cheio da hora (base − 1, base − 2, ...), nunca abaixo de 0€.
 *
 * Exemplo com base = 7€/h (tabela de referência):
 *   1h = 7€ · 2h = 14€ · 3h = 20€ · 4h = 25€ · 5h = 29€ · 6h = 32€
 *
 * - Máximo de reserva permitido: 6 horas.
 * - Entrada <= 0 => 0€ (sem reserva válida).
 * - Entrada > 6h => erro de domínio para forçar o cliente a tratar o limite.
 */

export const MAX_REHEARSAL_HOURS = 6;

// Preço/hora de referência usado quando uma sala não define o seu preço
// (nem o preço global está configurado). Corresponde à tabela 7/14/20/25/29/32.
export const DEFAULT_PRICE_PER_HOUR = 7;

/**
 * Calcula o preço acumulado de um aluguer de sala de ensaios, por horas inteiras.
 *
 * @param hours - Número de horas inteiras reservadas.
 * @param basePricePerHour - Preço de UMA hora da sala (base do desconto progressivo).
 * @returns O preço total em euros, conforme a fórmula acumulada.
 * @throws {RangeError} Se `hours` for maior do que 6 (limite máximo de reserva).
 */
export function calculateRehearsalPrice(
  hours: number,
  basePricePerHour: number = DEFAULT_PRICE_PER_HOUR,
): number {
  if (!Number.isInteger(hours) || hours < 0) {
    return 0;
  }

  if (hours > MAX_REHEARSAL_HOURS) {
    throw new RangeError(
      `Limite máximo de reserva ultrapassado: ${hours}h. O máximo permitido é ${MAX_REHEARSAL_HOURS}h.`,
    );
  }

  const base =
    Number.isFinite(basePricePerHour) && basePricePerHour > 0 ? basePricePerHour : DEFAULT_PRICE_PER_HOUR;

  if (hours === 0) return 0;
  if (hours === 1) return base;
  if (hours === 2) return base * 2;

  // A partir da 3.ª hora cada hora vale max(0, base − (hora − 2)).
  let total = base * 2;
  for (let hour = 3; hour <= hours; hour += 1) {
    total += Math.max(0, base - (hour - 2));
  }

  return Number(total.toFixed(2));
}

/**
 * Resolve o preço de UMA hora de uma sala: usa o preço próprio da sala quando
 * definido; caso contrário cai no preço global (por hora). Garante sempre um
 * valor positivo e finito, recorrendo a DEFAULT_PRICE_PER_HOUR como último
 * fallback.
 */
export function resolveRoomPricePerHour(
  roomPricePerHour: number | null | undefined,
  globalPricePerHour?: number | null,
): number {
  const own = Number(roomPricePerHour);
  if (Number.isFinite(own) && own > 0) return own;
  const global = Number(globalPricePerHour);
  if (Number.isFinite(global) && global > 0) return global;
  return DEFAULT_PRICE_PER_HOUR;
}
