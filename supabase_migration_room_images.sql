-- ============================================================
-- FeedBook — migracao: coluna "imageUrl" em rooms
-- ============================================================
-- Motivo: cada sala passa a poder ter uma foto, mostrada no card
-- da sala no site publico. A imagem vive num bucket publico do
-- Supabase Storage ("images", pasta rooms/); aqui guardamos apenas
-- o URL publico resultante.
--
-- Idempotente: seguro de correr mais do que uma vez.
-- ============================================================

alter table public.rooms
  add column if not exists "imageUrl" text;
