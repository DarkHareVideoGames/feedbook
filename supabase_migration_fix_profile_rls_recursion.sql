-- ============================================================================
-- FeedBook — Correção de recursão RLS em profiles (Issue #149)
--
-- Aplicar no SQL Editor do Supabase após supabase_migration_security_rls.sql.
-- Repara bases de dados onde a política de profiles já causou PostgreSQL 42P17.
-- Idempotente.
-- ============================================================================

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

-- Substitui as restantes políticas administrativas que consultavam profiles
-- diretamente e, por isso, também podiam acionar a política recursiva.
drop policy if exists "admin write rooms" on public.rooms;
create policy "admin write rooms" on public.rooms for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "admin write services" on public.services;
create policy "admin write services" on public.services for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "admin write pricing" on public.pricing;
create policy "admin write pricing" on public.pricing for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "admin write app_settings" on public.app_settings;
create policy "admin write app_settings" on public.app_settings for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "self or admin read profiles" on public.profiles;
create policy "self or admin read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "admin write profiles" on public.profiles;
create policy "admin write profiles" on public.profiles for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "staff write bookings" on public.bookings;
create policy "staff write bookings" on public.bookings for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser', 'collaborator', 'technician']))
  with check (public.has_profile_role(array['admin', 'superuser', 'collaborator', 'technician']));

drop policy if exists "admin read audit_logs" on public.audit_logs;
create policy "admin read audit_logs" on public.audit_logs for select to authenticated
  using (public.has_profile_role(array['admin', 'superuser']));

drop policy if exists "admin write audit_logs" on public.audit_logs;
create policy "admin write audit_logs" on public.audit_logs for all to authenticated
  using (public.has_profile_role(array['admin', 'superuser']))
  with check (public.has_profile_role(array['admin', 'superuser']));

notify pgrst, 'reload schema';