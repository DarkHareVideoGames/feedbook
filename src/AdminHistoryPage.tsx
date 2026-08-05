import { useEffect, useState } from 'react';

type BookingStatus = 'pending' | 'confirmed' | 'rejected';

type PastBooking = {
  id: string;
  roomName: string;
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

const TOKEN_KEY = 'feedbook-admin-token';

const statusLabel: Record<BookingStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
};

function AdminHistoryPage() {
  const [bookings, setBookings] = useState<PastBooking[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      window.location.href = '/admin';
      return;
    }

    fetch('/api/admin/bookings?period=past', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          window.location.href = '/admin';
          return;
        }
        if (!res.ok) {
          throw new Error('Erro ao carregar historico');
        }
        const payload = (await res.json()) as { bookings: PastBooking[] };
        setBookings(payload.bookings);
      })
      .catch(() => setError('Nao foi possivel carregar o historico.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar admin-topbar">
        <div className="brand-wrap">
          <p className="eyebrow">FeedBook</p>
          <h1>Historico de Ensaios</h1>
        </div>
        <div className="topbar-tools">
          <div className="admin-top-actions">
            <a href="/admin" className="secondary-button">
              Painel
            </a>
            <a href="/" className="secondary-button admin-link-home">
              Site publico
            </a>
          </div>
        </div>
      </header>

      <main className="layout admin-layout">
        {error ? <p className="admin-message-error">{error}</p> : null}
        {loading ? <p className="summary-copy">A carregar...</p> : null}

        {!loading && !error ? (
          <section className="card admin-section">
            <div className="section-heading">
              <p className="eyebrow">Ensaios passados</p>
              <h2>{bookings.length === 0 ? 'Sem ensaios no historico' : `${bookings.length} ensaio${bookings.length === 1 ? '' : 's'}`}</h2>
            </div>

            {bookings.length > 0 ? (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Hora</th>
                      <th>Sala</th>
                      <th>Banda / Contacto</th>
                      <th>Participantes</th>
                      <th>Duracao</th>
                      <th>Abre a sala</th>
                      <th>Pagamento</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id} className={`history-row-${b.status}`}>
                        <td>{b.date}</td>
                        <td>{b.time}</td>
                        <td>{b.roomName}</td>
                        <td>
                          <span>{b.bandName || b.contactName || '-'}</span>
                          {b.contactPhone ? (
                            <span className="history-sub">{b.contactPhone}</span>
                          ) : null}
                        </td>
                        <td>{b.participants ?? '-'}</td>
                        <td>{b.duration}h</td>
                        <td>{b.assignedCollaborator?.name || '-'}</td>
                        <td>
                          {b.paymentMethod === 'on-site' ? 'No dia' : 'MB WAY'}
                        </td>
                        <td>
                          <span className={`status-chip status-${b.status}`}>
                            {statusLabel[b.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default AdminHistoryPage;
