-- ============================================================================
-- Feedback - Ensaios — utilizadores desenvolvedores para notificações Beta
--
-- Correr no SQL Editor do Supabase. Idempotente e seguro para dados existentes.
-- Adiciona a flag sem permissões associadas e atualiza a criação/edição de perfis.
-- ============================================================================

alter table public.profiles
  add column if not exists "isDeveloper" boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, role, "function", "isDeveloper")
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'collaborator'),
    nullif(new.raw_user_meta_data ->> 'function', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'isDeveloper', '')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A assinatura anterior tem menos um argumento. É removida para evitar overloads
-- ambíguos no PostgREST depois de acrescentar p_is_developer.
drop function if exists public.admin_update_user(uuid, text, text, text, text, text, text);

create or replace function public.admin_update_user(
  p_id           uuid,
  p_email        text,
  p_name         text,
  p_role         text,
  p_password     text default null,
  p_phone        text default '',
  p_function     text default null,
  p_is_developer boolean default false
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
         "function" = p_function,
         "isDeveloper" = coalesce(p_is_developer, false)
   where id = p_id;

  update auth.users
     set email = lower(p_email),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         encrypted_password = coalesce(crypt(p_password, gen_salt('bf', 10)), encrypted_password),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object(
                                   'name', p_name,
                                   'phone', p_phone,
                                   'role', p_role,
                                   'function', p_function,
                                   'isDeveloper', coalesce(p_is_developer, false)
                                 )
   where id = p_id;

  select * into v_profile from public.profiles where id = p_id;
  return v_profile;
end;
$$;

revoke execute on function public.admin_update_user(uuid, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text, text, boolean) to authenticated;
