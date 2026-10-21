-- ============================================================
-- FeedBook — PEDIDOS DE CONTACTO POR SALA (Issue #34)
-- Aplicar depois de supabase_migration_security_rls.sql.
-- Idempotente.
-- ============================================================

alter table public.rooms
  add column if not exists "bookingMode" text not null default 'booking'
  check ("bookingMode" in ('booking', 'contact'));

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  "roomId" text not null references public.rooms(id) on delete restrict,
  "roomName" text not null check (length(btrim("roomName")) > 0),
  "contactName" text not null check (length(btrim("contactName")) > 0),
  "contactPhone" text not null check (length(btrim("contactPhone")) > 0),
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  "bandName" text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'closed')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists contact_requests_status_created_at_idx
  on public.contact_requests (status, "createdAt" desc);

drop trigger if exists contact_requests_touch_updated on public.contact_requests;
create trigger contact_requests_touch_updated
  before update on public.contact_requests
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_contact_request_update()
returns trigger
language plpgsql
as $$
begin
  if new."roomId" is distinct from old."roomId"
     or new."roomName" is distinct from old."roomName"
     or new."contactName" is distinct from old."contactName"
     or new."contactPhone" is distinct from old."contactPhone"
     or new.email is distinct from old.email
     or new."bandName" is distinct from old."bandName"
     or new.message is distinct from old.message
     or new."createdAt" is distinct from old."createdAt" then
    raise exception 'Contact request details are immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists contact_requests_enforce_update on public.contact_requests;
create trigger contact_requests_enforce_update
  before update on public.contact_requests
  for each row execute function public.enforce_contact_request_update();

alter table public.contact_requests enable row level security;

create or replace function public.is_contact_request_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'superuser', 'collaborator', 'technician')
  );
$$;

revoke execute on function public.is_contact_request_staff() from anon;
grant execute on function public.is_contact_request_staff() to authenticated;

create or replace function public.is_contact_request_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'superuser'
  );
$$;

revoke execute on function public.is_contact_request_superuser() from anon;
grant execute on function public.is_contact_request_superuser() to authenticated;

drop policy if exists "anon create contact requests" on public.contact_requests;
create policy "anon create contact requests" on public.contact_requests
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.rooms
      where id = "roomId"
        and name = "roomName"
        and active = true
        and "bookingMode" = 'contact'
    )
  );

drop policy if exists "staff read contact requests" on public.contact_requests;
create policy "staff read contact requests" on public.contact_requests
  for select to authenticated
  using (public.is_contact_request_staff());

drop policy if exists "staff update contact requests" on public.contact_requests;
create policy "staff update contact requests" on public.contact_requests
  for update to authenticated
  using (public.is_contact_request_staff())
  with check (public.is_contact_request_staff());

drop policy if exists "superuser delete contact requests" on public.contact_requests;
create policy "superuser delete contact requests" on public.contact_requests
  for delete to authenticated
  using (public.is_contact_request_superuser());

-- Força o PostgREST/Supabase Data API a recarregar as colunas e políticas novas.
notify pgrst, 'reload schema';