export const GRAVITY = 1900;
export const JUMP = 580;
export const PLAYER_X = 52;
export const PLAYER_WIDTH = 60;
export const PLAYER_HEIGHT = 88;
export const OBSTACLE_WIDTH = 30;
export const OBSTACLE_HEIGHT = 50;

export function difficulty(score: number, width: number) {
  const level = Math.min(1, Math.max(0, score) / 600);
  return {
    speed: (300 + level * 140) * Math.min(1, Math.max(0.65, width / 600)),
    interval: 1.25 - level * 0.4,
  };
}

export function collides(x: number, y: number) {
  return PLAYER_X + PLAYER_WIDTH > x && PLAYER_X < x + OBSTACLE_WIDTH && y < OBSTACLE_HEIGHT;
}

export function validNick(nick: string) {
  return /^[A-Z0-9_-]{3,12}$/.test(nick);
}