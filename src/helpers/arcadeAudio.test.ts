import { describe, expect, it, vi } from 'vitest';
import { playArcadeAudio, stopArcadeAudio } from './arcadeAudio';

describe('arcade audio', () => {
  function audio() {
    return { currentTime: 12, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
  }
  it('reinicia o efeito de salto mas permite retomar música', () => {
    const effect = audio();
    playArcadeAudio(effect as unknown as HTMLAudioElement, true);
    expect(effect.currentTime).toBe(0);
    expect(effect.play).toHaveBeenCalledOnce();
    const music = audio();
    playArcadeAudio(music as unknown as HTMLAudioElement);
    expect(music.currentTime).toBe(12);
  });
  it('para e reinicia na saída ou game over', () => {
    const music = audio();
    stopArcadeAudio(music as unknown as HTMLAudioElement);
    expect(music.pause).toHaveBeenCalledOnce();
    expect(music.currentTime).toBe(0);
  });
  it('tolera referências ausentes e erros de reprodução', async () => {
    playArcadeAudio(null);
    stopArcadeAudio(null);
    const effect = audio();
    effect.play.mockRejectedValue(new Error('blocked'));
    playArcadeAudio(effect as unknown as HTMLAudioElement);
    await Promise.resolve();
    effect.play.mockImplementation(() => { throw new Error('unsupported'); });
    expect(() => playArcadeAudio(effect as unknown as HTMLAudioElement)).not.toThrow();
  });
});