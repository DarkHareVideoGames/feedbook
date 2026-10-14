-- ============================================================
-- Feedback - Ensaios — Migração Issue #26: remover o preço global
-- Correr no SQL Editor do Supabase.
--
-- ORDEM RECOMENDADA:
--   1. Publicar o frontend novo (que já não usa a coluna);
--   2. Correr este script.
-- Se correres antes, o frontend antigo deixa de mostrar o preço
-- global (sem perda de dados — as salas ficam com o valor).
-- ============================================================

-- 1) Salas sem preço passam a herdar o valor global atual
--    (o preço efetivo de cada sala fica inalterado). Idempotente.
update public.rooms
set "pricePerMemberHour" = (
  select p."perMemberPerHour"
  from public.pricing p
  where p.id = 1
)
where "pricePerMemberHour" is null
  and exists (
    select 1
    from public.pricing p
    where p.id = 1 and p."perMemberPerHour" is not null
  );

-- 2) Remove a coluna do preço global (a tabela fica para os extras).
--    Se preferires mantê-la como histórico, comenta este bloco.
alter table public.pricing drop column if exists "perMemberPerHour";
