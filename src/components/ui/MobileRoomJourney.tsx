import { CSSProperties, useEffect, useRef } from 'react';
import { getRoomImageUrls } from '../../api';
import { roomStackAvailable, roomStackPhotoHeight, roomStackProgress, roomStackTop } from '../../helpers/roomStack';
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

function RoomChapter({ room, onChoose }: {
  room: JourneyRoom;
  onChoose: Props['onChoose'];
}) {
  const { translations } = useI18n();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const chapterRef = useRef<HTMLElement>(null);
  const coverId = `room-cover-${room.id}`;
  const detailsId = `room-story-${room.id}`;
  const description = room.longDescription || room.vibe;

  useEffect(() => {
    const chapter = chapterRef.current;
    const scroller = chapter?.closest('.page-shell');
    if (!chapter || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = scroller.getBoundingClientRect();

      // One whole card at a time: it fits between the sticky heading and the
      // bottom of the screen, sticks there, and the next card slides over it.
      const heading = scroller.querySelector<HTMLElement>('.booking-heading');
      const headingOffset = heading && getComputedStyle(heading).position === 'sticky' ? heading.offsetHeight : 0;
      const available = roomStackAvailable(headingOffset, viewport.height);
      const photo = chapter.querySelector<HTMLElement>('.room-card-image');
      const cardBox = chapter.querySelector<HTMLElement>('.room-journey-original');
      if (photo && cardBox) {
        // The photo absorbs the difference, so the whole card fits on screen.
        const photoHeight = `${roomStackPhotoHeight(available, cardBox.offsetHeight - photo.offsetHeight)}px`;
        if (chapter.style.getPropertyValue('--stack-photo') !== photoHeight) chapter.style.setProperty('--stack-photo', photoHeight);
      }
      chapter.style.setProperty('--stack-available', `${available}px`);
      chapter.style.top = `${roomStackTop(headingOffset, viewport.height, chapter.offsetHeight)}px`;
      const card = chapter.getBoundingClientRect();
      const next = chapter.nextElementSibling?.getBoundingClientRect();
      chapter.style.setProperty('--stack-progress', roomStackProgress(card.top, card.bottom, next?.top, viewport.top, viewport.bottom).toFixed(3));

      if (reducedMotion) return;
      const entry = Math.min(1, Math.max(0, (card.top - viewport.top - viewport.height * 0.35) / (viewport.height * 0.65)));
      chapter.style.setProperty('--phase-entry', String(entry));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    // Photos and fonts load after mount; keep the sizes in sync.
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resize?.observe(chapter);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      for (const property of ['top', '--stack-progress', '--stack-available', '--stack-photo', '--phase-entry']) {
        chapter.style.removeProperty(property);
      }
    };
  }, [reducedMotion]);

  return (
    <article ref={chapterRef} className="room-journey-chapter" style={{ '--journey-accent': room.accent } as CSSProperties} aria-labelledby={`${coverId}-title`}>
      <section id={coverId} className="room-journey-cover" tabIndex={-1} aria-labelledby={`${coverId}-title`}>
        <div className="room-card card room-journey-original" style={{ borderColor: room.accent }}>
          <div className="room-journey-summary" role="button" tabIndex={0}
            aria-label={`${room.name} — ${translations.rooms.choose}`}
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
            {room.vibe && room.longDescription ? <p className="room-card-description">{room.vibe}</p> : null}
          </div>

          <div id={detailsId} className="room-journey-details">
            {description ? <p className="room-journey-description">{description}</p> : null}
            {room.gear.length > 0 ? (
              <section className="room-journey-equipment" aria-labelledby={`${detailsId}-equipment`}>
                <h3 id={`${detailsId}-equipment`}>{translations.rooms.equipment}</h3>
                <ul className="gear-list">{room.gear.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>
              </section>
            ) : null}
            <div className="room-details-actions">
              <button type="button" className="room-journey-book room-details-choose" onClick={() => onChoose(room.id)}>
                {translations.rooms.choose}
              </button>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

export default function MobileRoomJourney({ rooms, onChoose }: Props) {
  return (
    <section className="room-journey" aria-labelledby="booking-title">
      {rooms.map((room) => (
        <RoomChapter key={room.id} room={room} onChoose={onChoose} />
      ))}
    </section>
  );
}
