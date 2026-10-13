-- ============================================================
-- Feedback - Ensaios — Vincular o pagamento a quem assegura e a
-- quem recebeu (Issue #8)
--
-- Corre no SQL Editor do painel do Supabase.
--
-- Contexto:
--  - "paymentAssignee": pessoa que ASSEGURA o ensaio, espelhada do
--    dropdown "Assegura:" (definido na confirmacao do ensaio) no momento
--    em que o pagamento e confirmado.
--  - "paymentReceivedBy": pessoa que RECEBEU o pagamento, escolhida num
--    dropdown no modal de confirmacao de pagamento (por omissao, quem
--    confirma no sistema).
--
-- "paymentConfirmedBy" (quem clicou em confirmar no sistema) mantem-se
-- como auditoria. As colunas novas sao jsonb {id, name} (formato igual a
-- "assignedCollaborator") e nullable, para nao afetar reservas antigas.
-- ============================================================

alter table public.bookings
  add column if not exists "paymentAssignee" jsonb;

alter table public.bookings
  add column if not exists "paymentReceivedBy" jsonb;

-- (Opcional) documenta o formato esperado das colunas.
comment on column public.bookings."paymentAssignee"
  is 'Pessoa que assegura o ensaio no momento do pagamento: {id, name}. Espelha assignedCollaborator.';
comment on column public.bookings."paymentReceivedBy"
  is 'Pessoa que recebeu o pagamento: {id, name}. Escolhida no modal de confirmacao de pagamento (omissao: quem confirma).';
