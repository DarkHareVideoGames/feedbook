import { CSSProperties, RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getRoomImageUrls } from '../../api';
import { roomStackAvailable, roomStackHeight, roomStackProgress, roomStackTop } from '../../helpers/roomStack';
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

// «Escolher esta sala» is hidden for now; the card itself (photo, name, price)
// still opens the booking. Set to true to bring the button back.
const SHOW_CHOOSE_BUTTON = false;

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
  const detailsRef = useRef<HTMLDivElement>(null);
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

      // One whole card at a time: its height is fixed to the space between the
      // sticky heading and the bottom of the screen, so the full outline is
      // always visible. It sticks there and the next card slides over it.
      const heading = scroller.querySelector<HTMLElement>('.booking-heading');
      const headingOffset = heading && getComputedStyle(heading).position === 'sticky' ? heading.offsetHeight : 0;
      // Sticky offsets start below the scroller's top padding.
      const padding = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const available = roomStackAvailable(padding + headingOffset, viewport.height);
      // The first card starts below the logo: it keeps the height that fits there
      // at page load, so its photo never resizes (zooms) while scrolling.
      const firstSpace = chapter.previousElementSibling ? undefined
        : viewport.bottom - (chapter.parentElement!.getBoundingClientRect().top + scroller.scrollTop);
      const height = `${roomStackHeight(available, firstSpace)}px`;
      if (chapter.style.getPropertyValue('--stack-height') !== height) chapter.style.setProperty('--stack-height', height);
      chapter.style.top = `${roomStackTop(headingOffset, viewport.height - padding, chapter.offsetHeight)}px`;

      // Text that does not fit scrolls inside the card; make that reachable by keyboard.
      const details = detailsRef.current;
      if (details) {
        const scrollable = details.scrollHeight > details.clientHeight + 1;
        details.classList.toggle('is-scrollable', scrollable);
        details.classList.toggle('is-scrolled-end', details.scrollTop + details.clientHeight >= details.scrollHeight - 2);
        if (scrollable) details.tabIndex = 0; else details.removeAttribute('tabindex');
      }
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
    if (detailsRef.current) resize?.observe(detailsRef.current);
    detailsRef.current?.addEventListener('scroll', schedule, { passive: true });
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      scroller.removeEventListener('scroll', schedule);
      detailsRef.current?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      for (const property of ['top', '--stack-progress', '--stack-height', '--phase-entry']) {
        chapter.style.removeProperty(property);
      }
    };
  }, [reducedMotion]);

  return (
    <article ref={chapterRef} className="room-journey-chapter" style={{ '--journey-accent': room.accent } as CSSProperties} aria-labelledby={`${coverId}-title`}>
      <section id={coverId} className="room-journey-cover" tabIndex={-1} aria-labelledby={`${coverId}-title`}>
        <div className="room-card card room-journey-original">
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

          <div ref={detailsRef} id={detailsId} className="room-journey-details" role="group" aria-label={translations.rooms.discoverRoom}>
            {description ? <p className={`room-journey-description${room.longDescription ? '' : ' is-summary'}`}>{description}</p> : null}
            {room.gear.length > 0 ? (
              <section className="room-journey-equipment" aria-labelledby={`${detailsId}-equipment`}>
                <h3 id={`${detailsId}-equipment`}>{translations.rooms.equipment}</h3>
                <ul className="gear-list">{room.gear.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul>
              </section>
            ) : null}
          </div>
          {SHOW_CHOOSE_BUTTON ? (
            <div className="room-details-actions">
              <button type="button" className="room-journey-book room-details-choose" onClick={() => onChoose(room.id)}>
                {translations.rooms.choose}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}

// The desktop "more below" arrow, pinned to the very bottom of the phone screen
// (overlapping the footer a little). It hides once there is nothing below.
function ScrollCue({ journeyRef }: { journeyRef: RefObject<HTMLElement> }) {
  const { translations } = useI18n();
  const cueRef = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const scroller = journeyRef.current?.closest<HTMLElement>('.page-shell');
    const cue = cueRef.current;
    if (!scroller || !cue) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = scroller.getBoundingClientRect();
      cue.style.bottom = `${Math.max(0, window.innerHeight - viewport.bottom + 6)}px`;
      setHidden(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [journeyRef]);

  // Bring the next card that is not yet in place to the top; after the last one,
  // the studio section; past that, one screen further down.
  const advance = () => {
    const journey = journeyRef.current;
    const scroller = journey?.closest<HTMLElement>('.page-shell');
    if (!journey || !scroller) return;
    const scrollerTop = scroller.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0);
    const next = [...journey.querySelectorAll<HTMLElement>('.room-journey-chapter')]
      .find((chapter) => chapter.getBoundingClientRect().top > scrollerTop + (parseFloat(chapter.style.top) || 0) + 2);
    const behavior = getScrollBehavior();
    if (next) {
      const distance = next.getBoundingClientRect().top - scrollerTop - (parseFloat(next.style.top) || 0);
      scroller.scrollBy({ top: distance, behavior });
      return;
    }
    const studio = document.getElementById('explore-studio');
    if (studio && studio.getBoundingClientRect().top > scrollerTop + 8) {
      studio.scrollIntoView({ behavior, block: 'start' });
    } else {
      scroller.scrollBy({ top: scroller.clientHeight * 0.85, behavior });
    }
  };

  const cue = (
    <button ref={cueRef} type="button" className="room-journey-cue" hidden={hidden}
      aria-label={translations.rooms.scrollMore} onClick={advance}>
      <ChevronDown size={30} aria-hidden="true" />
    </button>
  );
  // Rendered into <body>: inside the scroll area it would be clipped at the footer.
  return typeof document === 'undefined' ? cue : createPortal(cue, document.body);
}

export default function MobileRoomJourney({ rooms, onChoose }: Props) {
  const journeyRef = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={journeyRef} className="room-journey" aria-labelledby="booking-title">
        {rooms.map((room) => (
          <RoomChapter key={room.id} room={room} onChoose={onChoose} />
        ))}
      </section>
      {rooms.length > 0 ? <ScrollCue journeyRef={journeyRef} /> : null}
    </>
  );
}
