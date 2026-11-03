import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { getRoomImageUrls } from '../../api';
import RoomPhotoSlideshow from './RoomPhotoSlideshow';

type RoomDetailsModalProps = {
  room: {
    name: string;
    accent: string;
    imageUrl?: string | null;
    imageUrls?: string[];
    capacity: string;
    vibe: string;
    longDescription: string;
    gear: string[];
  };
  priceLabel: string;
  onClose: () => void;
  onChoose: () => void;
};

function RoomDetailsModal({ room, priceLabel, onClose, onChoose }: RoomDetailsModalProps) {
  const { translations } = useI18n();
  const images = getRoomImageUrls(room);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPointerDown = useRef(false);
  const [namePrefix = '', ...nameParts] = room.name.trim().split(/\s+/);
  const nameRest = nameParts.join(' ');
  const hasRoomPrefix = /^(sala|room)$/i.test(namePrefix) && Boolean(nameRest);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const trigger = document.activeElement;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const body = document.body;
    const previousStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = parseFloat(getComputedStyle(body).paddingRight) || 0;

    dialog.showModal();
    Object.assign(body.style, {
      position: 'fixed',
      top: `-${scrollY}px`,
      left: `-${scrollX}px`,
      width: '100%',
      overflow: 'hidden',
      paddingRight: `${paddingRight + scrollbarWidth}px`,
    });

    return () => {
      dialog.close();
      Object.assign(body.style, previousStyle);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="room-details-modal"
      aria-labelledby="room-modal-title"
      aria-describedby="room-modal-summary"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPointerDown.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPointerDown.current) onClose();
        backdropPointerDown.current = false;
      }}
    >
      <section className="room-details-panel" style={{ borderColor: room.accent }}>
          <button
            type="button"
            className="room-details-close"
            aria-label={translations.rooms.closeDetails}
            onClick={onClose}
          >
            <X size={30} aria-hidden="true" />
          </button>
        <div className="room-details-content">
          <RoomPhotoSlideshow images={images} roomName={room.name} className="room-details-image" />
          <div className={`room-details-body${images.length > 0 ? '' : ' room-details-body-no-image'}`}>
          <h2 id="room-modal-title" className="room-details-title">
            {hasRoomPrefix ? (
              <>
                <span>{namePrefix}</span>{' '}
                <span style={{ color: room.accent }}>{nameRest}</span>
              </>
            ) : <span style={{ color: room.accent }}>{room.name}</span>}
          </h2>
          <p className="room-details-meta">{room.capacity} • {priceLabel}</p>
          <p id="room-modal-summary" className="room-details-summary">{room.vibe}</p>
          {room.longDescription ? <p className="room-details-description">{room.longDescription}</p> : null}
          {room.gear.length > 0 ? (
            <section aria-labelledby="room-modal-equipment">
              <h3 id="room-modal-equipment">{translations.rooms.equipment}</h3>
              <ul className="gear-list">
                {room.gear.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            </section>
          ) : null}
          </div>
        </div>
        <footer className="room-details-actions">
          <button type="button" className="room-details-choose" onClick={onChoose}>
            {translations.rooms.chooseShort}
            <span className="room-details-choose-arrow" aria-hidden="true">&gt;</span>
          </button>
        </footer>
      </section>
    </dialog>
  );
}

export default RoomDetailsModal;