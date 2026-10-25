import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, ChevronDown, ChevronUp, Download, Globe, LoaderCircle, PlayCircle } from 'lucide-react';
import { toPng } from 'html-to-image';
import * as api from './api';
import { Locale, useI18n } from './i18n';
import LanguageSwitcher from './components/ui/LanguageSwitcher';
import { calculateRehearsalPrice, resolveRoomPricePerHour } from './helpers/rehearsalPricing';
import CookieConsent from './components/ui/CookieConsent';
import AboutSection from './components/ui/AboutSection';
import GlobalLoading from './components/ui/GlobalLoading';
import { useImagesReady } from './hooks/useImageReady';

type RoomDefinition = api.ApiRoom;

type Extra = {
  id: string;
  price: number;
  label: string;
  description: string;
};

type PricingConfig = {
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

type BookingConfirmationDetails = {
  roomName: string;
  date: string;
  time: string;
  duration: number;
  customerMessage: string;
  totalAmount: number;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

// Fluxo normal de marcação em três passos (Issues #4 e #37):
// Sala → Data/Hora/Duração + Extras → Dados. A confirmação é o ecrã final.
type BookingStep = 'room' | 'date' | 'details' | 'confirmation';

const bookingSteps: BookingStep[] = ['room', 'date', 'details', 'confirmation'];

type TeamBooking = {
  id: string;
  roomId: RoomDefinition['id'];
  status: BookingStatus;
  roomName: string;
  date: string;
  time: string;
  duration: number;
  bandName?: string | null;
  contactName?: string;
  email?: string;
  participants?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: string;
};

// Links do rodapé (Issue #10). O texto visível é minimalista — nunca mostra
// o endereço completo; só o ícone + label curta.
// Nota: o lucide-react (nesta versão) já não inclui ícones de marcas
// (Instagram/YouTube), por isso usamos equivalentes genéricos.
const FOOTER_LINKS = [
  { id: 'site', href: 'https://www.feedbackproductions.pt/', labelKey: 'site' as const, Icon: Globe },
  { id: 'instagram', href: 'https://www.instagram.com/feedbackproductions/', labelKey: 'instagram' as const, Icon: Camera },
  { id: 'youtube', href: 'https://www.youtube.com/playlist?list=PLaTuYjte7L3UDZq7x0etlaHAkDmO7LXAX', labelKey: 'youtube' as const, Icon: PlayCircle },
];

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
    longDescription: '',
    longDescriptionEn: '',
    accent: 'var(--room-red)',
    active: true,
    bookingMode: 'booking',
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
    longDescription: '',
    longDescriptionEn: '',
    accent: 'var(--room-grey)',
    active: true,
    bookingMode: 'booking',
  },
];

const lastStartHour = 23;
const studioClosingHour = 25;

const startSlotHours = Array.from(
  { length: (lastStartHour - 10) * 2 + 1 },
  (_, index) => 10 + index * 0.5,
);


