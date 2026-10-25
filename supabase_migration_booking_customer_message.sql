-- ============================================================
-- FeedBook — migracao: mensagem do cliente em bookings
-- ============================================================
-- Guarda a mensagem/objetivo preenchido no formulario publico para consulta
-- no detalhe da marcacao no painel administrativo.
--
-- Nullable para manter compatibilidade com marcacoes anteriores.
-- Idempotente: seguro de correr mais do que uma vez.
-- ============================================================

alter table public.bookings
  add column if not exists "customerMessage" text;