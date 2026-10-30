-- ============================================================
-- FeedBook — MIGRAÇÃO DE SEGURANÇA (Issue #38)
-- Endurecimento de RLS, proteção de PII e validação de atores.
-- Idempotente. Aplicar após as migrações anteriores.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ativar RLS em todas as tabelas
-- ------------------------------------------------------------
alter table public.bookings enable row level security;
alter table public.profiles enable row level security;
alter table public.pricing enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rooms enable row level security;
alter table public.services enable row level security;
alter table public.app_settings enable row level security;

-- ------------------------------------------------------------
-- 2. Remover políticas públicas permissivas
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bookings','profiles','pricing','audit_logs','rooms','services','app_settings'] loop
    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('drop policy if exists "public insert %s" on public.%I', t, t);
    execute format('drop policy if exists "public update %s" on public.%I', t, t);
    execute format('drop policy if exists "public delete %s" on public.%I', t, t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 3. Políticas least-privilege
-- ------------------------------------------------------------

-- As políticas RLS não podem consultar public.profiles diretamente para
-- verificar o role: na própria tabela profiles isso provoca recursão infinita
-- (PostgreSQL 42P17). Esta função corre como definer e centraliza a verificação.
create or replace function public.has_profile_role(p_roles text[])
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
      and role = any(p_roles)
  );
$$;

revoke all on function public.has_profile_role(text[]) from public;
grant execute on function public.has_profile_role(text[]) to authenticated;

create or replace function public.can_manage_beta()
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
      and (role in ('admin', 'superuser') or "isDeveloper" = true)
  );
$$;

revoke all on function public.can_manage_beta() from public;
grant execute on function public.can_manage_beta() to authenticated;

-- rooms: catálogo público (leitura), escrita só admin/superuser
drop policy if exists "anon read rooms" on public.rooms;
create policy "anon read rooms" on public.rooms for select to anon, authenticated using (true);
drop policy if exists "admin write rooms" on public.rooms;
create policy "admin write rooms" on public.rooms for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- services
drop policy if exists "anon read services" on public.services;
create policy "anon read services" on public.services for select to anon, authenticated using (true);
drop policy if exists "admin write services" on public.services;
create policy "admin write services" on public.services for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- pricing
drop policy if exists "anon read pricing" on public.pricing;
create policy "anon read pricing" on public.pricing for select to anon, authenticated using (true);
drop policy if exists "admin write pricing" on public.pricing;
create policy "admin write pricing" on public.pricing for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- app_settings (flag de beta pública em leitura)
drop policy if exists "anon read app_settings" on public.app_settings;
create policy "anon read app_settings" on public.app_settings for select to anon, authenticated using (true);
drop policy if exists "admin write app_settings" on public.app_settings;
create policy "admin write app_settings" on public.app_settings for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- bookings: leitura pública (linhas), mas colunas PII restritas por grants abaixo
drop policy if exists "anon read bookings" on public.bookings;
create policy "anon read bookings" on public.bookings for select to anon using (true);
drop policy if exists "staff read bookings" on public.bookings;
create policy "staff read bookings" on public.bookings for select to authenticated using (true);
drop policy if exists "staff write bookings" on public.bookings;
create policy "staff write bookings" on public.bookings for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser', 'collaborator', 'technician']))
  with check (public.has_profile_role(array['admin', 'superuser', 'collaborator', 'technician']));

-- profiles: sem acesso anon; autenticado lê o próprio ou admin/superuser
drop policy if exists "self or admin read profiles" on public.profiles;
create policy "self or admin read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_profile_role(array['admin', 'superuser']));
drop policy if exists "admin write profiles" on public.profiles;
create policy "admin write profiles" on public.profiles for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- audit_logs: apenas admin/superuser
drop policy if exists "admin read audit_logs" on public.audit_logs;
create policy "admin read audit_logs" on public.audit_logs for select to authenticated
  using (public.has_profile_role(array['admin', 'superuser']));
drop policy if exists "admin write audit_logs" on public.audit_logs;
create policy "admin write audit_logs" on public.audit_logs for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

-- ------------------------------------------------------------
-- 4. Restringir colunas PII em bookings para anon
-- ------------------------------------------------------------
revoke select on public.bookings from anon;
grant select (id, "roomId", "roomName", status, date, time, duration) on public.bookings to anon;

-- ------------------------------------------------------------
-- 5. Funções administrativas: ator derivado de auth.uid()
-- ------------------------------------------------------------
create or replace function public.admin_update_user(
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
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'Not authenticated.';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and role in ('admin','superuser')) then
    raise exception 'Access denied.';
  end if;

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

  if v_profile.role = 'superuser' and not exists (select 1 from public.profiles where id = v_actor and role = 'superuser') then
    raise exception 'Only the Superuser can update the protected Superuser account.';
  end if;

  if v_profile.role = 'superuser' and p_role <> 'superuser' then
    raise exception 'Cannot change the protected Superuser role.';
  end if;

  if v_profile.role in ('superuser', 'admin') and p_role not in ('superuser', 'admin') then
    if v_actor = p_id then
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

create or replace function public.admin_delete_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'Not authenticated.';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and role in ('admin','superuser')) then
    raise exception 'Access denied.';
  end if;

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

revoke execute on function public.admin_update_user(uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.admin_delete_user(uuid) from anon;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
