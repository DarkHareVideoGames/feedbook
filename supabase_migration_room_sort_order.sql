-- ============================================================
-- FeedBook — Ordenação persistente das salas (Issue #145)
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================

alter table public.rooms
  add column if not exists "sortOrder" integer;

with ordered_rooms as (
  select id, row_number() over (order by "createdAt", id) - 1 as sort_order
  from public.rooms
)
update public.rooms rooms
set "sortOrder" = ordered_rooms.sort_order
from ordered_rooms
where rooms.id = ordered_rooms.id
  and rooms."sortOrder" is null;

alter table public.rooms
  alter column "sortOrder" set default 0;

alter table public.rooms
  alter column "sortOrder" set not null;

create index if not exists rooms_sort_order_idx on public.rooms ("sortOrder");

notify pgrst, 'reload schema';