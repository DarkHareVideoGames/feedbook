import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { Locale, useI18n } from './i18n';
import { calculateRehearsalPrice, resolveRoomPricePerHour } from './helpers/rehearsalPricing';
import CookieConsent from './components/ui/CookieConsent';

type RoomDefinition = api.ApiRoom;

type Extra = {
  id: string;
  price: number;
  label: string;
};

type PricingConfig = {
  perMemberPerHour: number;
  extras: Record<string, number>;
};

type PaymentMethod = 'on-site';

type BookingForm = {
  bandName: string;
  contactName: string;
  contactPhone: string;
  email: string;
  focus: string;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

type BookingStep = 'room' | 'date' | 'extras' | 'details' | 'confirmation';

const bookingSteps: BookingStep[] = ['room', 'date', 'extras', 'details', 'confirmation'];

type TeamBooking = {
  id: string;
  roomId: RoomDefinition['id'];
  status: BookingStatus;
  roomName: string;
  date: string;
  time: string;
  duration: number;
  bandName: string;
  contactName: string;
  email: string;
  participants?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: string;
};

const fallbackRooms: RoomDefinition[] = [
  {
    id: 'sala-red',
    name: 'SALA RED',
    description: '',
    descriptionEn: '',
    maxMembers: 6,
    pricePerMemberHour: null,
    gear: [],
    gearEn: [],
    accent: 'var(--room-red)',
    active: true,
  },
  {
    id: 'sala-grey',
    name: 'SALA GREY',
    description: '',
    descriptionEn: '',
    maxMembers: 5,
    pricePerMemberHour: null,
    gear: [],
    gearEn: [],
    accent: 'var(--room-grey)',
    active: true,
  },
];

const lastStartHour = 23;
const studioClosingHour = 25;

const startSlotHours = Array.from(
  { length: (lastStartHour - 10) * 2 + 1 },
  (_, index) => 10 + index * 0.5,
);


const defaultPricing: PricingConfig = {
  perMemberPerHour: 3,
  extras: {
    engineer: 24,
    recording: 18,
    backline: 12,
  },
};

const durations = [1, 2, 3, 4, 5, 6];

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function toHourLabel(hour: number): string {
  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  return `${`${wholeHours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`;
}

function hourLabelToNumber(hourLabel: string): number {
  const [hours, minutes] = hourLabel.split(':');
  return Number(hours) + Number(minutes) / 60;
}

// Rótulos dos slots de início (startSlotHours já está em passos de 30 min).
const startSlotLabels: string[] = startSlotHours.map(toHourLabel);

function canSessionFit(startHour: number, rehearsalHours: number): boolean {
  return startHour + rehearsalHours <= studioClosingHour;
}

// === Disponibilidade por intervalo (30 min de folga entre marcações na mesma sala) ===
const BOOKING_BUFFER_MINUTES = 30;

// Só pending/confirmed ocupam a sala; rejected/cancelled/refunded não contam.
function isBookingActive(booking: TeamBooking): boolean {
  if (booking.status === 'rejected' || booking.status === 'cancelled') return false;
  if (String(booking.paymentStatus || '').toLowerCase() === 'refunded') return false;
  return true;
}

function toMinutes(hourLabel: string): number {
  return Math.round(hourLabelToNumber(hourLabel) * 60);
}

function roomBookingsOnDate(bookings: TeamBooking[], roomId: string, date: string): TeamBooking[] {
  return bookings.filter(
    (booking) => booking.roomId === roomId && booking.date === date && isBookingActive(booking),
  );
}

// Colisão: o intervalo [início, fim + folga] intersecta o de outra marcação (mesma sala/dia).
function slotCollides(
  startMinutes: number,
  endMinutes: number,
  dayBookings: TeamBooking[],
): boolean {
  return dayBookings.some((booking) => {
    const bookingStart = toMinutes(booking.time);
    const bookingEnd = bookingStart + Number(booking.duration) * 60;
    return (
      startMinutes < bookingEnd + BOOKING_BUFFER_MINUTES &&
      bookingStart < endMinutes + BOOKING_BUFFER_MINUTES
    );
  });
}

// Um horário serve se cabe até ao fecho E não colide com marcações da sala nesse dia.
function isSlotAvailable(
  slotLabel: string,
  duration: number,
  date: string,
  roomId: string,
  bookings: TeamBooking[],
): boolean {
  if (!canSessionFit(hourLabelToNumber(slotLabel), duration)) return false;
  const start = toMinutes(slotLabel);
  const end = start + duration * 60;
  return !slotCollides(start, end, roomBookingsOnDate(bookings, roomId, date));
}

// O dia ainda vale a pena se existir pelo menos um início onde caiba a duração mínima.
function dayHasAvailableSlot(date: string, roomId: string, bookings: TeamBooking[]): boolean {
  const dayBookings = roomBookingsOnDate(bookings, roomId, date);
  const minDuration = durations[0];
  return startSlotLabels.some((label) => {
    if (!canSessionFit(hourLabelToNumber(label), minDuration)) return false;
    const start = toMinutes(label);
    return !slotCollides(start, start + minDuration * 60, dayBookings);
  });
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getWeekdayLabels(locale: Locale): string[] {
  const baseMonday = new Date(Date.UTC(2026, 7, 3));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(baseMonday);
    day.setUTCDate(baseMonday.getUTCDate() + index);
    return new Intl.DateTimeFormat(locale, { weekday: 'short' })
      .format(day)
      .slice(0, 3);
  });
}

function buildCalendarDays(monthStart: Date): Array<{ date: Date; inCurrentMonth: boolean }> {
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const firstVisible = new Date(monthStart);
  firstVisible.setDate(monthStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    return {
      date,
      inCurrentMonth: sameMonth(date, monthStart),
    };
  });
}

function findNextAvailableDate(startIsoDate: string, occupiedDates: Set<string>): string {
  const start = new Date(startIsoDate);

  for (let offset = 0; offset < 365; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    const isoDate = toIsoDate(candidate);
    if (!occupiedDates.has(isoDate)) {
      return isoDate;
    }
  }

  return startIsoDate;
}

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{{${key}}}`).join(String(value)),
    template,
  );
}

