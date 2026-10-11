/**
 * Cálculo de preço do aluguer de uma sala de ensaios (modelo por hora inteira).
 *
 * - O preço é comprado por horas inteiras (nenhum prorrogação para minutos).
 * - A tabela é de preços acumulados por número de horas:
 *     1h = 7 €
 *     2h = 14 €
 *     3h = 20 €
 *     4h = 25 €
 *     5h = 29 €
 *     6h = 32 €
 *   Ou seja, cada hora seguinte adiciona um desconto progressivo relativamente
 *   à hora anterior, em vez de se cobrar apenas `precoPorHora * quantidade`.
 *
 * - Máximo de reserva permitido: 6 horas.
 * - Entrada <= 0 => 0 € (sem reserva válida).
 * - Entrada > 6 => erro de domínio para forçar o cliente a tratar o limite.
 */

export const MAX_REHEARSAL_HOURS = 6;

export const rehearsalPriceTable: ReadonlyArray<{ hours: number; price: number }> = [
  { hours: 1, price: 7 },
  { hours: 2, price: 14 },
  { hours: 3, price: 20 },
  { hours: 4, price: 25 },
  { hours: 5, price: 29 },
  { hours: 6, price: 32 },
];

/**
 * Calcula o preço acumulado de um aluguer de sala de ensaios, por horas inteiras.
 *
 * @param hours - Número de horas inteiras reservadas.
 * @returns O preço total em euros, conforme tabela acumulada.
 * @throws {RangeError} Se `hours` for maior do que 6 (limite máximo de reserva).
 */
export function calculateRehearsalPrice(hours: number): number {
  if (!Number.isInteger(hours) || hours < 0) {
    return 0;
  }

  if (hours > MAX_REHEARSAL_HOURS) {
    throw new RangeError(
      `Limite máximo de reserva ultrapassado: ${hours}h. O máximo permitido é ${MAX_REHEARSAL_HOURS}h.`,
    );
  }

  const entry = rehearsalPriceTable[hours - 1];
  return entry ? entry.price : 0;
}
