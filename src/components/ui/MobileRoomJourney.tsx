import { CSSProperties, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getRoomImageUrls } from '../../api';
import {
  STACK_CUE_SPACE,
  SWIPE_THRESHOLD,
  roomStackCueCentre,
  roomStageHeight,
  roomStageTarget,
} from '../../helpers/roomStack';
import { getScrollBehavior } from '../../helpers/motion';
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
// How long the outgoing room stays on screen while it fades away.
const LEAVE_MS = 260;

type Props = {
  rooms: JourneyRoom[];
  onChoose: (roomId: string) => void;
};

type Stage = {
  scroller: HTMLElement;
  viewport: DOMRect;
  stage: DOMRect;
  inView: boolean;
};

// Where the stage is and whether it is fully visible (below the sticky heading,
// above the arrow space). Room changes only happen while it is.
function measureStage(stageEl: HTMLElement | null): Stage | undefined {
  const scroller = stageEl?.closest<HTMLElement>('.page-shell');
  if (!stageEl || !scroller) return undefined;
  const viewport = scroller.getBoundingClientRect();
  const stage = stageEl.getBoundingClientRect();
  const heading = scroller.querySelector<HTMLElement>('.booking-heading');
  const headingBottom = heading ? heading.getBoundingClientRect().bottom : viewport.top;
  const inView = stage.top >= Math.max(viewport.top, headingBottom) - 1
    && stage.bottom <= viewport.bottom - STACK_CUE_SPACE + 2;
  return { scroller, viewport, stage, inView };
}

// Text that does not fit scrolls inside the card; a gesture that this text can
// still absorb in that direction is left to it.
function detailsCanScroll(target: EventTarget | null, direction: number): boolean {
  const details = target instanceof Element ? target.closest<HTMLElement>('.room-journey-details') : null;
  if (!details || details.scrollHeight <= details.clientHeight + 1) return false;
  return direction > 0
    ? details.scrollTop + details.clientHeight < details.scrollHeight - 1
    : details.scrollTop > 0;
}

