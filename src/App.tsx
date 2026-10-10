import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { Locale, useI18n } from './i18n';

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

type BookingStep = 'date' | 'extras' | 'details';

const bookingSteps: BookingStep[] = ['date', 'extras', 'details'];

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

const startSlotHours = [
  10,
  ...Array.from({ length: lastStartHour - 13 + 1 }, (_, index) => 13 + index),
];


const defaultPricing: PricingConfig = {
  perMemberPerHour: 3,
  extras: {
    engineer: 24,
    recording: 18,
    backline: 12,
  },
};

const durations = [2, 3, 4, 5, 6];

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function toHourLabel(hour: number): string {
  return `${`${hour}`.padStart(2, '0')}:00`;
}

function hourLabelToNumber(hourLabel: string): number {
  return Number(hourLabel.split(':')[0]);
}

function canSessionFit(startHour: number, rehearsalHours: number): boolean {
  return startHour + rehearsalHours <= studioClosingHour;
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
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day);
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
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [teamBookings, setTeamBookings] = useState<TeamBooking[]>([]);
  const [bookingStep, setBookingStep] = useState<BookingStep | null>(null);
  const dateZoneRef = useRef<HTMLDivElement>(null);
  const extrasZoneRef = useRef<HTMLDivElement>(null);
  const detailsZoneRef = useRef<HTMLDivElement>(null);
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
            ? `Ate ${room.maxMembers} musicos`
            : `Up to ${room.maxMembers} players`
          : legacy?.capacity || '',
      gear: ((isPt ? room.gear : room.gearEn).length > 0 ? (isPt ? room.gear : room.gearEn) : room.gear.length > 0 ? room.gear : legacy?.gear) || [],
    };
  });
  const selectedRoom = localizedRooms.find((room) => room.id === selectedRoomId) ?? localizedRooms[0];
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
  const occupiedDatesForSelectedRoom = useMemo(
    () =>
      new Set(
        teamBookings
          .filter((booking) => {
            if (booking.roomId !== selectedRoomId) return false;
            if (booking.status === 'rejected' || booking.status === 'cancelled') return false;
            if (String(booking.paymentStatus || '').toLowerCase() === 'refunded') return false;
            return true;
          })
          .map((booking) => booking.date),
      ),
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
    if (selectedDate < todayIso || occupiedDatesForSelectedRoom.has(selectedDate)) {
      const nextAvailable = findNextAvailableDate(todayIso, occupiedDatesForSelectedRoom);
      setSelectedDate(nextAvailable);
      setVisibleMonth(startOfMonth(new Date(nextAvailable)));
    }
  }, [occupiedDatesForSelectedRoom, selectedDate, todayIso]);

  useEffect(() => {
    if (!availableDurationsForSelectedStart.includes(duration)) {
      const fallbackDuration = availableDurationsForSelectedStart[0] ?? 2;
      setDuration(fallbackDuration);
    }
  }, [availableDurationsForSelectedStart, duration]);

  useEffect(() => {
    if (!canSessionFit(selectedStartHour, duration)) {
      const fallbackStart = startSlotHours.find((hour) => canSessionFit(hour, duration));
      if (fallbackStart !== undefined) {
        setSelectedSlot(toHourLabel(fallbackStart));
      }
    }
  }, [duration, selectedStartHour]);

  useEffect(() => {
    if (!bookingStep) return;
    const zone =
      bookingStep === 'date'
        ? dateZoneRef.current
        : bookingStep === 'extras'
          ? extrasZoneRef.current
          : detailsZoneRef.current;
    if (!zone) return;
    zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    zone.focus({ preventScroll: true });
  }, [bookingStep]);

  useEffect(() => {
    if (!confirmation || !confirmationRef.current) return;
    confirmationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    confirmationRef.current.focus({ preventScroll: true });
  }, [confirmation]);

  function zoneClassName(zone: BookingStep): string {
    const zoneIndex = bookingSteps.indexOf(zone);
    const activeIndex = bookingStep === null ? -1 : bookingSteps.indexOf(bookingStep);
    const classes = ['booking-focus-zone'];
    if (zoneIndex === activeIndex) classes.push('booking-focus-active');
    if (activeIndex >= 0 && zoneIndex > activeIndex) classes.push('booking-focus-dimmed');
    return classes.join(' ');
  }

  function toggleExtra(extraId: string) {
    setSelectedExtras((current) =>
      current.includes(extraId)
        ? current.filter((id) => id !== extraId)
        : [...current, extraId],
    );
    setBookingStep('details');
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
      setBackendOffline(false);

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

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <div className="admin-beta-banner" role="note">
        <span className="admin-beta-badge">🔵 Em BETA</span>
        <span className="admin-beta-text">A plataforma ainda se encontra em BETA. Estamos a refinar funcionalidades e poderá encontrar erros ou alterações. Obrigado pela compreensão.</span>
      </div>

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
        <section className="rooms-grid">
          {localizedRooms.map((room) => {
            const isSelected = room.id === selectedRoom.id;

            return (
              <article
                key={room.id}
                className={`room-card card ${isSelected ? 'room-card-selected' : ''}`}
                style={{ borderColor: isSelected ? room.accent : 'transparent' }}
              >
                <div className="room-card-header">
                  <div>
                    <p className="eyebrow">{room.capacity}</p>
                    <h3>{room.name}</h3>
                  </div>
                  <strong>
                    {currency.format(room.pricePerMemberHour === null || room.pricePerMemberHour === undefined ? pricing.perMemberPerHour : Number(room.pricePerMemberHour))}
                    {translations.rooms.rate}
                  </strong>
                </div>
                <p>{room.vibe}</p>
                <ul className="gear-list">
                  {room.gear.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setBookingStep('date');
                  }}
                >
                  {isSelected ? translations.rooms.selected : translations.rooms.choose}
                </button>
              </article>
            );
          })}
        </section>

        <section className="booking-grid">
          <form className="card booking-form" onSubmit={handleSubmit} autoComplete="on">
            <div className="section-heading">
              <h2>{translations.booking.title}</h2>
            </div>

            {confirmation ? (
              <div
                className="confirmation-banner"
                role="status"
                aria-live="polite"
                tabIndex={-1}
                ref={confirmationRef}
              >
                <span className="confirmation-banner-badge">{translations.booking.pendingBadge}</span>
                <p className="confirmation-banner-message">{confirmation}</p>
                <div className="confirmation-id-row">
                  <span>{translations.booking.bookingIdLabel ?? 'N.º da reserva:'}</span>
                  <strong className="confirmation-id-value">{confirmationId}</strong>
                </div>
                <p className="confirmation-id-note">
                  {translations.booking.bookingIdNote ?? 'Guarda este numero para futuras referencias.'}
                </p>
              </div>
            ) : null}

            <div className={`field-row ${zoneClassName('date')}`} ref={dateZoneRef} tabIndex={-1}>
              <label className="calendar-field">
                {translations.booking.dateLabel}
                <div className="calendar-picker">
                  <div className="calendar-toolbar">
                    <button
                      type="button"
                      className="secondary-button calendar-nav"
                      onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                    >
                      {translations.booking.calendarPrev}
                    </button>
                    <strong>{monthLabel}</strong>
                    <button
                      type="button"
                      className="secondary-button calendar-nav"
                      onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                    >
                      {translations.booking.calendarNext}
                    </button>
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
                      const isOccupied = occupiedDatesForSelectedRoom.has(isoDate);
                      const isSelected = isoDate === selectedDate;
                      const isDisabled = !inCurrentMonth || isPast || isOccupied;

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
                            setBookingStep('extras');
                          }}
                        >
                          <span>{date.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="calendar-hint">{translations.booking.calendarOccupiedHint}</p>
                </div>
              </label>

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
                      </option>
                    ))}
                  </select>
                </label>

                <div className="starttime-field">
                  <span className="field-label">{translations.booking.startTimeLabel}</span>
                  <div className="slot-grid slot-grid-compact">
                    {startSlotHours.map((hour) => {
                      const slotLabel = toHourLabel(hour);
                      const isActive = selectedSlot === slotLabel;
                      const isUnavailable = !canSessionFit(hour, duration);
                      const slotStateLabel = isUnavailable
                        ? translations.slots.unavailable
                        : translations.slots.open;

                      return (
                        <button
                          key={slotLabel}
                          type="button"
                          className={`slot-button ${isActive ? 'slot-button-active' : ''}`}
                          disabled={isUnavailable}
                          onClick={() => setSelectedSlot(slotLabel)}
                          aria-label={`${slotLabel} - ${slotStateLabel}`}
                          title={`${slotLabel} - ${slotStateLabel}`}
                        >
                          <strong>{slotLabel}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className={zoneClassName('extras')} ref={extrasZoneRef} tabIndex={-1}>
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
            </div>

            <div className={zoneClassName('details')} ref={detailsZoneRef} tabIndex={-1}>
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
            </div>

            <button className="primary-button" type="submit" disabled={isSubmitting || backendOffline}>
              {isSubmitting ? translations.booking.submitting : translations.booking.submit}
            </button>
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

            <div className="pending-box" role="status" aria-live="polite">
              <strong>{translations.booking.pendingBadge}</strong>
              <p>{translations.booking.pendingDescription}</p>
            </div>

            {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
