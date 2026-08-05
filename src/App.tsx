import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Locale, useI18n } from './i18n';

type RoomDefinition = {
  id: 'sala-red' | 'sala-grey';
  maxMembers: number;
  accent: string;
};

type ExtraId = 'engineer' | 'recording' | 'backline';

type Extra = {
  id: ExtraId;
  price: number;
};

type PricingConfig = {
  perMemberPerHour: number;
  extras: Record<ExtraId, number>;
};

type PaymentMethod = 'mbway' | 'on-site';

type BookingForm = {
  bandName: string;
  contactName: string;
  contactPhone: string;
  email: string;
  focus: string;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected';

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

const rooms: RoomDefinition[] = [
  { id: 'sala-red', maxMembers: 6, accent: 'var(--room-red)' },
  { id: 'sala-grey', maxMembers: 5, accent: 'var(--room-grey)' },
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
  const { locale, setLocale, translations } = useI18n();
  const [logoVisible, setLogoVisible] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0].id);
  const [selectedSlot, setSelectedSlot] = useState('18:00');
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(new Date()));
  const [duration, setDuration] = useState(3);
  const [participants, setParticipants] = useState(4);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mbway');
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [selectedExtras, setSelectedExtras] = useState<ExtraId[]>(['engineer']);
  const [form, setForm] = useState<BookingForm>({
    bandName: '',
    contactName: '',
    contactPhone: '',
    email: '',
    focus: '',
  });
  const [confirmation, setConfirmation] = useState<string>('');
  const [confirmationId, setConfirmationId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [teamBookings, setTeamBookings] = useState<TeamBooking[]>([]);

  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [locale],
  );

  const localizedRooms = rooms.map((room) => ({
    ...room,
    ...translations.rooms[room.id],
  }));
  const selectedRoom = localizedRooms.find((room) => room.id === selectedRoomId) ?? localizedRooms[0];
  const maxMembersForSelectedRoom = selectedRoom.maxMembers;
  const participantsOptions = Array.from({ length: maxMembersForSelectedRoom }, (_, index) => index + 1);
  const selectedStartHour = hourLabelToNumber(selectedSlot);
  const extras = useMemo<Extra[]>(
    () => [
      { id: 'engineer', price: pricing.extras.engineer },
      { id: 'recording', price: pricing.extras.recording },
      { id: 'backline', price: pricing.extras.backline },
    ],
    [pricing],
  );
  const availableDurationsForSelectedStart = durations.filter((hours) =>
    canSessionFit(selectedStartHour, hours),
  );
  const occupiedDatesForSelectedRoom = useMemo(
    () =>
      new Set(
        teamBookings
          .filter((booking) => booking.roomId === selectedRoomId && booking.status !== 'rejected')
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
  const paymentMethodLabel =
    paymentMethod === 'mbway'
      ? translations.booking.paymentMbway
      : translations.booking.paymentOnSite;
  const displayDate = formatDateForDisplay(locale, selectedDate);
  const todayIso = getToday();

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
    if (participants > maxMembersForSelectedRoom) {
      setParticipants(maxMembersForSelectedRoom);
    }
  }, [maxMembersForSelectedRoom, participants]);

  function toggleExtra(extraId: ExtraId) {
    setSelectedExtras((current) =>
      current.includes(extraId)
        ? current.filter((id) => id !== extraId)
        : [...current, extraId],
    );
  }

  async function loadTeamBookings() {
    try {
      const response = await fetch('/api/bookings');
      if (!response.ok) {
        throw new Error('Failed to load bookings.');
      }

      const payload = (await response.json()) as { bookings: TeamBooking[] };
      setTeamBookings(payload.bookings);
      setBackendOffline(false);
    } catch (_error) {
      setBackendOffline(true);
    }
  }

  async function loadPricing() {
    try {
      const response = await fetch('/api/pricing');
      if (!response.ok) {
        throw new Error('Failed to load pricing.');
      }

      const payload = (await response.json()) as { pricing: PricingConfig };
      if (payload.pricing) {
        setPricing(payload.pricing);
        setBackendOffline(false);
      }
    } catch (_error) {
      setBackendOffline(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Client-side validation before hitting the network
    const missing: string[] = [];
    if (!form.contactName.trim()) missing.push('contactName');
    if (!form.email.trim()) missing.push('email');
    if (!form.contactPhone.trim()) missing.push('contactPhone');

    if (missing.length > 0) {
      setErrorMessage(translations.booking.validationError ?? 'Preenche os campos obrigatorios.');
      // Focus the first missing field
      const firstEl = document.getElementById(`field-${missing[0]}`);
      if (firstEl) firstEl.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          date: selectedDate,
          time: selectedSlot,
          duration,
          extras: selectedExtras,
          bandName: form.bandName,
          contactName: form.contactName,
            contactPhone: form.contactPhone,
          email: form.email,
          focus: form.focus,
          locale,
          participants,
          paymentMethod,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create booking.');
      }

      const payload = (await response.json()) as { booking: TeamBooking };

      const message = formatTemplate(translations.booking.confirmation, {
        bandName: form.bandName || translations.booking.confirmationFallback,
        roomName: selectedRoom.name,
        date: displayDate,
        time: selectedSlot,
        duration,
        paymentMethod: paymentMethodLabel,
      });

      setConfirmation(message);
      setConfirmationId(payload.booking.id);
      await loadTeamBookings();
    } catch (_error) {
      setBackendOffline(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar">
        <div className="brand-wrap">
          {logoVisible ? (
            <img
              className="brand-logo"
              src="/feedbook-logo.png"
              alt="FeedBook Sessions"
              onError={() => setLogoVisible(false)}
            />
          ) : null}
          <p className="eyebrow">{translations.meta.brand}</p>
          <h1>{translations.topbar.title}</h1>
        </div>

        <div className="topbar-tools">
          <div className="topbar-note">
            {translations.topbar.notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>

          <div className="language-switcher" aria-label={translations.topbar.languageLabel}>
            <span>{translations.topbar.languageLabel}</span>
            <div className="language-switcher-buttons">
              {(['pt-PT', 'en'] as Locale[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={`language-button ${locale === language ? 'language-button-active' : ''}`}
                  onClick={() => setLocale(language)}
                >
                  {translations.languages[language]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="hero card">
          <div className="hero-copy">
            <p className="eyebrow">{translations.hero.eyebrow}</p>
            <h2>{translations.hero.title}</h2>
            <p className="lede">{translations.hero.lede}</p>

            <div className="hero-metrics">
              {translations.hero.metrics.map((metric) => (
                <article key={metric.label}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              ))}
            </div>
          </div>

          <aside className="hero-panel">
            <p>{translations.hero.panelTitle}</p>
            <ul>
              {translations.hero.panelItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </section>

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
                    {currency.format(pricing.perMemberPerHour)}
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
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  {isSelected ? translations.rooms.selected : translations.rooms.choose}
                </button>
              </article>
            );
          })}
        </section>

        <section className="booking-grid">
          <form className="card booking-form" onSubmit={handleSubmit}>
            <div className="section-heading">
              <p className="eyebrow">{translations.booking.eyebrow}</p>
              <h2>{translations.booking.title}</h2>
            </div>

            <label>
              {translations.booking.roomLabel}
              <select
                value={selectedRoomId}
                onChange={(event) => setSelectedRoomId(event.target.value as RoomDefinition['id'])}
              >
                {localizedRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {translations.booking.paymentMethodLabel}
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              >
                <option value="mbway">{translations.booking.paymentMbway}</option>
                <option value="on-site">{translations.booking.paymentOnSite}</option>
              </select>
            </label>

            <label>
              {translations.booking.participantsLabel}
              <select
                value={participants}
                onChange={(event) => setParticipants(Number(event.target.value))}
              >
                {participantsOptions.map((value) => (
                  <option key={value} value={value}>
                    {formatTemplate(translations.booking.participantsOption, { count: value })}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
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
                          onClick={() => setSelectedDate(isoDate)}
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

            <div>
              <span className="field-label">{translations.booking.addonsLabel}</span>
              <div className="extras-list">
                {extras.map((extra) => (
                  <label key={extra.id} className="extra-toggle">
                    <input
                      type="checkbox"
                      checked={selectedExtras.includes(extra.id)}
                      onChange={() => toggleExtra(extra.id)}
                    />
                    <span>{translations.extras[extra.id]}</span>
                    <strong>{currency.format(extra.price)}</strong>
                  </label>
                ))}
              </div>
            </div>

            <label>
              {translations.booking.bandNameLabel}
              <input
                type="text"
                placeholder={translations.booking.bandNamePlaceholder}
                value={form.bandName}
                onChange={(event) => setForm({ ...form, bandName: event.target.value })}
              />
            </label>

            <div className="field-row">
              <label>
                {translations.booking.contactNameLabel} <span className="required-star">*</span>
                <input
                  id="field-contactName"
                  type="text"
                  required
                  aria-required="true"
                  placeholder={translations.booking.contactNamePlaceholder}
                  value={form.contactName}
                  onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                />
              </label>

              <label>
                {translations.booking.contactPhoneLabel} <span className="required-star">*</span>
                <input
                  id="field-contactPhone"
                  type="tel"
                  required
                  aria-required="true"
                  placeholder={translations.booking.contactPhonePlaceholder}
                  value={form.contactPhone}
                  onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
                />
              </label>

              <label>
                {translations.booking.emailLabel} <span className="required-star">*</span>
                <input
                  id="field-email"
                  type="email"
                  required
                  aria-required="true"
                  placeholder={translations.booking.emailPlaceholder}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>
            </div>

            <label>
              {translations.booking.focusLabel}
              <textarea
                rows={4}
                placeholder={translations.booking.focusPlaceholder}
                value={form.focus}
                onChange={(event) => setForm({ ...form, focus: event.target.value })}
              />
            </label>

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

            {confirmation ? (
              <div className="confirmation-box">
                <p className="confirmation">{confirmation}</p>
                <div className="confirmation-id-row">
                  <span>{translations.booking.bookingIdLabel ?? 'N.\u00ba da reserva:'}</span>
                  <strong className="confirmation-id-value">{confirmationId}</strong>
                </div>
                <p className="confirmation-id-note">
                  {translations.booking.bookingIdNote ?? 'Guarda este numero para futuras referencias.'}
                </p>
              </div>
            ) : null}
            {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
