// Sound is optional: playback restrictions or missing codecs must never stop the game.
export function playArcadeAudio(audio: HTMLAudioElement | null, restart = false) {
  if (!audio) return;
  try {
    if (restart) audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch { /* Unsupported media or playback blocked. */ }
}

export function stopArcadeAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  try { audio.currentTime = 0; } catch { /* Media not loaded yet. */ }
}