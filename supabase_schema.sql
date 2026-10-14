-- ============================================================
-- Feedback - Ensaios — Schema completo para o Supabase
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
  "rescheduledBy"       jsonb,
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
  phone       text        not null default '',
  role        text        not null default 'collaborator'
              check (role in ('superuser', 'admin', 'collaborator', 'technician')),
  -- Função/cargo (metadado; NÃO confere permissões — permissões vêm do role).
  "function"  text
              check ("function" is null or "function" in
                ('diretor-producao', 'diretor-tecnico', 'produtor-executivo', 'gestor-operativo', 'gestor-manutencao', 'tecnico')),
  "createdAt" timestamptz not null default now()
);

-- Migração idempotente para bases já existentes (adiciona coluna/actualiza checks).
alter table public.profiles add column if not exists "function" text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superuser', 'admin', 'collaborator', 'technician'));
alter table public.profiles drop constraint if exists profiles_function_check;
alter table public.profiles add constraint profiles_function_check
  check ("function" is null or "function" in
    ('diretor-producao', 'diretor-tecnico', 'produtor-executivo', 'gestor-operativo', 'gestor-manutencao', 'tecnico'));

-- ------------------------------------------------------------
-- 3. pricing — preçário (linha única)
-- ------------------------------------------------------------
create table if not exists public.pricing (
  id                 int         primary key check (id = 1),
  extras             jsonb       not null default '{"engineer":24,"recording":18,"backline":12}'::jsonb,
  "updatedAt"        timestamptz not null default now()
);

insert into public.pricing (id)
values (1)
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
  insert into public.profiles (id, name, email, phone, role, "function")
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'collaborator'),
    nullif(new.raw_user_meta_data ->> 'function', '')
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
  p_password text default null,
  p_phone    text default '',
  p_function text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_role not in ('superuser', 'admin', 'collaborator', 'technician') then
    raise exception 'Invalid role.';
  end if;

  if p_function is not null
     and p_function not in ('diretor-producao', 'diretor-tecnico', 'produtor-executivo', 'gestor-operativo', 'gestor-manutencao', 'tecnico') then
    raise exception 'Invalid function.';
  end if;

  select * into v_profile from public.profiles where id = p_id;
  if not found then
    raise exception 'User not found.';
  end if;

  if v_profile.role = 'superuser' and not exists (
    select 1 from public.profiles where id = p_actor and role = 'superuser'
  ) then
    raise exception 'Only the Superuser can update the protected Superuser account.';
  end if;

  if v_profile.role = 'superuser' and p_role <> 'superuser' then
    raise exception 'Cannot change the protected Superuser role.';
  end if;

  -- Protecção: não remover o último privilegiado (superuser/admin) do sistema.
  if v_profile.role in ('superuser', 'admin') and p_role not in ('superuser', 'admin') then
    if p_actor = p_id then
      raise exception 'Cannot remove admin role from your own account.';
    end if;
    if not exists (
      select 1 from public.profiles
       where role in ('superuser', 'admin') and id <> p_id
    ) then
      raise exception 'Cannot remove the last administrator role.';
    end if;
  end if;

  if exists (select 1 from public.profiles where lower(email) = lower(p_email) and id <> p_id) then
    raise exception 'Email already in use.';
  end if;

  update public.profiles
     set name = p_name,
         email = lower(p_email),
         phone = coalesce(nullif(p_phone, ''), phone),
         role = p_role,
         "function" = p_function
   where id = p_id;

  update auth.users
     set email = lower(p_email),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         encrypted_password = coalesce(crypt(p_password, gen_salt('bf', 10)), encrypted_password),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('name', p_name, 'phone', p_phone, 'role', p_role, 'function', p_function)
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

  if v_profile.role = 'superuser' then
    raise exception 'Cannot delete the protected Superuser account.';
  end if;

  if v_profile.role in ('superuser', 'admin')
     and not exists (
       select 1 from public.profiles
        where role in ('superuser', 'admin') and id <> p_id
     ) then
    raise exception 'Cannot delete the last system administrator account.';
  end if;

  update public.bookings
     set "assignedCollaborator" = null
   where "assignedCollaborator" ->> 'id' = p_id::text;

  delete from auth.users where id = p_id;  -- profiles elimina em cascata
end;
$$;

grant execute on function public.admin_update_user(uuid, uuid, text, text, text, text, text, text) to anon, authenticated;
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
--
--    Nota: o SUPERUSER é identificado pelo email definido em
--    VITE_SUPABASE_EMAIL/SUPERUSER_EMAIL no código (default:
--    pedroveiga.box@gmail.com) com fallback no login. Podes ainda
--    marcá-lo como 'superuser' na BD para ficar explícito:
--
--    update public.profiles set role = 'superuser'
--    where email = 'pedroveiga.box@gmail.com';
--
--    Função/cargo (metadado opcional por utilizador):
--    update public.profiles set "function" = 'produtor-executivo'
--    where email = 'pedroveiga.box@gmail.com';
-- ------------------------------------------------------------