function formatDateForDisplay(locale: Locale, date: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date));
}

function App() {
  const { locale, translations } = useI18n();
  const [logoVisible, setLogoVisible] = useState(true);
  const [rooms, setRooms] = useState<RoomDefinition[]>(fallbackRooms);
  const [serviceCatalog, setServiceCatalog] = useState<api.ApiService[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState(fallbackRooms[0].id);
  const [selectedSlot, setSelectedSlot] = useState('18:00');
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const [duration, setDuration] = useState(3);
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [selectedExtras, setSelectedExtras] = useState<string[]>(['engineer']);
  const [confirmation, setConfirmation] = useState<string>('');
  const [confirmationId, setConfirmationId] = useState<string>('');
  const [confirmationExtras, setConfirmationExtras] = useState<Array<{ id: string; label: string; price: number }>>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [teamBookings, setTeamBookings] = useState<TeamBooking[]>([]);
  const [bookingStep, setBookingStep] = useState<BookingStep>('room');
  const [betaEnabled, setBetaEnabled] = useState(() => localStorage.getItem('feedbook-beta-enabled') !== 'false');
  const confirmationRef = useRef<HTMLDivElement>(null);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const localizedRooms = rooms.map((room) => {
    const legacy = (translations.rooms as Record<string, { name?: string; vibe?: string; capacity?: string; gear?: string[] }>)[room.id];
    const isPt = locale.startsWith('pt');
    return {
      ...room,
      name: room.name || legacy?.name || room.id,
      vibe: (isPt ? room.description : room.descriptionEn) || room.description || legacy?.vibe || '',
      capacity:
        room.maxMembers > 0
          ? isPt
            ? `Ate ${room.maxMembers} elementos`
            : `Up to ${room.maxMembers} members`
          : legacy?.capacity || '',
      gear: ((isPt ? room.gear : room.gearEn).length > 0 ? (isPt ? room.gear : room.gearEn) : room.gear.length > 0 ? room.gear : legacy?.gear) || [],
    };
  });
  const selectedRoom = localizedRooms.find((room) => room.id === selectedRoomId) ?? localizedRooms[0];
  const selectedRoomPricePerHour = resolveRoomPricePerHour(
    selectedRoom.pricePerMemberHour,
    pricing.perMemberPerHour,
  );
  const selectedStartHour = hourLabelToNumber(selectedSlot);
  const extras = useMemo<Extra[]>(
    () =>
      Object.entries(pricing.extras ?? {}).map(([id, price]) => {
        const catalog = serviceCatalog.find((service) => service.id === id);
        const legacyLabel = (translations.extras as Record<string, string>)[id];
        const label = catalog ? (locale.startsWith('pt') ? catalog.name : catalog.nameEn || catalog.name) : legacyLabel || id;
        return { id, price: Number(price || 0), label };
      }),
    [pricing, serviceCatalog, locale, translations],
  );
  const availableDurationsForSelectedStart = durations.filter((hours) =>
    canSessionFit(selectedStartHour, hours),
  );
  const fullyBookedDatesForSelectedRoom = useMemo(
    () => {
      const bookedDates = new Set(
        teamBookings
          .filter(
            (booking) => booking.roomId === selectedRoomId && isBookingActive(booking),
          )
          .map((booking) => booking.date),
      );
      const fullyBooked = new Set<string>();
      for (const date of bookedDates) {
        if (!dayHasAvailableSlot(date, selectedRoomId, teamBookings)) {
          fullyBooked.add(date);
        }
      }
      return fullyBooked;
    },
    [teamBookings, selectedRoomId],
  );
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(visibleMonth),
    [locale, visibleMonth],
  );
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const paymentMethodLabel = translations.booking.paymentOnSite;
  const displayDate = formatDateForDisplay(locale, selectedDate);
  const todayIso = getToday();

  useEffect(() => {
    if (rooms.length > 0 && !rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    setSelectedExtras((current) => current.filter((id) => id in (pricing.extras ?? {})));
  }, [pricing]);

  useEffect(() => {
    void Promise.all([loadTeamBookings(), loadPricing()]);
  }, []);

  useEffect(() => {
    if (selectedDate < todayIso || fullyBookedDatesForSelectedRoom.has(selectedDate)) {
      const nextAvailable = findNextAvailableDate(todayIso, fullyBookedDatesForSelectedRoom);
      setSelectedDate(nextAvailable);
      setVisibleMonth(startOfMonth(new Date(nextAvailable)));
    }
  }, [fullyBookedDatesForSelectedRoom, selectedDate, todayIso]);

  useEffect(() => {
    if (!availableDurationsForSelectedStart.includes(duration)) {
      const fallbackDuration = availableDurationsForSelectedStart[0] ?? 2;
      setDuration(fallbackDuration);
    }
  }, [availableDurationsForSelectedStart, duration]);

  useEffect(() => {
    if (!isSlotAvailable(selectedSlot, duration, selectedDate, selectedRoomId, teamBookings)) {
      const fallbackSlot = startSlotLabels.find((label) =>
        isSlotAvailable(label, duration, selectedDate, selectedRoomId, teamBookings),
      );
      if (fallbackSlot !== undefined) {
        setSelectedSlot(fallbackSlot);
      }
    }
  }, [duration, selectedDate, selectedSlot, selectedRoomId, teamBookings]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [bookingStep]);

  useEffect(() => {
    if (!confirmation || !confirmationRef.current) return;
    confirmationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    confirmationRef.current.focus({ preventScroll: true });
  }, [confirmation]);

  function goToNextStep() {
    setBookingStep((current) => {
      const index = bookingSteps.indexOf(current);
      const next = bookingSteps[index + 1];
      return next && next !== 'confirmation' ? next : current;
    });
  }

  function goToPreviousStep() {
    setBookingStep((current) => {
      const index = bookingSteps.indexOf(current);
      const previous = bookingSteps[index - 1];
      return previous && previous !== 'confirmation' ? previous : current;
    });
  }

  function toggleExtra(extraId: string) {
    setSelectedExtras((current) =>
      current.includes(extraId)
        ? current.filter((id) => id !== extraId)
        : [...current, extraId],
    );
  }

  async function loadTeamBookings() {
    try {
      const payload = await api.listBookings();
      setTeamBookings(payload.bookings as unknown as TeamBooking[]);
      setBackendOffline(false);
    } catch (_error) {
      setBackendOffline(true);
    }
  }

  async function loadPricing() {
    try {
      const [pricingPayload, roomsPayload, servicesPayload] = await Promise.all([
        api.pricing(),
        api.listRooms(),
        api.listServices(),
      ]);
      if (pricingPayload.pricing) {
        setPricing(pricingPayload.pricing);
        setBackendOffline(false);
      }
      if (roomsPayload.rooms.length > 0) {
        setRooms(roomsPayload.rooms);
      }
      if (servicesPayload.services.length > 0) {
        setServiceCatalog(servicesPayload.services);
      }
    } catch (_error) {
      setBackendOffline(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const rawData = new FormData(event.currentTarget);
    const draftForm: BookingForm = {
      bandName: String(rawData.get('bandName') || ''),
      contactName: String(rawData.get('name') || ''),
      contactPhone: String(rawData.get('tel') || ''),
      email: String(rawData.get('email') || ''),
      focus: String(rawData.get('focus') || ''),
    };

    // Client-side validation before hitting the network
    const missing: string[] = [];
    if (!draftForm.contactName.trim()) missing.push('contactName');
    if (!draftForm.email.trim()) missing.push('email');
    if (!draftForm.contactPhone.trim()) missing.push('contactPhone');

    if (missing.length > 0) {
      setErrorMessage(translations.booking.validationError ?? 'Preenche os campos obrigatorios.');
      // Focus the first missing field
      const firstEl = document.getElementById(`field-${missing[0]}`);
      if (firstEl) firstEl.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setBackendOffline(false);

    try {
      const payload = await api.createBooking({
        roomId: selectedRoom.id,
        date: selectedDate,
        time: selectedSlot,
        duration,
        extras: selectedExtras,
        bandName: draftForm.bandName,
        contactName: draftForm.contactName,
        contactPhone: draftForm.contactPhone,
        email: draftForm.email,
        focus: draftForm.focus,
        locale,
        paymentMethod: 'on-site',
      });

      const message = formatTemplate(translations.booking.confirmation, {
        bandName: draftForm.bandName || translations.booking.confirmationFallback,
        roomName: selectedRoom.name,
        date: displayDate,
        time: selectedSlot,
        duration,
        paymentMethod: paymentMethodLabel,
      });

      setConfirmation(message);
      setConfirmationId(payload.booking.id);
      setConfirmationExtras(
        extras
          .filter((extra) => selectedExtras.includes(extra.id))
          .map((extra) => ({ id: extra.id, label: extra.label, price: extra.price })),
      );
      setBackendOffline(false);
      setBookingStep('confirmation');

      await loadTeamBookings();
    } catch (error) {
      if (error instanceof TypeError) {
        setBackendOffline(true);
        setErrorMessage('Servico temporariamente indisponivel.');
      } else if (error instanceof Error) {
        setBackendOffline(false);
        setErrorMessage(error.message);
      } else {
        setBackendOffline(false);
        setErrorMessage('Nao foi possivel concluir a marcacao.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    const syncBetaMode = () => setBetaEnabled(localStorage.getItem('feedbook-beta-enabled') !== 'false');
    window.addEventListener('storage', syncBetaMode);
    return () => window.removeEventListener('storage', syncBetaMode);
  }, []);

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      {betaEnabled ? (
        <div className="admin-beta-banner beta-only" role="note">
          <span className="admin-beta-badge">Beta</span>
        </div>
      ) : null}

      <header className="topbar">
        <div className="brand-wrap">
          {logoVisible ? (
            <img
              className="brand-logo"
              src="/feedbook-logo.png"
              alt="Feedback - Ensaios"
              onError={() => setLogoVisible(false)}
            />
          ) : null}
        </div>
      </header>

      <main className="layout">
        {bookingStep !== 'confirmation' ? (
          <div className="booking-stepper" aria-hidden="true">
            {(['room', 'date', 'extras', 'details'] as const).map((step) => (
              <span
                key={step}
                className={`booking-stepper-dot${bookingSteps.indexOf(bookingStep) >= bookingSteps.indexOf(step) ? ' booking-stepper-dot-done' : ''}`}
              />
            ))}
            <span className="booking-stepper-label">
              {formatTemplate(translations.booking.stepIndicator, {
                current: bookingSteps.indexOf(bookingStep) + 1,
                total: 4,
              })}
            </span>
          </div>
        ) : null}

        {bookingStep === 'room' ? (
          <section className="rooms-grid">
            {localizedRooms.map((room) => {
              const isSelected = room.id === selectedRoom.id;

              return (
                <article
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${room.name} — ${translations.rooms.choose}`}
                  className={`room-card card ${isSelected ? 'room-card-selected' : ''}`}
                  style={{ borderColor: room.accent }}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    goToNextStep();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRoomId(room.id);
                      goToNextStep();
                    }
                  }}
                >
                  {room.imageUrl ? (
                    <img className="room-card-image" src={room.imageUrl} alt={room.name} loading="lazy" />
                  ) : null}
                  <div className="room-card-header">
                    <div>
                      <p className="eyebrow">{room.capacity}</p>
                      <h3>{room.name}</h3>
                    </div>
                    <strong>
                      {translations.rooms.priceFrom}{' '}
                      {currency.format(
                        resolveRoomPricePerHour(room.pricePerMemberHour, pricing.perMemberPerHour),
                      )}
                    </strong>
                  </div>
                  <p>{room.vibe}</p>
                  <ul className="gear-list">
                    {room.gear.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
        ) : null}

        {bookingStep === 'date' || bookingStep === 'extras' || bookingStep === 'details' ? (
          <section className="booking-grid">
            <form className="card booking-form" onSubmit={handleSubmit} autoComplete="on">
              <div className="section-heading">
                <h2>{translations.booking.title}</h2>
              </div>

            {bookingStep === 'date' ? (
              <div className="field-row booking-step">
              <div className="calendar-field">
                <div className="calendar-picker">
                  <div className="calendar-toolbar">
                    <strong>{monthLabel}</strong>
                  </div>

                  <div className="calendar-weekdays">
                    {weekdayLabels.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {calendarDays.map(({ date, inCurrentMonth }) => {
                      const isoDate = toIsoDate(date);
                      const isPast = isoDate < todayIso;
                      const isOccupied = fullyBookedDatesForSelectedRoom.has(isoDate);
                      const isSelected = isoDate === selectedDate;
                      const isDisabled = isOccupied;

                      if (!inCurrentMonth || isPast) {
                        return (
                          <span
                            key={isoDate}
                            className="calendar-day calendar-day-empty"
                            aria-hidden="true"
                          />
                        );
                      }

                      return (
                        <button
                          key={isoDate}
                          type="button"
                          className={`calendar-day${isSelected ? ' calendar-day-selected' : ''}${
                            isOccupied ? ' calendar-day-occupied' : ''
                          }`}
                          disabled={isDisabled}
                          onClick={() => {
                            setSelectedDate(isoDate);
                          }}
                        >
                          <span>{date.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="calendar-nav-row">
                    {sameMonth(visibleMonth, startOfMonth(new Date())) ? null : (
                      <button
                        type="button"
                        className="calendar-nav calendar-nav-prev"
                        aria-label={translations.booking.calendarPrev}
                        onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                      >
                        <span aria-hidden="true">&#8249;</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="calendar-nav calendar-nav-next"
                      aria-label={translations.booking.calendarNext}
                      onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                    >
                      <span aria-hidden="true">&#8250;</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="duration-field">
                <label>
                  {translations.booking.durationLabel}
                  <select
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="duration-select"
                  >
                    {durations.map((value) => (
                      <option
                        key={value}
                        value={value}
                        disabled={!canSessionFit(selectedStartHour, value)}
                      >
                        {formatTemplate(translations.booking.durationOption, { count: value })}
                        {' — '}
                        {currency.format(calculateRehearsalPrice(value, selectedRoomPricePerHour))}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="starttime-field">
                  <label>
                    {translations.booking.startTimeLabel}
                    <select
                      value={selectedSlot}
                      onChange={(event) => setSelectedSlot(event.target.value)}
                      className="starttime-select"
                    >
                      {startSlotLabels.map((slotLabel) => {
                        const isUnavailable = !isSlotAvailable(
                          slotLabel,
                          duration,
                          selectedDate,
                          selectedRoomId,
                          teamBookings,
                        );
                        return (
                          <option key={slotLabel} value={slotLabel} disabled={isUnavailable}>
                            {slotLabel}
                            {isUnavailable ? ` — ${translations.slots.unavailable}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </div>

              <div className="booking-nav">
                <button type="button" className="secondary-button" onClick={goToPreviousStep}>
                  {translations.booking.back}
                </button>
                <button type="button" className="primary-button" onClick={goToNextStep}>
                  {translations.booking.next}
                </button>
              </div>
              </div>
            ) : null}

            {bookingStep === 'extras' ? (
              <div className="booking-step">
                <span className="field-label">{translations.booking.addonsLabel}</span>
                <div className="extras-list">
                  {extras.map((extra) => (
                    <label key={extra.id} className="extra-toggle">
                      <input
                        type="checkbox"
                        checked={selectedExtras.includes(extra.id)}
                        onChange={() => toggleExtra(extra.id)}
                      />
                      <span>{extra.label}</span>
                      <strong>{currency.format(extra.price)}</strong>
                    </label>
                  ))}
                </div>

                <div className="booking-nav">
                  <button type="button" className="secondary-button" onClick={goToPreviousStep}>
                    {translations.booking.back}
                  </button>
                  <button type="button" className="primary-button" onClick={goToNextStep}>
                    {translations.booking.next}
                  </button>
                </div>
              </div>
            ) : null}

            {bookingStep === 'details' ? (
              <div className="booking-step">
              <label>
                {translations.booking.bandNameLabel}
                <input
                  id="field-bandName"
                  name="bandName"
                  type="text"
                  autoComplete="organization"
                  placeholder={translations.booking.bandNamePlaceholder}
                />
              </label>

              <div className="field-row">
                <label>
                  {translations.booking.contactNameLabel} <span className="required-star">*</span>
                  <input
                    id="field-contactName"
                    name="name"
                    type="text"
                    required
                    aria-required="true"
                    autoComplete="name"
                    placeholder={translations.booking.contactNamePlaceholder}
                  />
                </label>

                <label>
                  {translations.booking.contactPhoneLabel} <span className="required-star">*</span>
                  <input
                    id="field-contactPhone"
                    name="tel"
                    type="tel"
                    required
                    aria-required="true"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={translations.booking.contactPhonePlaceholder}
                  />
                </label>

                <label>
                  {translations.booking.emailLabel} <span className="required-star">*</span>
                  <input
                    id="field-email"
                    name="email"
                    type="email"
                    required
                    aria-required="true"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={translations.booking.emailPlaceholder}
                  />
                </label>
              </div>

              <label>
                {translations.booking.focusLabel}
                <textarea
                  id="field-focus"
                  name="focus"
                  rows={4}
                  autoComplete="off"
                  placeholder={translations.booking.focusPlaceholder}
                />
              </label>

              {backendOffline ? (
                <div className="offline-banner" role="alert">
                  <span>⚠ Servico temporariamente indisponivel.</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => { void Promise.all([loadTeamBookings(), loadPricing()]); }}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              <div className="booking-nav">
                <button type="button" className="secondary-button" onClick={goToPreviousStep}>
                  {translations.booking.back}
                </button>
                <button className="primary-button" type="submit" disabled={isSubmitting || backendOffline}>
                  {isSubmitting ? translations.booking.submitting : translations.booking.submit}
                </button>
              </div>
            </div>
            ) : null}

            {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
          </form>
        </section>
        ) : null}

        {bookingStep === 'confirmation' ? (
          <section className="booking-grid">
            <div className="card booking-form">
              <div className="confirmation-banner" role="status" aria-live="polite" tabIndex={-1} ref={confirmationRef}>
                <span className="confirmation-banner-badge">{translations.booking.pendingBadge}</span>
                <p className="confirmation-banner-message">{confirmation}</p>
                {confirmationExtras.length > 0 ? (
                  <ul className="confirmation-extras-list" aria-label={translations.booking.addonsLabel}>
                    {confirmationExtras.map((extra) => (
                      <li key={extra.id}>
                        <span>{extra.label}</span>
                        <strong>{currency.format(extra.price)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="confirmation-extras-empty">{translations.booking.noExtras ?? 'Sem servicos extra — so o ensaio.'}</p>
                )}
                <div className="confirmation-id-row">
                  <span>{translations.booking.bookingIdLabel ?? 'N.º da reserva:'}</span>
                  <strong className="confirmation-id-value">{confirmationId}</strong>
                </div>
                <p className="confirmation-id-note">
                  {translations.booking.bookingIdNote ?? 'Guarda este numero para futuras referencias.'}
                </p>
              </div>

              <div className="pending-box" role="status" aria-live="polite">
                <strong>{translations.booking.pendingBadge}</strong>
                <p>{translations.booking.pendingDescription}</p>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <CookieConsent />
    </div>
  );
}

export default App;
