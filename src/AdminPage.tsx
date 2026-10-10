import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import { Locale, useI18n } from './i18n';

type Role = api.Role;

type StaffFunction = api.StaffFunction;

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  function: StaffFunction | null;
  createdAt: string;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

type CancelledBy = {
  id: string;
  name: string;
  role: Role;
  at: string;
};

type TeamBooking = {
  id: string;
  roomName: string;
  roomId: string;
  status: BookingStatus;
  date: string;
  time: string;
  duration: number;
  participants?: number;
  bandName: string;
  contactName: string;
  contactPhone?: string;
  email: string;
  paymentMethod?: 'on-site';
  paymentStatus?: string;
  assignedCollaborator?: {
    id: string;
    name: string;
  };
  cancelledBy?: CancelledBy;
};

type PricingConfig = {
  perMemberPerHour: number;
  extras: Record<string, number>;
};

type PricingDraft = {
  perMemberPerHour: string;
  extras: Record<string, string>;
};

type AdminRoom = api.ApiRoom;

type AdminService = api.ApiService;

type RoomFormDraft = {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
  maxMembers: string;
  pricePerMemberHour: string;
  gear: string;
  gearEn: string;
  accent: string;
  active: boolean;
};

type ServiceFormDraft = {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  price: string;
  active: boolean;
};

const emptyRoomForm: RoomFormDraft = {
  id: '',
  name: '',
  description: '',
  descriptionEn: '',
  maxMembers: '4',
  pricePerMemberHour: '',
  gear: '',
  gearEn: '',
  accent: 'var(--room-red)',
  active: true,
};

const emptyServiceForm: ServiceFormDraft = {
  id: '',
  name: '',
  nameEn: '',
  description: '',
  price: '',
  active: true,
};

type NewUserDraft = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
};

type EditUserDraft = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
};

type AuditLogEntry = {
  id: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    role: Role;
  };
};

type AdminPanel = 'bookings' | 'users' | 'pricing' | 'rooms' | 'services' | 'audit';

const TOKEN_KEY = 'feedbook-admin-token';

const roleLabels: Record<Role, string> = {
  superuser: 'Superuser',
  admin: 'Admin',
  collaborator: 'Colab',
  technician: 'Técnico',
};

const defaultPricing: PricingConfig = {
  perMemberPerHour: 3,
  extras: {
    engineer: 24,
    recording: 18,
    backline: 12,
  },
};

function buildPricingDraft(config: PricingConfig): PricingDraft {
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.extras ?? {})) {
    extras[key] = String(value);
  }
  return {
    perMemberPerHour: String(config.perMemberPerHour),
    extras,
  };
}

function roomToForm(room: AdminRoom): RoomFormDraft {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    descriptionEn: room.descriptionEn,
    maxMembers: String(room.maxMembers),
    pricePerMemberHour: room.pricePerMemberHour === null || room.pricePerMemberHour === undefined ? '' : String(room.pricePerMemberHour),
    gear: (room.gear ?? []).join('\n'),
    gearEn: (room.gearEn ?? []).join('\n'),
    accent: room.accent || 'var(--room-red)',
    active: room.active !== false,
  };
}

function serviceToForm(service: AdminService): ServiceFormDraft {
  return {
    id: service.id,
    name: service.name,
    nameEn: service.nameEn,
    description: service.description,
    price: String(service.price),
    active: service.active !== false,
  };
}

function normalizarNumeroWhatsApp(numero: string): string {
  return numero.replace(/\D/g, '');
}

type TipoMensagemWhatsApp = 'confirm' | 'cancel' | 'refund';

function abrirWhatsAppMensagem(booking: TeamBooking, colaboradorNome: string, tipo: TipoMensagemWhatsApp): boolean {
  const numeroNormalizado = normalizarNumeroWhatsApp(booking.contactPhone || '');
  if (!numeroNormalizado) {
    return false;
  }

  const saudacao = `Olá ${booking.contactName || booking.bandName || 'Utilizador'}!`;
  const contexto = [
    `Data: ${booking.date}`,
    `Hora: ${booking.time}`,
    `Sala: ${booking.roomName}`,
  ];

  let corpo = '';
  if (tipo === 'confirm') {
    corpo = [
      `O meu nome é ${colaboradorNome}, e sou eu que vou estar no estúdio.`,
      `O ensaio dos ${booking.bandName || booking.contactName || 'utilizadores'} foi aceite com sucesso.`,
    ].join('\n');
  }

  if (tipo === 'cancel') {
    corpo = [
      `O meu nome é ${colaboradorNome}, da equipa Feedback - Ensaios.`,
      'A tua marcação foi anulada pela equipa.',
      'Se quiseres, ajudamos a reagendar para outro horário.',
    ].join('\n');
  }

  if (tipo === 'refund') {
    corpo = [
      `O meu nome é ${colaboradorNome}, da equipa Feedback - Ensaios.`,
      'Foi registada a devolução do pagamento desta marcação.',
      'Se precisares de ajuda adicional, estamos disponíveis.',
    ].join('\n');
  }

  const mensagem = [saudacao, corpo, ...contexto, 'Obrigado por escolheres o Feedback.'].join('\n');

  const linkWhatsApp = `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensagem)}`;
  window.open(linkWhatsApp, '_blank', 'noopener,noreferrer');
  return true;
}

