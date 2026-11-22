import { CSSProperties, MouseEvent, useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronDown } from 'lucide-react';
import { getRoomImageUrls } from '../../api';
import { getScrollBehavior } from '../../helpers/motion';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n';
import RoomName from './RoomName';
import RoomPhotoSlideshow from './RoomPhotoSlideshow';
import './MobileRoomJourney.css';

export type JourneyRoom = {
  id: string;
  name: string;
  accent: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  capacity: string;
  vibe: string;
  longDescription: string;
  gear: string[];
  priceLabel: string;
};

type Props = {
  rooms: JourneyRoom[];
  onChoose: (roomId: string) => void;
};

function advance(event: MouseEvent<HTMLAnchorElement>, targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  event.preventDefault();
  // Move focus as well as the viewport, so keyboard users continue at the destination.
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
}

function RoomChapter({ room, nextRoom, onChoose }: {
  room: JourneyRoom;
  nextRoom?: JourneyRoom;
  onChoose: Props['onChoose'];
}) {
  const { translations } = useI18n();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const chapterRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const coverId = `room-cover-${room.id}`;
  const detailsId = `room-story-${room.id}`;
  const nextId = nextRoom ? `room-cover-${nextRoom.id}` : 'explore-studio';
  const nextLabel = nextRoom ? translations.rooms.nextRoom : translations.rooms.exploreStudio;

  useEffect(() => {
    const chapter = chapterRef.current;
    const scroller = chapter?.closest('.page-shell');
    if (!chapter || !scroller || reducedMotion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = scroller.getBoundingClientRect();
      const cover = chapter.querySelector('.room-journey-cover')!.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (viewport.top - cover.top) / Math.max(cover.height, 1)));
      const entry = Math.min(1, Math.max(0, (cover.top - viewport.top - viewport.height * 0.35) / (viewport.height * 0.65)));
      chapter.style.setProperty('--phase-exit', String(progress));
      chapter.style.setProperty('--phase-entry', String(entry));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      chapter.style.removeProperty('--phase-exit');
      chapter.style.removeProperty('--phase-entry');
    };
  }, [reducedMotion]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRevealed(true);
        observer.disconnect();
      }
    }, {
      root: details.closest('.page-shell'),
      rootMargin: '0px 0px -48px 0px',
      // Long equipment lists must reveal even when taller than the viewport.
      threshold: 0,
    });
    observer.observe(details);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <article ref={chapterRef} className="room-journey-chapter" style={{ '--journey-accent': room.accent } as CSSProperties} aria-labelledby={`${coverId}-title`}>
      <section id={coverId} className="room-journey-cover" tabIndex={-1} aria-labelledby={`${coverId}-title`}>
        <div className="room-card card room-journey-original" role="button" tabIndex={0}
          aria-label={`${room.name} — ${translations.rooms.choose}`} style={{ borderColor: room.accent }}
          onClick={() => onChoose(room.id)}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onChoose(room.id);
            }
          }}>
          <RoomPhotoSlideshow images={getRoomImageUrls(room)} roomName={room.name} />
          <div className="room-card-header"><div>
            <h2 id={`${coverId}-title`}><RoomName name={room.name} accent={room.accent} /></h2>
            <p className="room-card-meta">{room.capacity}{room.capacity ? ' • ' : ''}{room.priceLabel}</p>
          </div></div>
          <p className="room-card-description">{room.vibe}</p>
          <span className="room-card-arrow" aria-hidden="true">&gt;</span>
        </div>
        <div className="room-journey-cover-actions">
          <a className="room-journey-scroll" href={`#${detailsId}`} onClick={(event) => {
            setRevealed(true);
            advance(event, detailsId);
          }} aria-label={`${translations.rooms.scrollDetails} — ${room.name}`}>
            <span className="room-journey-scroll-icon"><ChevronDown size={23} aria-hidden="true" /></span>
            <span>{translations.rooms.scrollDetails}</span>
          </a>
        </div>
      </section>

      <div ref={detailsRef} id={detailsId} tabIndex={-1} className={`room-journey-details${revealed ? ' is-revealed' : ''}`} onFocusCapture={() => setRevealed(true)}>
        <div className="room-journey-details-inner">
          <h3 className="room-details-title"><RoomName name={room.name} accent={room.accent} /></h3>
          <p className="room-journey-description">{room.longDescription || room.vibe}</p>
          {room.gear.length > 0 ? (
            <section className="room-journey-equipment" aria-labelledby={`${detailsId}-equipment`}>
              <h4 id={`${detailsId}-equipment`}>{translations.rooms.equipment}</h4>
              <ul className="gear-list">{room.gear.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>
            </section>
          ) : null}
          <div className="room-details-actions">
            <button type="button" className="room-journey-book room-details-choose" onClick={() => onChoose(room.id)}>
              {translations.rooms.choose}<span aria-hidden="true">&gt;</span>
            </button>
          </div>
          <a className="room-journey-next" href={`#${nextId}`} onClick={(event) => advance(event, nextId)}>
            <span><small>{nextLabel}</small><strong>{nextRoom?.name || translations.about.eyebrow}</strong></span>
            <span className="room-journey-next-icon"><ArrowDown size={24} aria-hidden="true" /></span>
          </a>
        </div>
      </div>
    </article>
  );
}

export default function MobileRoomJourney({ rooms, onChoose }: Props) {
  return (
    <section className="room-journey" aria-labelledby="booking-title">
      {rooms.map((room, index) => (
        <RoomChapter key={room.id} room={room} nextRoom={rooms[index + 1]} onChoose={onChoose} />
      ))}
    </section>
  );
}