import { CSSProperties, MouseEvent, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, ChevronDown } from 'lucide-react';
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

function RoomChapter({ room, index, count, nextRoom, onChoose }: {
  room: JourneyRoom;
  index: number;
  count: number;
  nextRoom?: JourneyRoom;
  onChoose: Props['onChoose'];
}) {
  const { translations } = useI18n();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const detailsRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const coverId = `room-cover-${room.id}`;
  const detailsId = `room-story-${room.id}`;
  const nextId = nextRoom ? `room-cover-${nextRoom.id}` : 'explore-studio';
  const nextLabel = nextRoom ? translations.rooms.nextRoom : translations.rooms.exploreStudio;

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
    <article className="room-journey-chapter" style={{ '--journey-accent': room.accent } as CSSProperties} aria-labelledby={`${coverId}-title`}>
      <section id={coverId} className="room-journey-cover" tabIndex={-1} aria-labelledby={`${coverId}-title`}>
        <div className="room-journey-topline">
          <span className="room-journey-counter" aria-label={`${index + 1} / ${count}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <span className="room-journey-counter-line" aria-hidden="true" />
            <span>{String(count).padStart(2, '0')}</span>
          </span>
          <a className="room-journey-skip" href={`#${nextId}`} onClick={(event) => advance(event, nextId)}>
            {nextLabel}<ArrowDown size={14} aria-hidden="true" />
          </a>
        </div>

        <RoomPhotoSlideshow images={getRoomImageUrls(room)} roomName={room.name} className="room-journey-photo" />

        <div className="room-journey-intro">
          <p className="room-journey-meta">{room.capacity}{room.capacity ? ' · ' : ''}{room.priceLabel}</p>
          <h2 id={`${coverId}-title`}><RoomName name={room.name} accent={room.accent} /></h2>
          <p className="room-journey-vibe">{room.vibe}</p>
        </div>

        <div className="room-journey-cover-actions">
          <a className="room-journey-scroll" href={`#${detailsId}`} onClick={(event) => {
            setRevealed(true);
            advance(event, detailsId);
          }} aria-label={`${translations.rooms.scrollDetails} — ${room.name}`}>
            <span className="room-journey-scroll-icon"><ChevronDown size={23} aria-hidden="true" /></span>
            <span>{translations.rooms.scrollDetails}</span>
          </a>
          <button type="button" className="room-journey-quick-book" onClick={() => onChoose(room.id)}>
            {translations.rooms.chooseShort}<ArrowUpRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <div ref={detailsRef} id={detailsId} tabIndex={-1} className={`room-journey-details${revealed ? ' is-revealed' : ''}`} onFocusCapture={() => setRevealed(true)}>
        <div className="room-journey-details-inner">
          <div className="room-journey-detail-heading">
            <span className="room-journey-eyebrow">{translations.rooms.discoverRoom}</span>
            <h3><RoomName name={room.name} accent={room.accent} /></h3>
          </div>
          <p className="room-journey-description">{room.longDescription || room.vibe}</p>
          {room.gear.length > 0 ? (
            <section className="room-journey-equipment" aria-labelledby={`${detailsId}-equipment`}>
              <h4 id={`${detailsId}-equipment`}>{translations.rooms.equipment}</h4>
              <ul>{room.gear.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>
            </section>
          ) : null}
          <div className="room-journey-booking">
            <p>{room.capacity}<strong>{room.priceLabel}</strong></p>
            <button type="button" className="room-journey-book" onClick={() => onChoose(room.id)}>
              {translations.rooms.choose}<ArrowUpRight size={20} aria-hidden="true" />
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
        <RoomChapter key={room.id} room={room} index={index} count={rooms.length} nextRoom={rooms[index + 1]} onChoose={onChoose} />
      ))}
    </section>
  );
}