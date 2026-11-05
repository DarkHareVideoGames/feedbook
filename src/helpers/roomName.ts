// Accept legacy catalogue names without changing room IDs or historical bookings.
export function getRoomBaseName(value: string): string {
  return value.trim().replace(/^(?:sala|room)\s+/i, '').replace(/\s+room$/i, '').trim();
}