function consegueAbrirWhatsApp(booking: TeamBooking): boolean {
  return normalizarNumeroWhatsApp(booking.contactPhone || '').length > 0;
}

function AdminPage() {
  const { locale, setLocale, translations } = useI18n();
  const [adminLogoVisible, setAdminLogoVisible] = useState(true);
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('admin@feedbook.local');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');
  const [bookings, setBookings] = useState<TeamBooking[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [pricingDraft, setPricingDraft] = useState<PricingDraft>(buildPricingDraft(defaultPricing));
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [roomForm, setRoomForm] = useState<RoomFormDraft>(emptyRoomForm);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormDraft>(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'collaborator',
  });
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [assignmentByBookingId, setAssignmentByBookingId] = useState<Record<string, string>>({});
  const [bookingSearch, setBookingSearch] = useState('');
  const [activePanel, setActivePanel] = useState<AdminPanel>('bookings');

  const activeBookings = useMemo(
    () => bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed'),
    [bookings],
  );

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    if (!q) return activeBookings;
    return activeBookings.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        (b.bandName || '').toLowerCase().includes(q) ||
        (b.contactName || '').toLowerCase().includes(q),
    );
  }, [activeBookings, bookingSearch]);

  const assignableStaff = useMemo(
    () => users.filter((user) => user.role === 'admin' || user.role === 'collaborator' || user.role === 'technician'),
    [users],
  );

  const canConfirmBookings =
    currentUser?.role === 'superuser' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'collaborator' ||
    currentUser?.role === 'technician';
  const isAdmin = currentUser?.role === 'admin';
  // Dropdown "Perfil": apenas Administradores e Colaboradores.
  // O superuser não é escolhível (é detetado pelo login) e "Técnico" passou para o campo Função.
  const baseRoleOptions: { value: Role; label: string }[] = [
    { value: 'admin', label: 'Administradores' },
    { value: 'collaborator', label: 'Colaboradores' },
  ];
  const selectedRole = editUserDraft ? editUserDraft.role : newUserDraft.role;
  const roleOptions = baseRoleOptions.some((option) => option.value === selectedRole)
    ? baseRoleOptions
    : [...baseRoleOptions, { value: selectedRole, label: roleLabels[selectedRole] }];

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      return;
    }

    setToken(storedToken);
    void restoreSession(storedToken);
  }, []);

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    void Promise.all([
      loadBookings(token),
      loadPricing(),
      loadCatalogs(),
      isAdmin ? loadUsers(token) : Promise.resolve(),
      loadAuditLogs(token),
    ]);
  }, [token, currentUser, isAdmin]);

  useEffect(() => {
    setPricingDraft(buildPricingDraft(pricing));
  }, [pricing]);

  async function restoreSession(sessionToken: string) {
    try {
      const payload = await api.me(sessionToken);
      setCurrentUser(payload.user);
      setAuthError('');
    } catch (_error) {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken('');
      setCurrentUser(null);
    }
  }

  async function loadBookings(sessionToken: string) {
    try {
      const payload = await api.adminBookings(sessionToken, 'future');
      setBookings(payload.bookings as TeamBooking[]);
    } catch (_error) {
      setError('Nao foi possivel carregar as marcacoes.');
    }
  }

  async function loadUsers(sessionToken: string) {
    if (!isAdmin) {
      setUsers([]);
      return;
    }

    try {
      const payload = await api.adminUsers(sessionToken);
      setUsers(payload.users as AuthUser[]);
    } catch (_error) {
      setError('Nao foi possivel carregar utilizadores.');
    }
  }

  async function loadPricing() {
    try {
      const payload = await api.pricing();
      setPricing(payload.pricing);
    } catch (_error) {
      setError('Nao foi possivel carregar precos.');
    }
  }

  async function loadCatalogs() {
    setCatalogLoading(true);
    try {
      const [roomsPayload, servicesPayload] = await Promise.all([
        api.listRooms({ includeInactive: true }),
        api.listServices({ includeInactive: true }),
      ]);
      setRooms(roomsPayload.rooms);
      setServices(servicesPayload.services);
    } catch (_error) {
      setError('Nao foi possivel carregar salas e servicos. Corre o script supabase_rooms_services.sql no Supabase.');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadAuditLogs(sessionToken: string) {
    if (!isAdmin) {
      setAuditLogs([]);
      return;
    }

    try {
      const payload = await api.auditLogs(sessionToken);
      setAuditLogs(payload.auditLogs as AuditLogEntry[]);
    } catch (_error) {
      setError('Nao foi possivel carregar auditoria.');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setError('');

    try {
      const payload = await api.login(loginEmail, loginPassword);
      setToken(payload.token);
      setCurrentUser(payload.user);
      window.localStorage.setItem(TOKEN_KEY, payload.token);
    } catch (error) {
      if (error instanceof Error && error.message) {
        setAuthError(error.message);
      } else {
        setAuthError('Credenciais invalidas. Verifica email e password.');
      }
    }
  }

  function handleLogout() {
    if (token) {
      void api.logout();
    }

    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setCurrentUser(null);
    setBookings([]);
    setUsers([]);
    setAuditLogs([]);
    setNotice('');
    setError('');
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setNotice('');
    setError('');

    try {
      await api.createUser(token, newUserDraft);

      setNewUserDraft({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'collaborator',
      });
      await Promise.all([loadUsers(token), loadAuditLogs(token)]);
      setNotice('Utilizador criado com sucesso.');
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(error.message);
      } else {
        setError('Nao foi possivel criar utilizador.');
      }
    }
  }

  function startEditUser(user: AuthUser) {
    setEditUserDraft({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: '',
      role: user.role,
    });
    setNotice('');
    setError('');
  }

  function cancelEditUser() {
    setEditUserDraft(null);
  }

  async function handleEditUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editUserDraft) {
      return;
    }

    setNotice('');
    setError('');

    try {
      await api.updateUser(token, editUserDraft);

      setEditUserDraft(null);
      await Promise.all([loadUsers(token), loadAuditLogs(token)]);
      setNotice('Utilizador atualizado com sucesso.');
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(error.message);
      } else {
        setError('Nao foi possivel atualizar utilizador.');
      }
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!token) {
      return;
    }

    const confirmed = window.confirm('Apagar este utilizador?');
    if (!confirmed) {
      return;
    }

    setNotice('');
    setError('');

    try {
      await api.deleteUser(token, userId);

      if (editUserDraft?.id === userId) {
        setEditUserDraft(null);
      }

      await Promise.all([loadUsers(token), loadAuditLogs(token)]);
      setNotice('Utilizador apagado com sucesso.');
    } catch (_error) {
      setError('Nao foi possivel apagar utilizador.');
    }
  }

  async function handleSavePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAdmin) {
      return;
    }

    const parsedPerMemberPerHour = Number(pricingDraft.perMemberPerHour);
    const parsedExtras: Record<string, number> = {};
    for (const [key, raw] of Object.entries(pricingDraft.extras ?? {})) {
      parsedExtras[key] = Number(raw);
    }

    const numericValues = [parsedPerMemberPerHour, ...Object.values(parsedExtras)];
    const hasInvalidNumber = numericValues.some((value) => !Number.isFinite(value) || value < 0);

    if (hasInvalidNumber) {
      setError('Valores invalidos. Usa numeros validos.');
      return;
    }

    setNotice('');
    setError('');

    try {
      const payload = await api.updatePricing(token, {
        perMemberPerHour: parsedPerMemberPerHour,
        extras: parsedExtras,
      });

      setPricing(payload.pricing);
      await Promise.all([loadCatalogs(), loadAuditLogs(token)]);
      setNotice('Precos atualizados com sucesso.');
    } catch (_error) {
      setError('Nao foi possivel guardar os precos.');
    }
  }

  function startEditRoom(room: AdminRoom) {
    setEditingRoomId(room.id);
    setRoomForm(roomToForm(room));
    setNotice('');
    setError('');
  }

  function cancelEditRoom() {
    setEditingRoomId(null);
    setRoomForm(emptyRoomForm);
  }

  async function handleSaveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAdmin) return;
    const maxMembers = Number(roomForm.maxMembers);
    const trimmedName = roomForm.name.trim();
    if (!trimmedName) {
      setError('A sala precisa de um nome.');
      return;
    }
    if (!Number.isFinite(maxMembers) || maxMembers <= 0) {
      setError('Capacidade invalida.');
      return;
    }
    const trimmedPrice = roomForm.pricePerMemberHour.trim();
    const pricePerMemberHour = trimmedPrice === '' ? null : Number(trimmedPrice);
    if (pricePerMemberHour !== null && (!Number.isFinite(pricePerMemberHour) || pricePerMemberHour < 0)) {
      setError('Preco da sala invalido.');
      return;
    }
    setNotice('');
    setError('');
    try {
      const draft: api.RoomDraft = {
        id: editingRoomId ?? (roomForm.id.trim() || undefined),
        name: trimmedName,
        description: roomForm.description,
        descriptionEn: roomForm.descriptionEn,
        maxMembers: Math.floor(maxMembers),
        pricePerMemberHour,
        gear: roomForm.gear,
        gearEn: roomForm.gearEn,
        accent: roomForm.accent,
        active: roomForm.active,
      };
      if (editingRoomId) {
        await api.updateRoom(token, editingRoomId, draft);
        setNotice('Sala atualizada com sucesso.');
      } else {
        await api.createRoom(token, draft);
        setNotice('Sala criada com sucesso.');
      }
      cancelEditRoom();
      await Promise.all([loadCatalogs(), loadPricing(), loadAuditLogs(token)]);
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Nao foi possivel guardar a sala.');
    }
  }

  async function handleDeleteRoom(roomId: string) {
    if (!token || !isAdmin) return;
    if (!window.confirm('Apagar esta sala? Se tiver marcacoes, sera arquivada.')) return;
    setNotice('');
    setError('');
    try {
      const payload = await api.deleteRoom(token, roomId);
      if (editingRoomId === roomId) cancelEditRoom();
      await Promise.all([loadCatalogs(), loadAuditLogs(token)]);
      setNotice(payload.message || 'Sala removida.');
    } catch (_error) {
      setError('Nao foi possivel apagar a sala.');
    }
  }

  function startEditService(service: AdminService) {
    setEditingServiceId(service.id);
    setServiceForm(serviceToForm(service));
    setNotice('');
    setError('');
  }

  function cancelEditService() {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm);
  }

  async function handleSaveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !isAdmin) return;
    const trimmedName = serviceForm.name.trim();
    const price = Number(serviceForm.price);
    if (!trimmedName) {
      setError('O servico precisa de um nome.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Preco do servico invalido.');
      return;
    }
    setNotice('');
    setError('');
    try {
      const draft: api.ServiceDraft = {
        id: editingServiceId ?? (serviceForm.id.trim() || undefined),
        name: trimmedName,
        nameEn: serviceForm.nameEn,
        description: serviceForm.description,
        price,
        active: serviceForm.active,
      };
      if (editingServiceId) {
        await api.updateService(token, editingServiceId, draft);
        setNotice('Servico atualizado com sucesso.');
      } else {
        await api.createService(token, draft);
        setNotice('Servico criado com sucesso.');
      }
      cancelEditService();
      await Promise.all([loadCatalogs(), loadPricing(), loadAuditLogs(token)]);
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Nao foi possivel guardar o servico.');
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!token || !isAdmin) return;
    if (!window.confirm('Apagar este servico? Se estiver em uso, sera arquivado.')) return;
    setNotice('');
    setError('');
    try {
      const payload = await api.deleteService(token, serviceId);
      if (editingServiceId === serviceId) cancelEditService();
      await Promise.all([loadCatalogs(), loadPricing(), loadAuditLogs(token)]);
      setNotice(payload.message || 'Servico removido.');
    } catch (_error) {
      setError('Nao foi possivel apagar o servico.');
    }
  }

  async function handleBookingDecision(bookingId: string, action: 'confirm' | 'reject') {
    if (!token || !canConfirmBookings) {
      return;
    }

    setNotice('');
    setError('');

    try {
      const selectedBooking = bookings.find((booking) => booking.id === bookingId);
      await api.bookingAction(token, bookingId, action);

      if (action === 'confirm' && selectedBooking) {
        abrirWhatsAppMensagem(selectedBooking, currentUser?.name || 'Colaborador', 'confirm');
      }

      await Promise.all([loadBookings(token), loadAuditLogs(token)]);
      setNotice(action === 'confirm' ? 'Marcacao confirmada.' : 'Marcacao rejeitada.');
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(error.message);
      } else {
        setError('Nao foi possivel atualizar a marcacao.');
      }
    }
  }

  async function handleCancelBooking(bookingId: string) {
    if (!token || !canConfirmBookings) {
      return;
    }

    setNotice('');
    setError('');

    try {
      const selectedBooking = bookings.find((booking) => booking.id === bookingId);
      await api.bookingAction(token, bookingId, 'cancel');

      const enviouWhatsApp = selectedBooking
        ? abrirWhatsAppMensagem(selectedBooking, currentUser?.name || 'Colaborador', 'cancel')
        : false;

      await Promise.all([loadBookings(token), loadAuditLogs(token)]);
      setNotice(enviouWhatsApp ? 'Marcacao anulada e mensagem preparada no WhatsApp.' : 'Marcacao anulada.');
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(error.message);
      } else {
        setError('Nao foi possivel anular a marcacao.');
      }
    }
  }

  async function handleRefundBooking(bookingId: string) {
    if (!token || !canConfirmBookings) {
      return;
    }

    setNotice('');
    setError('');

    try {
      const selectedBooking = bookings.find((booking) => booking.id === bookingId);
      await api.bookingAction(token, bookingId, 'refund');

      const enviouWhatsApp = selectedBooking
        ? abrirWhatsAppMensagem(selectedBooking, currentUser?.name || 'Colaborador', 'refund')
        : false;

      await Promise.all([loadBookings(token), loadAuditLogs(token)]);
      setNotice(enviouWhatsApp ? 'Valor devolvido e mensagem preparada no WhatsApp.' : 'Valor devolvido com sucesso.');
    } catch (error) {
      if (error instanceof Error && error.message) {
        setError(error.message);
      } else {
        setError('Nao foi possivel devolver o valor.');
      }
    }
  }

  function handleResendWhatsApp(booking: TeamBooking) {
    if (!consegueAbrirWhatsApp(booking)) {
      setError('Nao existe telemovel valido para esta marcacao.');
      setNotice('');
      return;
    }

    setError('');
    setNotice('A abrir WhatsApp com a mensagem de confirmacao...');
    abrirWhatsAppMensagem(booking, currentUser?.name || 'Colaborador', 'confirm');
  }

  if (!currentUser) {
    return (
      <div className="page-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />

        <main className="layout admin-layout">
          <section className="card admin-auth-card">
            {adminLogoVisible ? (
              <img
                className="admin-brand-logo"
                src="/logoadmin.png"
                alt="Feedback - Ensaios Admin"
                onError={() => setAdminLogoVisible(false)}
              />
            ) : null}
            <p className="eyebrow">Feedback - Ensaios</p>
            <h2>Login de Administracao</h2>
            <p className="summary-copy">Acesso para Administradores e Colaboradores.</p>

            <form className="admin-login-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>

              <button type="submit" className="primary-button">
                Entrar
              </button>

              {authError ? <p className="admin-message-error">{authError}</p> : null}
            </form>

            <p className="admin-helper-note">Conta inicial: admin@feedbook.local / admin123</p>
            <a href="/" className="secondary-button admin-link-home">
              Voltar ao site
            </a>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <div className="admin-beta-banner beta-only" role="note">
        <span className="admin-beta-badge">Beta</span>
      </div>

      <header className="topbar admin-topbar">
        <div className="brand-wrap">
          {adminLogoVisible ? (
            <img
              className="admin-brand-logo"
              src="/logoadmin.png"
              alt="Feedback - Ensaios Admin"
              onError={() => setAdminLogoVisible(false)}
            />
          ) : null}
          <div className="admin-session-bar">
            <p className="summary-copy admin-session-pill">
              Sessao ativa: {currentUser.name} ({roleLabels[currentUser.role]}
              {currentUser.function ? ` · ${api.staffFunctionLabels[currentUser.function]}` : ''})
            </p>
            <button type="button" className="secondary-button admin-logout-inline" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>

        <div className="topbar-tools">
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

          <div className="admin-top-actions">
            <a href="/" className="secondary-button admin-link-home">
              Site publico
            </a>
            <a href="/admin" className="secondary-button">
              Historico de ensaios
            </a>
          </div>
        </div>
      </header>

      <main className="layout admin-layout">
        {error ? <p className="admin-message-error">{error}</p> : null}
        {notice ? <p className="admin-message-ok">{notice}</p> : null}

        <section className="card admin-section">
          <div className="section-heading">
            <p className="eyebrow">Marcacoes</p>
            <h2>Marcacoes correntes e ativas</h2>
          </div>

          <div className="admin-search-row">
            <input
              type="search"
              placeholder="Pesquisar por n.º FB-, banda ou contacto..."
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
              className="admin-search-input"
            />
            {bookingSearch ? (
              <span className="admin-search-count">{filteredBookings.length} resultado{filteredBookings.length !== 1 ? 's' : ''}</span>
            ) : null}
          </div>

          <ul className="team-list admin-booking-list">
            {filteredBookings.length === 0 ? (
              <li>
                <p>Sem marcacoes ativas.</p>
              </li>
            ) : (
              filteredBookings.map((booking) => (
                <li key={booking.id}>
                  <div className="team-item-top">
                    <strong>{booking.roomName}</strong>
                    <span className={`status-chip status-${booking.status}`}>{booking.status}</span>
                    <span className="booking-id-chip">{booking.id}</span>
                  </div>
                  <p>
                    {booking.bandName || 'Sem nome'} · {booking.date} · {booking.time} · {booking.duration}h
                  </p>
                  <p>
                    Participantes: {booking.participants ?? '-'} · Contacto: {booking.contactName || '-'}
                  </p>
                  <p>Telemovel: {booking.contactPhone || '-'}</p>
                  <p>
                    Pagamento: No dia do ensaio · Estado: {booking.paymentStatus || '-'}
                  </p>
                  <p>Email: {booking.email}</p>
                  <p>
                    Colaborador atribuido: {booking.assignedCollaborator?.name || 'Nao definido'}
                  </p>

                  {canConfirmBookings && booking.status === 'pending' ? (
                    <div className="admin-approval-row">
                      {isAdmin ? (
                        <select
                          value={assignmentByBookingId[booking.id] || ''}
                          onChange={(event) =>
                            setAssignmentByBookingId((current) => ({
                              ...current,
                              [booking.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Atribuicao automatica</option>
                          {assignableStaff.map((staffMember) => (
                            <option key={staffMember.id} value={staffMember.id}>
                              {staffMember.name}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      <div className="team-actions admin-booking-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleBookingDecision(booking.id, 'confirm');
                          }}
                        >
                          Aceitar
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleBookingDecision(booking.id, 'reject');
                          }}
                        >
                          Desmarcar
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleCancelBooking(booking.id);
                          }}
                        >
                          Anular
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleRefundBooking(booking.id);
                          }}
                        >
                          Devolver
                        </button>
                      </div>
                    </div>
                  ) : canConfirmBookings ? (
                    <div className="team-actions admin-booking-actions">
                      {booking.status === 'confirmed' ? (
                        <>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              handleResendWhatsApp(booking);
                            }}
                          >
                            Reenviar WhatsApp
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              void handleCancelBooking(booking.id);
                            }}
                          >
                            Anular
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              void handleRefundBooking(booking.id);
                            }}
                          >
                            Devolver
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>

        {isAdmin ? (
          <section className="card admin-section admin-controls-hub">
            <div className="section-heading">
              <p className="eyebrow">Gestao rapida</p>
              <h2>Pie menu de operacoes</h2>
            </div>

            <div className="admin-pie-menu" role="navigation" aria-label="Menu rapido de administracao">
              <button
                type="button"
                className={`admin-pie-item ${activePanel === 'users' ? 'admin-pie-item-active' : ''}`}
                onClick={() => setActivePanel('users')}
              >
                Utilizadores
              </button>
              <button
                type="button"
                className={`admin-pie-item ${activePanel === 'rooms' ? 'admin-pie-item-active' : ''}`}
                onClick={() => setActivePanel('rooms')}
              >
                Salas
              </button>
              <button
                type="button"
                className={`admin-pie-item ${activePanel === 'services' ? 'admin-pie-item-active' : ''}`}
                onClick={() => setActivePanel('services')}
              >
                Servicos
              </button>
              <button
                type="button"
                className={`admin-pie-item ${activePanel === 'pricing' ? 'admin-pie-item-active' : ''}`}
                onClick={() => setActivePanel('pricing')}
              >
                Precos
              </button>
              <button
                type="button"
                className={`admin-pie-item ${activePanel === 'audit' ? 'admin-pie-item-active' : ''}`}
                onClick={() => setActivePanel('audit')}
              >
                Auditoria
              </button>
              <a href="/admin" className="admin-pie-item admin-pie-link">
                Historico
              </a>
            </div>
          </section>
        ) : null}

        {isAdmin && activePanel === 'users' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Utilizadores</p>
              <h2>Gestao de utilizadores</h2>
            </div>

            <div className="admin-beta-banner sub-banner" role="note">
              <span className="admin-beta-badge">⚠ OBRIGATÓRIO</span>
              <span className="admin-beta-text">O telemovel e obrigatorio para novos utilizadores. Por favor, preencha o telemovel e verifique os dados antes de submeter.</span>
            </div>

            <form className="admin-create-user" onSubmit={editUserDraft ? handleEditUser : handleCreateUser}>
              <label>
                Nome
                <input
                  type="text"
                  value={editUserDraft ? editUserDraft.name : newUserDraft.name}
                  onChange={(event) =>
                    editUserDraft
                      ? setEditUserDraft((current) =>
                          current ? { ...current, name: event.target.value } : current,
                        )
                      : setNewUserDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={editUserDraft ? editUserDraft.email : newUserDraft.email}
                  onChange={(event) =>
                    editUserDraft
                      ? setEditUserDraft((current) =>
                          current ? { ...current, email: event.target.value } : current,
                        )
                      : setNewUserDraft((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>

              <label>
                Telemovel
                <input
                  type="tel"
                  placeholder="Ex: 912345678"
                  value={editUserDraft ? editUserDraft.phone : newUserDraft.phone}
                  onChange={(event) =>
                    editUserDraft
                      ? setEditUserDraft((current) =>
                          current ? { ...current, phone: event.target.value } : current,
                        )
                      : setNewUserDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>

              <label>
                Password
                <input
                  type="text"
                  placeholder={editUserDraft ? 'Deixar vazio para manter' : ''}
                  value={editUserDraft ? editUserDraft.password : newUserDraft.password}
                  onChange={(event) =>
                    editUserDraft
                      ? setEditUserDraft((current) =>
                          current ? { ...current, password: event.target.value } : current,
                        )
                      : setNewUserDraft((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>

              <label>
                Perfil
                <select
                  value={editUserDraft ? editUserDraft.role : newUserDraft.role}
                  onChange={(event) =>
                    editUserDraft
                      ? setEditUserDraft((current) =>
                          current ? { ...current, role: event.target.value as Role } : current,
                        )
                      : setNewUserDraft((current) => ({ ...current, role: event.target.value as Role }))
                  }
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-user-form-actions">
                <button type="submit" className="primary-button">
                  {editUserDraft ? 'Guardar alteracoes' : 'Criar utilizador'}
                </button>
                {editUserDraft ? (
                  <button type="button" className="secondary-button" onClick={cancelEditUser}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>

            <ul className="admin-user-list">
              {users.map((user) => (
                <li key={user.id}>
                  <div className="admin-user-card-head">
                    <strong>{user.name}</strong>
                    <span className="booking-id-chip">{user.id}</span>
                  </div>
                  <span>{user.email}</span>
                  <span>{user.phone || '-'}</span>
                  <span>{roleLabels[user.role]}</span>
                  {isAdmin ? (
                    <div className="team-actions">
                      <button type="button" className="secondary-button" onClick={() => startEditUser(user)}>
                        Editar
                      </button>
                      {currentUser?.id !== user.id ? (
                        <button type="button" className="secondary-button" onClick={() => void handleDeleteUser(user.id)}>
                          Apagar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isAdmin && activePanel === 'pricing' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Precos</p>
              <h2>Atualizar tabela de precos</h2>
            </div>

            <form className="admin-pricing-grid" onSubmit={handleSavePricing}>
              <label>
                Preco por elemento/hora (EUR)
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={pricingDraft.perMemberPerHour}
                  onChange={(event) =>
                    setPricingDraft((current) => ({ ...current, perMemberPerHour: event.target.value }))
                  }
                />
              </label>

              {Object.entries(pricingDraft.extras ?? {}).map(([extraId, rawValue]) => {
                const service = services.find((item) => item.id === extraId);
                const label = service ? service.name : extraId;
                return (
                  <label key={extraId}>
                    Extra {label} (EUR)
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={rawValue}
                      onChange={(event) =>
                        setPricingDraft((current) => ({
                          ...current,
                          extras: { ...current.extras, [extraId]: event.target.value },
                        }))
                      }
                    />
                  </label>
                );
              })}

              <p className="admin-helper-note">Para adicionar ou remover extras, usa o painel Servicos no pie-menu.</p>

              <button type="submit" className="primary-button">
                Guardar precos
              </button>
            </form>
          </section>
        ) : null}

        {isAdmin && activePanel === 'rooms' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Salas</p>
              <h2>Gerir salas</h2>
              <p className="summary-copy">Altera precos, descricao, capacidade e equipamento. Salas novas aparecem logo no site.</p>
            </div>

            <form className="admin-create-user" onSubmit={handleSaveRoom}>
              {!editingRoomId ? (
                <label>
                  ID (opcional, ex: sala-blue)
                  <input
                    type="text"
                    value={roomForm.id}
                    onChange={(event) => setRoomForm((current) => ({ ...current, id: event.target.value }))}
                    placeholder="gerado a partir do nome"
                  />
                </label>
              ) : null}
              <label>
                Nome *
                <input
                  type="text"
                  required
                  value={roomForm.name}
                  onChange={(event) => setRoomForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="SALA BLUE"
                />
              </label>
              <div className="field-row">
                <label>
                  Capacidade (musicos) *
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={roomForm.maxMembers}
                    onChange={(event) => setRoomForm((current) => ({ ...current, maxMembers: event.target.value }))}
                  />
                </label>
                <label>
                  Preco proprio EUR/hora/elemento (vazio = usa preco global)
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={roomForm.pricePerMemberHour}
                    onChange={(event) => setRoomForm((current) => ({ ...current, pricePerMemberHour: event.target.value }))}
                    placeholder={`${pricing.perMemberPerHour}`}
                  />
                </label>
              </div>
              <label>
                Descricao (PT)
                <textarea
                  rows={2}
                  value={roomForm.description}
                  onChange={(event) => setRoomForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label>
                Descricao (EN)
                <textarea
                  rows={2}
                  value={roomForm.descriptionEn}
                  onChange={(event) => setRoomForm((current) => ({ ...current, descriptionEn: event.target.value }))}
                />
              </label>
              <div className="field-row">
                <label>
                  Equipamento PT (um por linha)
                  <textarea
                    rows={3}
                    value={roomForm.gear}
                    onChange={(event) => setRoomForm((current) => ({ ...current, gear: event.target.value }))}
                  />
                </label>
                <label>
                  Equipamento EN (um por linha)
                  <textarea
                    rows={3}
                    value={roomForm.gearEn}
                    onChange={(event) => setRoomForm((current) => ({ ...current, gearEn: event.target.value }))}
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  Cor de destaque
                  <select
                    value={roomForm.accent}
                    onChange={(event) => setRoomForm((current) => ({ ...current, accent: event.target.value }))}
                  >
                    <option value="var(--room-red)">Vermelho</option>
                    <option value="var(--room-grey)">Cinzento</option>
                  </select>
                </label>
                <label className="extra-toggle">
                  <input
                    type="checkbox"
                    checked={roomForm.active}
                    onChange={(event) => setRoomForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Ativa no site</span>
                </label>
              </div>
              <div className="admin-user-form-actions">
                <button type="submit" className="primary-button">
                  {editingRoomId ? 'Guardar sala' : 'Adicionar sala'}
                </button>
                {editingRoomId ? (
                  <button type="button" className="secondary-button" onClick={cancelEditRoom}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>

            {catalogLoading ? <p className="summary-copy">A carregar salas...</p> : null}
            <ul className="admin-user-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <div className="admin-user-card-head">
                    <strong>{room.name}</strong>
                    <span className="booking-id-chip">{room.id}</span>
                    {!room.active ? <span className="booking-id-chip">inativa</span> : null}
                  </div>
                  <span>{room.description || 'Sem descricao'}</span>
                  <span>
                    Ate {room.maxMembers} musicos ·{' '}
                    {room.pricePerMemberHour === null || room.pricePerMemberHour === undefined
                      ? `Preco global (${pricing.perMemberPerHour} EUR/h)`
                      : `${room.pricePerMemberHour} EUR/h proprio`}
                  </span>
                  <div className="team-actions">
                    <button type="button" className="secondary-button" onClick={() => startEditRoom(room)}>
                      Editar
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleDeleteRoom(room.id)}>
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isAdmin && activePanel === 'services' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Servicos</p>
              <h2>Gerir servicos / extras</h2>
              <p className="summary-copy">Altera nomes, descricoes e precos. Servicos novos aparecem como extras na marcacao.</p>
            </div>

            <form className="admin-create-user" onSubmit={handleSaveService}>
              {!editingServiceId ? (
                <label>
                  ID (opcional, ex: mistura)
                  <input
                    type="text"
                    value={serviceForm.id}
                    onChange={(event) => setServiceForm((current) => ({ ...current, id: event.target.value }))}
                    placeholder="gerado a partir do nome"
                  />
                </label>
              ) : null}
              <div className="field-row">
                <label>
                  Nome (PT) *
                  <input
                    type="text"
                    required
                    value={serviceForm.name}
                    onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label>
                  Nome (EN)
                  <input
                    type="text"
                    value={serviceForm.nameEn}
                    onChange={(event) => setServiceForm((current) => ({ ...current, nameEn: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                Descricao
                <textarea
                  rows={2}
                  value={serviceForm.description}
                  onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <div className="field-row">
                <label>
                  Preco (EUR) *
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={serviceForm.price}
                    onChange={(event) => setServiceForm((current) => ({ ...current, price: event.target.value }))}
                  />
                </label>
                <label className="extra-toggle">
                  <input
                    type="checkbox"
                    checked={serviceForm.active}
                    onChange={(event) => setServiceForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  <span>Ativo no site</span>
                </label>
              </div>
              <div className="admin-user-form-actions">
                <button type="submit" className="primary-button">
                  {editingServiceId ? 'Guardar servico' : 'Adicionar servico'}
                </button>
                {editingServiceId ? (
                  <button type="button" className="secondary-button" onClick={cancelEditService}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>

            {catalogLoading ? <p className="summary-copy">A carregar servicos...</p> : null}
            <ul className="admin-user-list">
              {services.map((service) => (
                <li key={service.id}>
                  <div className="admin-user-card-head">
                    <strong>{service.name}</strong>
                    <span className="booking-id-chip">{service.id}</span>
                    {!service.active ? <span className="booking-id-chip">inativo</span> : null}
                  </div>
                  <span>{service.nameEn || 'Sem nome EN'}</span>
                  <span>{service.price} EUR · {service.description || 'Sem descricao'}</span>
                  <div className="team-actions">
                    <button type="button" className="secondary-button" onClick={() => startEditService(service)}>
                      Editar
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleDeleteService(service.id)}>
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isAdmin && activePanel === 'audit' ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Auditoria</p>
              <h2>Historico de acoes</h2>
            </div>

            <ul className="admin-audit-list">
              {auditLogs.length === 0 ? (
                <li>
                  <p>Sem eventos de auditoria.</p>
                </li>
              ) : (
                auditLogs.slice(0, 12).map((entry) => {
                  let parsed: Record<string, string> | null = null;
                  try {
                    const candidate = JSON.parse(entry.details) as unknown;
                    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                      parsed = candidate as Record<string, string>;
                    }
                  } catch {
                    parsed = null;
                  }

                  const actionLabel: Record<string, string> = {
                    'booking-confirmed': 'Confirmado',
                    'booking-rejected': 'Rejeitado',
                    'booking-cancelled': 'Cancelado',
                    'booking-refunded': 'Devolvido',
                    'user-created': 'Utilizador criado',
                    'pricing-updated': 'Precos atualizados',
                    'room-created': 'Sala criada',
                    'room-updated': 'Sala atualizada',
                    'room-archived': 'Sala arquivada',
                    'room-deleted': 'Sala apagada',
                    'service-created': 'Servico criado',
                    'service-updated': 'Servico atualizado',
                    'service-archived': 'Servico arquivado',
                    'service-deleted': 'Servico apagado',
                  };

                  const ts = new Date(entry.createdAt);
                  const formattedDate = Number.isNaN(ts.getTime())
                    ? entry.createdAt
                    : ts.toLocaleString('pt-PT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                  return (
                    <li key={entry.id}>
                      <div className="team-item-top">
                        <strong>{actionLabel[entry.action] ?? entry.action}</strong>
                        <span>{formattedDate}</span>
                      </div>
                      {parsed ? (
                        <>
                          {(parsed.banda || parsed.contacto) ? (
                            <p>
                              <span className="audit-label">Banda / Contacto:</span>{' '}
                              {parsed.banda ?? parsed.contacto}
                              {parsed.sala ? ` · ${parsed.sala}` : null}
                              {parsed.data ? ` · ${parsed.data}` : null}
                            </p>
                          ) : null}
                          {parsed.confirmadoPor ? (
                            <p>
                              <span className="audit-label">Confirmado por:</span> {parsed.confirmadoPor}
                            </p>
                          ) : null}
                          {parsed.rejeitadoPor ? (
                            <p>
                              <span className="audit-label">Rejeitado por:</span> {parsed.rejeitadoPor}
                            </p>
                          ) : null}
                          {parsed.canceladoPor ? (
                            <p>
                              <span className="audit-label">Cancelado por:</span> {parsed.canceladoPor}
                            </p>
                          ) : null}
                          {parsed.devolvidoPor ? (
                            <p>
                              <span className="audit-label">Devolvido por:</span> {parsed.devolvidoPor}
                            </p>
                          ) : null}
                          {parsed.designado ? (
                            <p>
                              <span className="audit-label">Pessoa designada (abertura):</span> {parsed.designado}
                            </p>
                          ) : null}
                          {parsed.email ? (
                            <p>
                              <span className="audit-label">Email:</span> {parsed.email}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p>{entry.details}</p>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default AdminPage;