const defaultPricing: PricingConfig = {
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

// === Validação dos campos obrigatórios do contacto (Issue #5) ===
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// Telemóvel: 9 a 15 dígitos, ignorando espaços, parênteses e travessões.
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

type ContactField = 'contactName' | 'email' | 'contactPhone';

function contactFieldError(field: ContactField, value: string): string | null {
  if (field === 'contactName' && !value.trim()) return 'required';
  if (field === 'email' && !isValidEmail(value)) return 'email';
  if (field === 'contactPhone' && !isValidPhone(value)) return 'phone';
  return null;
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
// Antecedência mínima (em minutos) para poder marcar um ensaio.
const MIN_LEAD_MINUTES = 60;

function isSlotAvailable(
  slotLabel: string,
  duration: number,
  date: string,
  roomId: string,
  bookings: TeamBooking[],
): boolean {
  if (!canSessionFit(hourLabelToNumber(slotLabel), duration)) return false;

  // Exige 1 hora de antecedência sobre a hora atual (ex.: às 18:00 só é
  // possível marcar a partir das 19:00). Compara timestamps reais, à prova de
  // fuso: para dias futuros o instante do slot já fica naturalmente acima do limite.
  const slotStart = new Date(`${date}T${slotLabel}:00`);
  if (!Number.isNaN(slotStart.getTime())) {
    const earliestStart = Date.now() + MIN_LEAD_MINUTES * 60 * 1000;
    if (slotStart.getTime() < earliestStart) return false;
  }

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

function formatPublicBookingReference(bookingId: string, roomName: string): string {
  const roomWords = roomName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const distinctiveRoomName = roomWords.find((word) => !['sala', 'room'].includes(word.toLowerCase()))
    ?? roomWords[0]
    ?? 'X';
  const roomInitial = distinctiveRoomName.replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || 'X';
  const shortId = bookingId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase().padEnd(6, '0');

  return `FB-${roomInitial}-${shortId}`;
}

function formatPublicRoomName(roomName: string): string {
  return roomName.replace(/^(sala|room)\s+/i, '').trim() || roomName;
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
  const [confirmationDetails, setConfirmationDetails] = useState<BookingConfirmationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingConfirmation, setIsSavingConfirmation] = useState(false);
  const [confirmationSaveError, setConfirmationSaveError] = useState('');
  const [backendOffline, setBackendOffline] = useState(false);
const [dataReady, setDataReady] = useState(false);
const [minDelayDone, setMinDelayDone] = useState(false);
  const [teamBookings, setTeamBookings] = useState<TeamBooking[]>([]);
  const [bookingStep, setBookingStep] = useState<BookingStep>('room');

  const [expandedRoomIds, setExpandedRoomIds] = useState<Record<string, boolean>>({});

  const toggleRoom = (roomId: string) => {
    setExpandedRoomIds(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };
  const [betaEnabled, setBetaEnabled] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Campos de contacto controlados para validação em tempo real (Issue #5).
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [email, setEmail] = useState('');
  // Só mostra erro de um campo depois de interagir/submeter (evita "vermelho" inicial).
  const [showContactErrors, setShowContactErrors] = useState(false);
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
      longDescription: isPt ? room.longDescription : room.longDescriptionEn,
      isExpanded: expandedRoomIds[room.id] || false,
    };
  });
  const selectedRoom = localizedRooms.find((room) => room.id === selectedRoomId) ?? localizedRooms[0];
  const selectedRoomPricePerHour = resolveRoomPricePerHour(selectedRoom.pricePerMemberHour);
  const selectedStartHour = hourLabelToNumber(selectedSlot);
  // O slot escolhido continua válido? (antecedência mínima, fecho e colisões).
  // Usado para bloquear reservas em horários já passados. (Issue #15)
  const selectedSlotAvailable = isSlotAvailable(
    selectedSlot,
    duration,
    selectedDate,
    selectedRoomId,
    teamBookings,
  );
  // Todos os campos de contacto obrigatórios são válidos? (Issue #5)
  const contactValid =
    contactFieldError('contactName', contactName) === null &&
    contactFieldError('email', email) === null &&
    contactFieldError('contactPhone', contactPhone) === null;
  const extras = useMemo<Extra[]>(
    () =>
      Object.entries(pricing.extras ?? {}).map(([id, price]) => {
        const catalog = serviceCatalog.find((service) => service.id === id);
        const legacyLabel = (translations.extras as Record<string, string>)[id];
        const label = catalog ? (locale.startsWith('pt') ? catalog.name : catalog.nameEn || catalog.name) : legacyLabel || id;
        const description = catalog ? (locale.startsWith('pt') ? catalog.description : catalog.descriptionEn || catalog.description) : '';
        return { id, price: Number(price || 0), label, description };
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
  const displayDate = formatDateForDisplay(locale, selectedDate);
  const todayIso = getToday();
  const selectedRoomContactOnly = selectedRoom.bookingMode === 'contact';

  const criticalImageUrls = useMemo(() => {
    const urls: string[] = ['/loadingdb.png', '/feedbook-logo.png'];
    rooms.forEach((room) => {
      if (room.imageUrl) urls.push(room.imageUrl);
    });
    return urls;
  }, [rooms]);
  const imagesReady = useImagesReady(criticalImageUrls);
  const isReady = dataReady && imagesReady && minDelayDone;

  useEffect(() => {
    if (rooms.length > 0 && !rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    setSelectedExtras((current) => current.filter((id) => id in (pricing.extras ?? {})));
  }, [pricing]);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 800);
    void Promise.all([loadTeamBookings(), loadPricing()])
      .catch(() => setBackendOffline(true))
      .finally(() => setDataReady(true));
    return () => clearTimeout(timer);
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
    if (selectedRoomContactOnly) {
      setBookingStep((current) => (current === 'room' ? 'details' : current));
      return;
    }
    setBookingStep((current) => {
      const index = bookingSteps.indexOf(current);
      const next = bookingSteps[index + 1];
      return next && next !== 'confirmation' ? next : current;
    });
  }

  function goToPreviousStep() {
    if (selectedRoomContactOnly) {
      setBookingStep((current) => (current === 'details' ? 'room' : current));
      return;
    }
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

  async function handleSaveConfirmationImage() {
    if (!confirmationRef.current || !confirmationId || isSavingConfirmation) return;

    setIsSavingConfirmation(true);
    setConfirmationSaveError('');

    try {
      await document.fonts?.ready;
      const dataUrl = await toPng(confirmationRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#07110c',
      });
      const link = document.createElement('a');
      link.download = `feedbook-${confirmationId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (_error) {
      setConfirmationSaveError(translations.booking.saveCardError);
    } finally {
      setIsSavingConfirmation(false);
    }
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
      contactName,
      contactPhone,
      email,
      focus: String(rawData.get('focus') || ''),
    };

    // Client-side validation before hitting the network (Issue #5)
    // Valida obrigatoriedade + formato de todos os campos críticos de contacto.
    const invalidFields: ContactField[] = (
      ['contactName', 'email', 'contactPhone'] as ContactField[]
    ).filter((field) => contactFieldError(field, draftForm[field]) !== null);

    if (invalidFields.length > 0) {
      // Revela os erros por campo e faz foco no primeiro inválido.
      setShowContactErrors(true);
      setErrorMessage(translations.booking.validationError ?? 'Preenche os campos obrigatorios.');
      const firstEl = document.getElementById(`field-${invalidFields[0]}`);
      if (firstEl) firstEl.focus();
      return;
    }

    setShowContactErrors(false);

    if (!acceptedTerms) {
      setErrorMessage(translations.booking.termsError ?? 'Tens de aceitar os Termos e Condicoes.');
      const termsEl = document.getElementById('field-terms');
      if (termsEl) termsEl.focus();
      return;
    }

    // Bloqueia reservas em horários já passados (ou slots entretanto ocupados):
    // garante que, mesmo sem mexer nos dropdowns, não se submete um slot inválido. (Issue #15)
    if (!selectedRoomContactOnly && !selectedSlotAvailable) {
      setErrorMessage(translations.booking.slotUnavailableError);
      setBookingStep('date');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setBackendOffline(false);

    try {
      let confirmationRequestId = '';
      let confirmationAmount = 0;

      if (selectedRoomContactOnly) {
        confirmationRequestId = (await api.createContactRequest({
            roomId: selectedRoom.id,
            bandName: draftForm.bandName,
            contactName: draftForm.contactName,
            contactPhone: draftForm.contactPhone,
            email: draftForm.email,
            message: draftForm.focus,
          })).contactRequest.id;
      } else {
        const { booking } = await api.createBooking({
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
        confirmationRequestId = booking.id;
        const fallbackAmount = calculateRehearsalPrice(duration, selectedRoomPricePerHour)
          + extras
            .filter((extra) => selectedExtras.includes(extra.id))
            .reduce((sum, extra) => sum + extra.price, 0);
        confirmationAmount = Number.isFinite(Number(booking.amount)) && booking.amount !== null
          ? Number(booking.amount)
          : fallbackAmount;
      }

      const message = selectedRoomContactOnly
        ? `Recebemos o teu pedido de contacto para ${selectedRoom.name}. A nossa equipa irá contactar-te em breve.`
        : translations.booking.confirmation;

      setConfirmation(message);
      setConfirmationId(formatPublicBookingReference(confirmationRequestId, selectedRoom.name));
      setConfirmationExtras(selectedRoomContactOnly ? [] : extras
        .filter((extra) => selectedExtras.includes(extra.id))
        .map((extra) => ({ id: extra.id, label: extra.label, price: extra.price })));
      setConfirmationDetails(selectedRoomContactOnly ? null : {
        roomName: formatPublicRoomName(selectedRoom.name),
        date: displayDate,
        time: selectedSlot,
        duration,
        customerMessage: draftForm.focus.trim(),
        totalAmount: confirmationAmount,
      });
      setConfirmationSaveError('');
      setBackendOffline(false);
      setBookingStep('confirmation');

      if (!selectedRoomContactOnly) await loadTeamBookings();
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

  // Estado global do badge "Beta" (Supabase), partilhado por todos os
  // dispositivos — já não depende do localStorage, que era por-browser.
  useEffect(() => {
    let active = true;
    api
      .getAppSettings()
      .then((settings) => {
        if (active) setBetaEnabled(settings.betaEnabled);
      })
      .catch(() => {
        // Em falha de rede/BD mantém o valor por omissão (badge visível).
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <GlobalLoading visible={!isReady} />
      {isReady ? (
        <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      {betaEnabled ? (
        <div className="admin-beta-banner beta-only" role="note">
          <span className="admin-beta-badge">Beta</span>
        </div>
      ) : null}

      <header className="topbar">
        <a className="brand-wrap" href="/" aria-label="Ir para a pagina inicial">
          {logoVisible ? (
            <img
              className="brand-logo"
              src="/feedbook-logo.png"
              alt="Feedback - Ensaios"
              onError={() => setLogoVisible(false)}
            />
          ) : null}
        </a>
        
      <div className="topbar-tools">
          <LanguageSwitcher />
        </div>
      </header>

      <main className="layout">
        {bookingStep !== 'confirmation' ? (
          <div className="booking-heading">
            <h1 className={bookingStep === 'details' ? 'booking-heading-single-line' : undefined}>
              {bookingStep === 'room'
                ? translations.booking.roomTitle
                : bookingStep === 'date'
                  ? translations.booking.dateTitle
                  : translations.booking.detailsTitle}
            </h1>
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
                    setBookingStep(room.bookingMode === 'contact' ? 'details' : 'date');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRoomId(room.id);
                      setBookingStep(room.bookingMode === 'contact' ? 'details' : 'date');
                    }
                  }}
                >
                  {room.imageUrl ? (
                    <img className="room-card-image" src={room.imageUrl} alt={room.name} loading="lazy" />
                  ) : null}
                  <div className="room-card-header">
                    <div>
                      <p className="eyebrow">{room.capacity}</p>
                      <h3>
                        {(() => {
                          const parts = room.name.trim().split(/\s+/);
                          const prefix = parts[0] || '';
                          const rest = parts.slice(1).join(' ');
                          const isRoomPrefix = /^(sala|room)$/i.test(prefix);
                          if (!isRoomPrefix || !rest) {
                            return <span style={{ color: room.accent }}>{room.name}</span>;
                          }
                          return (
                            <>
                              <span>{prefix}</span>{' '}
                              <span style={{ color: room.accent }}>{rest}</span>
                            </>
                          );
                        })()}
                      </h3>
                    </div>
                    <strong>
                      {room.bookingMode === 'contact'
                        ? translations.rooms.contactOnly
                        : <>{translations.rooms.priceFrom} {currency.format(resolveRoomPricePerHour(room.pricePerMemberHour))}</>}
                    </strong>
                  </div>
                  <p>{room.vibe}</p>
                  <button
                      type="button"
                      className="room-card-summary"
                      aria-expanded={room.isExpanded}
                      aria-controls={`room-details-${room.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRoom(room.id);
                      }}
                    >
                      <span>{room.isExpanded ? translations.about.collapse : translations.about.expand}</span>
                      {room.isExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                    {room.isExpanded ? (
                      <div id={`room-details-${room.id}`} className="room-card-details">
                        {room.longDescription ? (
                          <p className="room-card-long-text">{room.longDescription}</p>
                        ) : null}
                        <ul className="gear-list">
                          {room.gear.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  <span className="room-card-arrow">&gt;</span>
                </article>
              );
            })}
          </section>
        ) : null}

        {bookingStep === 'date' || bookingStep === 'details' ? (
          <section className="booking-grid">
            <form className="card booking-form" onSubmit={handleSubmit} autoComplete="off">
              <button type="button" className="booking-top-back" onClick={goToPreviousStep}>
                <ArrowLeft size={18} aria-hidden="true" />
                <span>{translations.booking.back}</span>
              </button>
            {bookingStep === 'date' ? (
              <div className="booking-step">
              <div className="field-row booking-datetime-row">
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

              <div className="booking-schedule-column">
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

                <div className="duration-lead">
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
                </div>
              </div>
              </div>

              {!selectedSlotAvailable ? (
                <div className="offline-banner" role="alert">
                  <span>⚠ {translations.booking.slotUnavailableError}</span>
                </div>
              ) : null}

              {/* Issue #37: os extras ficam no mesmo passo, por baixo de dia/hora/duração. */}
              <div className="booking-extras-block">
                <span className="field-label">{translations.booking.addonsLabel}</span>
                <div className="extras-list">
                  {extras.map((extra) => (
                    <label key={extra.id} className="extra-toggle">
                      <input
                        type="checkbox"
                        checked={selectedExtras.includes(extra.id)}
                        onChange={() => toggleExtra(extra.id)}
                      />
                      <span className="admin-user-badge admin-service-name-badge">{extra.label}</span>
                      {extra.description ? <small className="extra-description">{extra.description}</small> : null}
                      <strong>{currency.format(extra.price)}</strong>
                    </label>
                  ))}
                </div>
              </div>

              <div className="booking-nav booking-nav-end">
                <button
                  type="button"
                  className="primary-button"
                  onClick={goToNextStep}
                  disabled={!selectedSlotAvailable}
                >
                  {translations.booking.next}
                </button>
              </div>
              </div>
            ) : null}

            {bookingStep === 'details' ? (
              <div className="booking-step">
                <div className="booking-summary">
                  <span className="field-label">{translations.booking.summaryTitle}</span>

                  <dl className="booking-summary-list">
                    <div>
                      <dt>{translations.rooms.selected}</dt>
                      <dd>
                        <strong
                          className={`admin-user-badge admin-room-name-badge${selectedRoom.accent.includes('grey') ? ' admin-room-name-badge-grey' : ''}`}
                          style={{ backgroundColor: selectedRoom.accent, borderColor: selectedRoom.accent }}
                        >
                          {selectedRoom.name}
                        </strong>
                      </dd>
                    </div>
                    {!selectedRoomContactOnly ? (
                      <>
                        <div>
                          <dt>{translations.summary.date}</dt>
                          <dd>{displayDate}</dd>
                        </div>
                        <div>
                          <dt>{translations.summary.startTime}</dt>
                          <dd>{selectedSlot}</dd>
                        </div>
                        <div>
                          <dt>{translations.summary.duration}</dt>
                          <dd>{formatTemplate(translations.summary.hours, { count: duration })}</dd>
                        </div>
                      </>
                    ) : null}
                      <div>
                        <dt>{translations.summary.addons}</dt>
                        <dd>
                          {selectedExtras.length > 0
                            ? extras
                              .filter((extra) => selectedExtras.includes(extra.id))
                              .map((extra) => (
                                <strong key={extra.id} className="admin-user-badge admin-service-name-badge">
                                  {extra.label}
                                </strong>
                              ))
                            : translations.booking.noExtras}
                        </dd>
                      </div>
                    </dl>
                  {selectedRoomContactOnly ? (
                    <p className="summary-copy">{translations.booking.contactSummary}</p>
                  ) : null}
                </div>
              <label>
                {translations.booking.bandNameLabel}
                <input
                  id="field-bandName"
                  name="bandName"
                  type="text"
                  autoComplete="off"
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
                    autoComplete="off"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    onBlur={() => setShowContactErrors(true)}
                    className={showContactErrors && contactFieldError('contactName', contactName) ? 'field-error' : undefined}
                    aria-invalid={showContactErrors && contactFieldError('contactName', contactName) ? true : undefined}
                  />
                  {showContactErrors && contactFieldError('contactName', contactName) ? (
                    <span className="field-error-text" role="alert">
                      {translations.booking.requiredError}
                    </span>
                  ) : null}
                </label>

                <label>
                  {translations.booking.contactPhoneLabel} <span className="required-star">*</span>
                  <input
                    id="field-contactPhone"
                    name="tel"
                    type="tel"
                    required
                    aria-required="true"
                    autoComplete="off"
                    inputMode="tel"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    onBlur={() => setShowContactErrors(true)}
                    className={showContactErrors && contactFieldError('contactPhone', contactPhone) ? 'field-error' : undefined}
                    aria-invalid={showContactErrors && contactFieldError('contactPhone', contactPhone) ? true : undefined}
                  />
                  {showContactErrors && contactFieldError('contactPhone', contactPhone) ? (
                    <span className="field-error-text" role="alert">
                      {contactPhone.trim()
                        ? translations.booking.contactPhoneError
                        : translations.booking.requiredError}
                    </span>
                  ) : null}
                </label>

                <label>
                  {translations.booking.emailLabel} <span className="required-star">*</span>
                  <input
                    id="field-email"
                    name="email"
                    type="email"
                    required
                    aria-required="true"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setShowContactErrors(true)}
                    className={showContactErrors && contactFieldError('email', email) ? 'field-error' : undefined}
                    aria-invalid={showContactErrors && contactFieldError('email', email) ? true : undefined}
                  />
                  {showContactErrors && contactFieldError('email', email) ? (
                    <span className="field-error-text" role="alert">
                      {email.trim()
                        ? translations.booking.contactEmailError
                        : translations.booking.requiredError}
                    </span>
                  ) : null}
                </label>
              </div>

              <label>
                {translations.booking.focusLabel}
                <textarea
                  id="field-focus"
                  name="focus"
                  rows={4}
                  autoComplete="off"
                />
              </label>

              <div className="booking-terms">
                <details className="booking-terms-details">
                  <summary>{translations.booking.termsTitle}</summary>
                  <div className="booking-terms-body">
                    <p className="booking-terms-subtitle">{translations.booking.termsSubtitle}</p>
                    <p>{translations.booking.termsIntro}</p>
                    <ul>
                      {translations.booking.termsItems.map((item, index) => (
                        <li key={index}>
                          <strong>{item.term}</strong> — {item.text}
                        </li>
                      ))}
                    </ul>
                    <p className="booking-terms-footer">{translations.booking.termsFooter}</p>
                  </div>
                </details>
                <label className="booking-terms-checkbox">
                  <input
                    id="field-terms"
                    name="terms"
                    type="checkbox"
                    required
                    aria-required="true"
                    autoComplete="off"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                  />
                  <span>
                    {translations.booking.termsAcceptLabel}{' '}
                    <span className="required-star">*</span>
                  </span>
                </label>
              </div>

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

              <div className="booking-nav booking-nav-end">
                <button className="primary-button" type="submit" disabled={isSubmitting || backendOffline || !acceptedTerms || !contactValid}>
                  {isSubmitting ? translations.booking.submitting : (selectedRoomContactOnly ? translations.booking.submitContact : translations.booking.submit)}
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
                <span className="confirmation-banner-badge">{selectedRoomContactOnly ? 'Aguarda!' : translations.booking.pendingBadge}</span>
                <p className="confirmation-banner-message">{confirmation}</p>
                {!selectedRoomContactOnly && confirmationDetails && (
                  <>
                    <dl className="confirmation-details-grid">
                      <div>
                        <dt>{translations.booking.confirmationRoomLabel}</dt>
                        <dd>{confirmationDetails.roomName}</dd>
                      </div>
                      <div>
                        <dt>{translations.booking.dateLabel}</dt>
                        <dd>{confirmationDetails.date}</dd>
                      </div>
                      <div>
                        <dt>{translations.booking.startTimeLabel}</dt>
                        <dd>{confirmationDetails.time}</dd>
                      </div>
                      <div>
                        <dt>{translations.booking.durationLabel}</dt>
                        <dd>{formatTemplate(translations.booking.durationOption, { count: confirmationDetails.duration })}</dd>
                      </div>
                    </dl>

                    <section className="confirmation-detail-section" aria-labelledby="confirmation-extras-title">
                      <h3 id="confirmation-extras-title">{translations.booking.addonsLabel}</h3>
                      {confirmationExtras.length > 0 ? (
                        <ul className="confirmation-extras-list">
                          {confirmationExtras.map((extra) => (
                            <li key={extra.id}>
                              <span>{extra.label}</span>
                              <strong>{currency.format(extra.price)}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="confirmation-extras-empty">{translations.booking.noExtras ?? 'Apenas o ensaio'}</p>
                      )}
                    </section>

                    <section className="confirmation-detail-section confirmation-customer-message" aria-labelledby="confirmation-message-title">
                      <h3 id="confirmation-message-title">{translations.booking.customerMessageLabel}</h3>
                      <p>{confirmationDetails.customerMessage || translations.booking.noCustomerMessage}</p>
                    </section>

                    <section className="confirmation-total" aria-label={translations.booking.totalAmountLabel}>
                      <span>{translations.booking.totalAmountLabel}</span>
                      <strong>{currency.format(confirmationDetails.totalAmount)}</strong>
                    </section>
                  </>
                )}
                {!selectedRoomContactOnly && (
                  <section className="confirmation-reference" aria-label={translations.booking.bookingIdLabel}>
                    <span>{translations.booking.bookingIdLabel ?? 'Referência do pedido'}</span>
                    <strong className="confirmation-id-value">{confirmationId}</strong>
                  </section>
                )}
                {!selectedRoomContactOnly && (
                  <p className="confirmation-id-note">
                    {translations.booking.bookingIdNote ?? 'Guarda esta referência até receberes a confirmação.'}
                  </p>
                )}
              </div>
              {!selectedRoomContactOnly && (
                <div className="confirmation-save-actions">
                  <button
                    type="button"
                    className="secondary-button confirmation-save-button"
                    onClick={handleSaveConfirmationImage}
                    disabled={isSavingConfirmation}
                  >
                    {isSavingConfirmation ? (
                      <LoaderCircle className="confirmation-save-spinner" aria-hidden="true" />
                    ) : (
                      <Download aria-hidden="true" />
                    )}
                    {isSavingConfirmation
                      ? translations.booking.savingCard
                      : translations.booking.saveCard}
                  </button>
                  {confirmationSaveError ? (
                    <p className="confirmation-save-error" role="alert">{confirmationSaveError}</p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {bookingStep === 'room' ? <AboutSection /> : null}

      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <nav className="site-footer-links" aria-label={translations.footer.linksLabel}>
            {FOOTER_LINKS.map(({ id, href, labelKey, Icon }) => (
              <a
                key={id}
                className={`site-footer-link site-footer-link-${id}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{translations.footer[labelKey]}</span>
              </a>
            ))}
          </nav>
          <p className="site-footer-credit">{translations.footer.credit}</p>
        </div>
      </footer>

      <CookieConsent />
        </div>
      ) : null}
    </>
  );
}

export default App;