function RoomChapter({ room, state, onChoose }: {
  room: JourneyRoom;
  state: 'active' | 'leaving' | 'idle';
  onChoose: Props['onChoose'];
}) {
  const { translations } = useI18n();
  const chapterRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const coverId = `room-cover-${room.id}`;
  const detailsId = `room-story-${room.id}`;
  const description = room.longDescription || room.vibe;
  const active = state === 'active';

  // Only the room on screen can be reached by keyboard or screen readers.
  useEffect(() => {
    chapterRef.current?.toggleAttribute('inert', !active);
  }, [active]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const update = () => {
      const scrollable = details.scrollHeight > details.clientHeight + 1;
      details.classList.toggle('is-scrollable', scrollable);
      details.classList.toggle('is-scrolled-end', details.scrollTop + details.clientHeight >= details.scrollHeight - 2);
      if (scrollable) details.tabIndex = 0; else details.removeAttribute('tabindex');
    };
    update();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    resize?.observe(details);
    details.addEventListener('scroll', update, { passive: true });
    return () => {
      resize?.disconnect();
      details.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <article ref={chapterRef} className={`room-journey-chapter${active ? ' is-active' : ''}${state === 'leaving' ? ' is-leaving' : ''}`}
      style={{ '--journey-accent': room.accent } as CSSProperties}
      aria-hidden={!active} aria-labelledby={`${coverId}-title`}>
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
                <h3 id={`${detailsId}-equipment`}>{translations.rooms.equipment.replace(/:\s*$/, '')}</h3>
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

// The desktop "more below" arrow, pinned to the bottom of the phone screen,
// halfway between the card and the footer. It hides once there is nothing below.
function ScrollCue({ stageRef, onNext }: { stageRef: RefObject<HTMLElement>; onNext: () => void }) {
  const { translations } = useI18n();
  const cueRef = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const scroller = stageRef.current?.closest<HTMLElement>('.page-shell');
    const cue = cueRef.current;
    if (!scroller || !cue) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const measured = measureStage(stageRef.current);
      if (!measured) return;
      const { viewport, stage, inView } = measured;
      const cardBottom = inView ? stage.bottom : viewport.bottom - STACK_CUE_SPACE;
      const footerTop = document.querySelector('.site-footer-links')?.getBoundingClientRect().top ?? viewport.bottom;
      cue.style.top = `${Math.round(roomStackCueCentre(cardBottom, footerTop) - cue.offsetHeight / 2)}px`;
      setHidden(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (stageRef.current) resize?.observe(stageRef.current);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [stageRef]);

  const cue = (
    <button ref={cueRef} type="button" className="room-journey-cue" hidden={hidden}
      aria-label={translations.rooms.scrollMore} onClick={onNext}>
      <ChevronDown size={38} aria-hidden="true" />
    </button>
  );
  // Rendered into <body>: inside the scroll area it would be clipped at the footer.
  return typeof document === 'undefined' ? cue : createPortal(cue, document.body);
}

export default function MobileRoomJourney({ rooms, onChoose }: Props) {
  const stageRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<number | undefined>(undefined);
  const [direction, setDirection] = useState(1);
  const [moved, setMoved] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const count = rooms.length;
  const current = Math.min(active, Math.max(0, count - 1));

  const go = useCallback((target: number) => {
    const from = activeRef.current;
    if (target === from || target < 0 || target >= count) return;
    activeRef.current = target;
    setDirection(target > from ? 1 : -1);
    setLeaving(from);
    setActive(target);
    setMoved(true);
  }, [count]);

  useEffect(() => {
    if (leaving === undefined) return;
    const timer = window.setTimeout(() => setLeaving(undefined), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, active]);

  // Fixed stage size: whole card visible below the logo at page load.
  useEffect(() => {
    const stageEl = stageRef.current;
    const scroller = stageEl?.closest<HTMLElement>('.page-shell');
    if (!stageEl || !scroller) return;
    const update = () => {
      const viewport = scroller.getBoundingClientRect();
      const stageTopAtLoad = stageEl.getBoundingClientRect().top - viewport.top + scroller.scrollTop;
      const heading = scroller.querySelector<HTMLElement>('.booking-heading');
      const headingHeight = heading && getComputedStyle(heading).position === 'sticky' ? heading.offsetHeight : 0;
      const padding = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const height = `${roomStageHeight(stageTopAtLoad, viewport.height, viewport.height - padding - headingHeight)}px`;
      if (stageEl.style.getPropertyValue('--stage-height') !== height) stageEl.style.setProperty('--stage-height', height);
    };
    update();
    window.addEventListener('resize', update);
    void document.fonts?.ready.then(update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Swipes and wheel turns change the room in place while the stage is fully in
  // view; past the last room (or before the first) the page scrolls as usual.
  useEffect(() => {
    const scroller = stageRef.current?.closest<HTMLElement>('.page-shell');
    if (!scroller) return;
    let wheelLockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const now = performance.now();
      if (now < wheelLockedUntil) {
        // Swallow the rest of the same flick (trackpad inertia) after a change.
        event.preventDefault();
        wheelLockedUntil = Math.max(wheelLockedUntil, now + 120);
        return;
      }
      const direction = Math.sign(event.deltaY);
      const target = roomStageTarget(activeRef.current, count, direction, Boolean(measureStage(stageRef.current)?.inView));
      if (target === undefined || detailsCanScroll(event.target, direction)) return;
      event.preventDefault();
      wheelLockedUntil = now + 650;
      go(target);
    };

    let startY = 0;
    let startTarget: EventTarget | null = null;
    let startInView = false;
    let target: number | undefined;
    let decided = false;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0].clientY;
      startTarget = event.target;
      startInView = Boolean(measureStage(stageRef.current)?.inView);
      target = undefined;
      decided = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      const delta = startY - event.touches[0].clientY;
      if (!decided && delta !== 0) {
        decided = true;
        const direction = Math.sign(delta);
        target = detailsCanScroll(startTarget, direction) ? undefined : roomStageTarget(activeRef.current, count, direction, startInView);
      }
      if (target !== undefined && event.cancelable) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      const delta = startY - event.changedTouches[0].clientY;
      if (target !== undefined && Math.abs(delta) >= SWIPE_THRESHOLD) go(target);
      target = undefined;
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
    };
  }, [count, go]);

  // Arrow: next room in place; after the last one, the studio section and then
  // one screen at a time.
  const next = useCallback(() => {
    const measured = measureStage(stageRef.current);
    if (!measured) return;
    const { scroller, viewport, stage, inView } = measured;
    const behavior = getScrollBehavior();
    if (activeRef.current < count - 1) {
      if (!inView) {
        // Bring the stage back fully into view first, then change room.
        const overflowBottom = stage.bottom - (viewport.bottom - STACK_CUE_SPACE);
        scroller.scrollBy({ top: overflowBottom > 0 ? overflowBottom : stage.top - viewport.top, behavior });
      }
      go(activeRef.current + 1);
      return;
    }
    const studio = document.getElementById('explore-studio');
    const scrollerTop = viewport.top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0);
    if (studio && studio.getBoundingClientRect().top > scrollerTop + 8) {
      studio.scrollIntoView({ behavior, block: 'start' });
    } else {
      scroller.scrollBy({ top: scroller.clientHeight * 0.85, behavior });
    }
  }, [count, go]);

  return (
    <>
      <section ref={stageRef} className={`room-journey${moved ? ' has-moved' : ''}`}
        style={{ '--room-direction': direction } as CSSProperties} aria-labelledby="booking-title">
        {rooms.map((room, index) => (
          <RoomChapter key={room.id} room={room} onChoose={onChoose}
            state={index === current ? 'active' : index === leaving ? 'leaving' : 'idle'} />
        ))}
        <p className="room-journey-live" aria-live="polite">{moved ? rooms[current]?.name : ''}</p>
      </section>
      {count > 0 ? <ScrollCue stageRef={stageRef} onNext={next} /> : null}
    </>
  );
}
