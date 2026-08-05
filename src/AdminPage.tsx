import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Locale, useI18n } from './i18n';

type Role = 'admin' | 'collaborator' | 'technician';

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

type BookingStatus = 'pending' | 'confirmed' | 'rejected';

type TeamBooking = {
  id: string;
  roomName: string;
  roomId: 'sala-red' | 'sala-grey';
  status: BookingStatus;
  date: string;
  time: string;
  duration: number;
  participants?: number;
  bandName: string;
  contactName: string;
  contactPhone?: string;
  email: string;
  paymentMethod?: 'mbway' | 'on-site';
  paymentStatus?: string;
  assignedCollaborator?: {
    id: string;
    name: string;
  };
};

type PricingConfig = {
  perMemberPerHour: number;
  extras: {
    engineer: number;
    recording: number;
    backline: number;
  };
};

type PricingDraft = {
  perMemberPerHour: string;
  engineer: string;
  recording: string;
  backline: string;
};

type NewUserDraft = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type EditUserDraft = {
  id: string;
  name: string;
  email: string;
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

const TOKEN_KEY = 'feedbook-admin-token';

const roleLabels: Record<Role, string> = {
  admin: 'Administradores',
  collaborator: 'Membros da Equipa',
  technician: 'Tecnicos',
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
  return {
    perMemberPerHour: String(config.perMemberPerHour),
    engineer: String(config.extras.engineer),
    recording: String(config.extras.recording),
    backline: String(config.extras.backline),
  };
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
  const [newUserDraft, setNewUserDraft] = useState<NewUserDraft>({
    name: '',
    email: '',
    password: '',
    role: 'collaborator',
  });
  const [editUserDraft, setEditUserDraft] = useState<EditUserDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [assignmentByBookingId, setAssignmentByBookingId] = useState<Record<string, string>>({});
  const [bookingSearch, setBookingSearch] = useState('');

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        (b.bandName || '').toLowerCase().includes(q) ||
        (b.contactName || '').toLowerCase().includes(q),
    );
  }, [bookings, bookingSearch]);

  const assignableStaff = useMemo(
    () => users.filter((user) => user.role === 'admin' || user.role === 'collaborator' || user.role === 'technician'),
    [users],
  );

  const canConfirmBookings =
    currentUser?.role === 'admin' || currentUser?.role === 'collaborator' || currentUser?.role === 'technician';
  const isAdmin = currentUser?.role === 'admin';

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
      isAdmin ? loadUsers(token) : Promise.resolve(),
      loadAuditLogs(token),
    ]);
  }, [token, currentUser, isAdmin]);

  useEffect(() => {
    setPricingDraft(buildPricingDraft(pricing));
  }, [pricing]);

  async function restoreSession(sessionToken: string) {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Session expired');
      }

      const payload = (await response.json()) as { user: AuthUser };
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
      const response = await fetch('/api/admin/bookings?period=future', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not load bookings');
      }

      const payload = (await response.json()) as { bookings: TeamBooking[] };
      setBookings(payload.bookings);
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
      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not load users');
      }

      const payload = (await response.json()) as { users: AuthUser[] };
      setUsers(payload.users);
    } catch (_error) {
      setError('Nao foi possivel carregar utilizadores.');
    }
  }

  async function loadPricing() {
    try {
      const response = await fetch('/api/pricing');
      if (!response.ok) {
        throw new Error('Could not load pricing');
      }

      const payload = (await response.json()) as { pricing: PricingConfig };
      setPricing(payload.pricing);
    } catch (_error) {
      setError('Nao foi possivel carregar precos.');
    }
  }

  async function loadAuditLogs(sessionToken: string) {
    if (!isAdmin) {
      setAuditLogs([]);
      return;
    }

    try {
      const response = await fetch('/api/admin/audit-logs', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not load audit logs');
      }

      const payload = (await response.json()) as { auditLogs: AuditLogEntry[] };
      setAuditLogs(payload.auditLogs);
    } catch (_error) {
      setError('Nao foi possivel carregar auditoria.');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const payload = (await response.json()) as { token: string; user: AuthUser };
      setToken(payload.token);
      setCurrentUser(payload.user);
      window.localStorage.setItem(TOKEN_KEY, payload.token);
    } catch (_error) {
      setAuthError('Credenciais invalidas.');
    }
  }

  function handleLogout() {
    if (token) {
      void fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newUserDraft),
      });

      if (!response.ok) {
        throw new Error('Could not create user');
      }

      setNewUserDraft({
        name: '',
        email: '',
        password: '',
        role: 'collaborator',
      });
      await Promise.all([loadUsers(token), loadAuditLogs(token)]);
      setNotice('Utilizador criado com sucesso.');
    } catch (_error) {
      setError('Nao foi possivel criar utilizador. Verifica se o email ja existe.');
    }
  }

  function startEditUser(user: AuthUser) {
    setEditUserDraft({
      id: user.id,
      name: user.name,
      email: user.email,
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
      const response = await fetch(`/api/admin/users/${editUserDraft.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editUserDraft.name,
          email: editUserDraft.email,
          password: editUserDraft.password || undefined,
          role: editUserDraft.role,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not update user');
      }

      setEditUserDraft(null);
      await Promise.all([loadUsers(token), loadAuditLogs(token)]);
      setNotice('Utilizador atualizado com sucesso.');
    } catch (_error) {
      setError('Nao foi possivel atualizar utilizador.');
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
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Could not delete user');
      }

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
    const parsedEngineer = Number(pricingDraft.engineer);
    const parsedRecording = Number(pricingDraft.recording);
    const parsedBackline = Number(pricingDraft.backline);

    const numericValues = [parsedPerMemberPerHour, parsedEngineer, parsedRecording, parsedBackline];
    const hasInvalidNumber = numericValues.some((value) => !Number.isFinite(value) || value < 0);

    if (hasInvalidNumber) {
      setError('Valores invalidos. Usa numeros validos.');
      return;
    }

    setNotice('');
    setError('');

    try {
      const response = await fetch('/api/pricing', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          perMemberPerHour: parsedPerMemberPerHour,
          extras: {
            engineer: parsedEngineer,
            recording: parsedRecording,
            backline: parsedBackline,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Could not update pricing');
      }

      const payload = (await response.json()) as { pricing: PricingConfig };
      setPricing(payload.pricing);
      await loadAuditLogs(token);
      setNotice('Precos atualizados com sucesso.');
    } catch (_error) {
      setError('Nao foi possivel guardar os precos.');
    }
  }

  async function handleBookingDecision(bookingId: string, action: 'confirm' | 'reject') {
    if (!token || !canConfirmBookings) {
      return;
    }

    setNotice('');
    setError('');

    try {
      const collaboratorId = assignmentByBookingId[bookingId] || '';
      const response = await fetch(`/api/bookings/${bookingId}/${action}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          action === 'confirm' && collaboratorId
            ? {
                collaboratorId,
              }
            : {},
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Could not update booking');
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
                alt="FeedBook Admin"
                onError={() => setAdminLogoVisible(false)}
              />
            ) : null}
            <p className="eyebrow">FeedBook</p>
            <h2>Login de Administracao</h2>
            <p className="summary-copy">Acesso para Administradores, Membros da Equipa e Tecnicos.</p>

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

      <header className="topbar admin-topbar">
        <div className="brand-wrap">
          {adminLogoVisible ? (
            <img
              className="admin-brand-logo"
              src="/logoadmin.png"
              alt="FeedBook Admin"
              onError={() => setAdminLogoVisible(false)}
            />
          ) : null}
          <p className="eyebrow">FeedBook</p>
          <h1>Painel de Administracao</h1>
          <p className="summary-copy">
            Sessao: {currentUser.name} ({roleLabels[currentUser.role]})
          </p>
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
            <a href="/admin/history" className="secondary-button">
              Historico de ensaios
            </a>
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="layout admin-layout">
        {error ? <p className="admin-message-error">{error}</p> : null}
        {notice ? <p className="admin-message-ok">{notice}</p> : null}

        {isAdmin ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Utilizadores</p>
              <h2>Gestao de utilizadores</h2>
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
                  <option value="admin">Administradores</option>
                  <option value="collaborator">Membros da Equipa</option>
                  <option value="technician">Tecnicos</option>
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

        {isAdmin ? (
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

              <label>
                Extra tecnico (EUR)
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={pricingDraft.engineer}
                  onChange={(event) =>
                    setPricingDraft((current) => ({ ...current, engineer: event.target.value }))
                  }
                />
              </label>

              <label>
                Extra captacao (EUR)
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={pricingDraft.recording}
                  onChange={(event) =>
                    setPricingDraft((current) => ({ ...current, recording: event.target.value }))
                  }
                />
              </label>

              <label>
                Extra backline (EUR)
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={pricingDraft.backline}
                  onChange={(event) =>
                    setPricingDraft((current) => ({ ...current, backline: event.target.value }))
                  }
                />
              </label>

              <button type="submit" className="primary-button">
                Guardar precos
              </button>
            </form>
          </section>
        ) : null}

        <section className="card admin-section">
          <div className="section-heading">
            <p className="eyebrow">Marcacoes</p>
            <h2>Gestao de ensaios</h2>
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
                <p>Sem marcacoes.</p>
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
                    Pagamento: {booking.paymentMethod === 'on-site' ? 'No dia do ensaio' : 'MB WAY'} · Estado: {booking.paymentStatus || '-'}
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

                      <div className="team-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleBookingDecision(booking.id, 'confirm');
                          }}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            void handleBookingDecision(booking.id, 'reject');
                          }}
                        >
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>

        {isAdmin ? (
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
                    'user-created': 'Utilizador criado',
                    'pricing-updated': 'Precos atualizados',
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
