-- ============================================================
-- FeedBook — RESPOSTAS A PEDIDOS DE CONTACTO (Issue #125)
-- Aplicar depois de supabase_migration_contact_requests.sql.
-- Idempotente.
-- ============================================================

alter table public.contact_requests
  add column if not exists "replyMessage" text,
  add column if not exists "replyChannel" text,
  add column if not exists "repliedAt" timestamptz;

alter table public.contact_requests
  drop constraint if exists contact_requests_reply_channel_check;

alter table public.contact_requests
  add constraint contact_requests_reply_channel_check
  check (
    "replyChannel" is null
    or "replyChannel" in ('email', 'whatsapp')
  );

notify pgrst, 'reload schema';