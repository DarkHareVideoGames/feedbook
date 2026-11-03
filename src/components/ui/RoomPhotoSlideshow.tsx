import { useEffect, useMemo, useRef, useState } from 'react';

type Props = { images: string[]; roomName: string; className?: string };

export default function RoomPhotoSlideshow({ images, roomName, className = 'room-card-image' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const imageKey = JSON.stringify(images);
  const stableImages = useMemo<string[]>(() => JSON.parse(imageKey), [imageKey]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // A capa pode já estar em cache e ter emitido load antes deste efeito.
    // Reconcilia o DOM para não a excluir permanentemente do ciclo.
    const elements = Array.from(containerRef.current?.querySelectorAll('img') ?? []);
    setActive(0);
    setLoaded(elements.filter((image) => image.complete && image.naturalWidth > 0).map((image) => image.getAttribute('src')!));
    setFailed(elements.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')!));
  }, [imageKey]);

  useEffect(() => {
    if (reducedMotion || stableImages.length < 2) return;
    const timer = window.setInterval(() => {
      setActive((current) => {
        for (let offset = 1; offset < stableImages.length; offset += 1) {
          const next = (current + offset) % stableImages.length;
          if (loaded.includes(stableImages[next]) && !failed.includes(stableImages[next])) return next;
        }
        return current;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [stableImages, loaded, failed, reducedMotion]);

  const visible = !failed.includes(images[active])
    ? active
    : images.findIndex((url) => loaded.includes(url) && !failed.includes(url));

  if (images.length === 0 || failed.length === images.length) return null;

  return (
    <div ref={containerRef} className={`${className} room-photo-slideshow`} role="img" aria-label={roomName}>
      {images.map((url, index) => (
        <img
          key={url}
          src={url}
          alt=""
          aria-hidden="true"
          className={index === visible ? 'is-active' : ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded((current) => current.includes(url) ? current : [...current, url])}
          onError={() => setFailed((current) => current.includes(url) ? current : [...current, url])}
        />
      ))}
    </div>
  );
}