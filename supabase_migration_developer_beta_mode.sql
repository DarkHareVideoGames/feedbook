-- ============================================================================
-- FeedBook — Developer pode gerir o modo beta (Issue #147)
--
-- Correr no SQL Editor do Supabase após as migrações de segurança e de
-- developer notifications. Idempotente.
-- ============================================================================

-- Mantém a leitura pública da feature flag e limita a escrita aos perfis
-- administrativos ou aos perfis explicitamente marcados como developer.
drop policy if exists "admin write app_settings" on public.app_settings;
drop policy if exists "developer write app_settings" on public.app_settings;
create policy "developer write app_settings" on public.app_settings for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('admin', 'superuser') or p."isDeveloper" = true)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('admin', 'superuser') or p."isDeveloper" = true)
    )
  );

-- Permite que o developer registe apenas a sua alteração de modo beta;
-- mantém a leitura de auditoria reservada a admin/superuser.
drop policy if exists "developer write audit logs" on public.audit_logs;
create policy "developer write audit logs" on public.audit_logs for insert to authenticated
  with check (
    action = 'app-settings-updated'
    and target = 'app_settings'
    and (
      actor ->> 'id' = auth.uid()::text
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'superuser')
      )
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('admin', 'superuser') or p."isDeveloper" = true)
    )
  );

notify pgrst, 'reload schema';