import { useEffect, useState } from 'react';

/**
 * Aguarda a decodificação de um conjunto de imagens críticas.
 * Trata imagens já carregadas (complete + naturalWidth) e erros.
 * Resolve quando todas estiverem prontas ou falharem (nunca fica preso).
 */
export function useImagesReady(urls: string[]): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (urls.length === 0) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const unique = Array.from(new Set(urls.filter(Boolean)));

    const loadOne = (url: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.src = url;
        const done = () => resolve();
        if (img.complete && img.naturalWidth > 0) {
          // Já carregada: validar com decode() quando disponível
          if (typeof img.decode === 'function') {
            img.decode().then(done).catch(done);
          } else {
            done();
          }
          return;
        }
        img.onload = () => {
          if (typeof img.decode === 'function') {
            img.decode().then(done).catch(done);
          } else {
            done();
          }
        };
        img.onerror = done;
      });

    Promise.all(unique.map(loadOne)).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [urls.join('|')]);

  return ready;
}
