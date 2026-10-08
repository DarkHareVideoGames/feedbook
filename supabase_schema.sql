-- ============================================================
-- FeedBook — Schema completo para o Supabase
-- Correr no SQL Editor do painel do Supabase (substitui a versão anterior).
--
-- ATENÇÃO: recria a tabela "bookings" (versão anterior estava vazia
-- e tinha colunas em minúsculas por falta de aspas — corrigido aqui).
--
-- Identificadores camelCase entre aspas → casam 1:1 com o JSON
-- e com o front-end, sem código de mapeamento.
-- ============================================================

drop table if exists public.bookings cascade;

-- ------------------------------------------------------------
-- 1. bookings — marcações de ensaios
-- ------------------------------------------------------------
create table public.bookings (
  id                    text        primary key,

  "roomId"              text,                          -- 'sala-red' | 'sala-grey'
  "roomName"            text        not null,           -- 'SALA RED' | 'SALA GREY'

  status                text        not null default 'pending'
                        check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),

  date                  date        not null,           -- YYYY-MM-DD
  time                  text        not null,           -- HH:MM
  duration              numeric     not null check (duration > 0),

  "bandName"            text,
  "contactName"         text        not null,
  "contactPhone"        text,
  email                 text        not null,
  participants          integer     check (participants is null or participants > 0),

  "paymentMethod"       text        not null default 'on-site'
                        check ("paymentMethod" in ('mbway', 'on-site')),
  "paymentStatus"       text        not null default 'pending'
                        check ("paymentStatus" in ('pending', 'received', 'refunded')),
  amount                numeric(10, 2),
  "paymentConfirmedAt"  timestamptz,

  extras                text[]      not null default '{}',   -- engineer | recording | backline

  "confirmedBy"         jsonb,
  "rejectedBy"          jsonb,
  "cancelledBy"         jsonb,
  "refundedBy"          jsonb,
  "paymentConfirmedBy"  jsonb,
  "assignedCollaborator" jsonb,

  "createdAt"           timestamptz not null default now()
);

create index if not exists bookings_date_idx       on public.bookings (date);
create index if not exists bookings_status_idx     on public.bookings (status);
create index if not exists bookings_roomname_idx   on public.bookings ("roomName");

-- ------------------------------------------------------------
-- 2. profiles — utilizadores (papéis) ligados ao Supabase Auth
--    (a conta de login vive em auth.users; aqui guardamos nome/papel)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  name        text        not null default '',
  email       text        not null unique,
  role        text        not null default 'collaborator'
              check (role in ('admin', 'collaborator', 'technician')),
  "createdAt" timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. pricing — preçário (linha única)
-- ------------------------------------------------------------
create table if not exists public.pricing (
  id                 int         primary key check (id = 1),
  "perMemberPerHour" numeric     not null default 3,
  extras             jsonb       not null default '{"engineer":24,"recording":18,"backline":12}'::jsonb,
  "updatedAt"        timestamptz not null default now()
);

insert into public.pricing (id, "perMemberPerHour")
values (1, 3.5)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. audit_logs — histórico de ações
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id          text        primary key,
  action      text        not null,
  actor       jsonb       not null,
  target      text,
  details     text,
  "createdAt" timestamptz not null default now()
);

create index if not exists audit_logs_createdAt_idx on public.audit_logs ("createdAt" desc);

-- ------------------------------------------------------------
-- 5. Trigger: cria o profile quando nasce um utilizador em auth.users
--    (tanto via signUp no site como via dashboard do Supabase)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'collaborator')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 6. Funções administrativas (security definer) — gestão de
--    utilizadores com a chave pública (anon), só para testes.
--    Em produção, restringir/remover.
-- ------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_update_user(
  p_actor    uuid,
  p_id       uuid,
  p_email    text,
  p_name     text,
  p_role     text,
  p_password text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_role not in ('admin', 'collaborator', 'technician') then
    raise exception 'Invalid role.';
  end if;

  select * into v_profile from public.profiles where id = p_id;
  if not found then
    raise exception 'User not found.';
  end if;

  if v_profile.role = 'admin' and p_role <> 'admin' then
    if p_actor = p_id then
      raise exception 'Cannot remove admin role from your own account.';
    end if;
    if not exists (select 1 from public.profiles where role = 'admin' and id <> p_id) then
      raise exception 'Cannot remove the last admin role.';
    end if;
  end if;

  if exists (select 1 from public.profiles where lower(email) = lower(p_email) and id <> p_id) then
    raise exception 'Email already in use.';
  end if;

  update public.profiles
     set name = p_name,
         email = lower(p_email),
         role = p_role
   where id = p_id;

  update auth.users
     set email = lower(p_email),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         encrypted_password = coalesce(crypt(p_password, gen_salt('bf', 10)), encrypted_password),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('name', p_name, 'role', p_role)
   where id = p_id;

  select * into v_profile from public.profiles where id = p_id;
  return v_profile;
end;
$$;

create or replace function public.admin_delete_user(p_actor uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_id;
  if not found then
    raise exception 'User not found.';
  end if;

  if v_profile.role = 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> p_id) then
    raise exception 'Cannot delete the last system administrator account.';
  end if;

  update public.bookings
     set "assignedCollaborator" = null
   where "assignedCollaborator" ->> 'id' = p_id::text;

  delete from auth.users where id = p_id;  -- profiles elimina em cascata
end;
$$;

grant execute on function public.admin_update_user(uuid, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_user(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. RLS — políticas PÚBLICAS para testes
--    ATENÇÃO: permitem leitura/escrita a qualquer anon.
--    Antes de produção, restringir por papel/autenticação.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'profiles', 'pricing', 'audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('drop policy if exists "public insert %s" on public.%I', t, t);
    execute format('drop policy if exists "public update %s" on public.%I', t, t);
    execute format('drop policy if exists "public delete %s" on public.%I', t, t);

    execute format(
      'create policy "public read %s" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format(
      'create policy "public insert %s" on public.%I for insert to anon, authenticated with check (true)', t, t);
    execute format(
      'create policy "public update %s" on public.%I for update to anon, authenticated using (true) with check (true)', t, t);
    execute format(
      'create policy "public delete %s" on public.%I for delete to anon, authenticated using (true)', t, t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 8. Bootstrap do primeiro admin (executar DEPOIS de criares a
--    conta em Authentication → Users no painel do Supabase):
--
--    update public.profiles set role = 'admin'
--    where email = 'pedroveiga.box@gmail.com';
-- ------------------------------------------------------------
