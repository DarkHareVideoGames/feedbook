-- ============================================================================
-- FeedBook — Developer pode gerir o modo beta (Issue #147)
--
-- Correr no SQL Editor do Supabase após as migrações de segurança e de
-- developer notifications. Idempotente.
-- ============================================================================

-- Mantém a leitura pública da feature flag e limita a escrita aos perfis
-- administrativos ou aos perfis explicitamente marcados como developer.
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

drop policy if exists "admin write app_settings" on public.app_settings;
drop policy if exists "developer write app_settings" on public.app_settings;
create policy "developer write app_settings" on public.app_settings for all to authenticated
  using (public.can_manage_beta())
  with check (public.can_manage_beta());

-- Permite que o developer registe apenas a sua alteração de modo beta;
-- mantém a leitura de auditoria reservada a admin/superuser.
drop policy if exists "developer write audit logs" on public.audit_logs;
create policy "developer write audit logs" on public.audit_logs for insert to authenticated
  with check (
    action = 'app-settings-updated'
    and target = 'app_settings'
    and (
      actor ->> 'id' = auth.uid()::text
      or public.has_profile_role(array['admin', 'superuser'])
    )
    and public.can_manage_beta()
  );

notify pgrst, 'reload schema';