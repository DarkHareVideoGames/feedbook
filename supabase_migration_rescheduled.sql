-- ============================================================
-- FeedBook — migracao: coluna "rescheduledBy" em bookings
-- ============================================================
-- Motivo: o filtro "Reagendados" da administracao precisa de um marcador
-- persistente. Antes, o reagendamento limpava confirmedBy/rejectedBy/
-- cancelledBy e voltava a 'pending', tornando impossivel distinguir uma
-- marcação reagendada de uma nova.
--
-- "rescheduledBy" guarda o ActorStamp de quem reagendou (id, name, role,
-- phone, at) e NAO e limpo quando o ensaio e reconfirmado, pelo que o
-- filtro continua a sinalizar a marcação como "reagendada".
--
-- Idempotente: seguro de correr mais do que uma vez.
-- ============================================================

alter table public.bookings
  add column if not exists "rescheduledBy" jsonb;

-- Indice parcial para o filtro "Reagendados" (rapido mesmo com muitos registos).
create index if not exists bookings_rescheduledby_idx
  on public.bookings ((("rescheduledBy") is not null))
  where "rescheduledBy" is not null;
