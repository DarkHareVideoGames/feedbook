-- ============================================================
-- Feedback - Ensaios — MIGRAÇÃO de utilizadores
-- (superuser + campo "function"/Função)
--
-- Correr no SQL Editor do painel do Supabase.
-- É IDEMPOTENTE e SEGURO para uma base com dados: NÃO recria
-- nem apaga tabelas. Apenas ajusta a tabela profiles, o trigger
-- de criação de perfil e as funções administrativas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna "function" (Função/cargo — metadado, sem permissões)
-- ------------------------------------------------------------
alter table public.profiles add column if not exists "function" text;

-- ------------------------------------------------------------
-- 2. Checks: role passa a aceitar 'superuser'; valida 'function'
--    (removemos e recriamos os constraints pelo nome para ser idempotente)
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superuser', 'admin', 'collaborator', 'technician'));

alter table public.profiles drop constraint if exists profiles_function_check;
alter table public.profiles add constraint profiles_function_check
  check ("function" is null or "function" in
    ('diretor-producao', 'diretor-tecnico', 'produtor-executivo', 'gestor-operativo', 'gestor-manutencao', 'tecnico'));

-- ------------------------------------------------------------
-- 3. Trigger de criação de perfil (passa a gravar a "function")
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
-- 4. admin_update_user — aceita superuser e grava "function"
--    (protege o último privilegiado: superuser/admin)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 5. admin_delete_user — protege a conta Superuser e o último privilegiado
-- ------------------------------------------------------------
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

-- ============================================================
-- 6. Promover o administrador root a SUPERUSER e definir a função.
--    Ajusta o email se necessário antes de executar a migração.
--    Nota: o SUPERUSER também é reconhecido pelo email definido
--    no código (SUPERUSER_EMAIL / VITE_SUPERUSER_EMAIL), com
--    fallback no login — por isso este passo é só para deixar
--    explícito na base de dados.
-- ============================================================
update public.profiles
   set role = 'superuser',
       "function" = 'diretor-tecnico'
 where lower(email) = 'pedroveiga.box@gmail.com';

