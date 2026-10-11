-- ============================================================================
-- Migração: contorno colorido por sala (accent)
-- Define o outline da sala de live concerts (SALA LIVE) como roxo escuro.
-- A variável CSS --room-purple está definida em src/index.css.
--
-- Idempotente: pode ser corrida várias vezes sem efeitos colaterais.
-- ============================================================================

-- SALA LIVE -> roxo escuro (var(--room-purple))
update public.rooms
set accent = 'var(--room-purple)'
where name ilike '%live%';
