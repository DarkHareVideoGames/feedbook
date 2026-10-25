-- ============================================================
-- FeedBook — CORREÇÃO DE RLS PARA MARCAÇÕES
-- Garante que a criação pública de marcações funciona e que
-- audit_logs pode ser escrita pelo service role.
-- Idempotente. Aplicar no SQL Editor do Supabase.
-- ============================================================

-- 0. Garantir coluna customerMessage (idempotente)
alter table public.bookings
  add column if not exists "customerMessage" text;

-- 1. Garantir GRANTs para service_role
grant all on public.bookings to service_role;
grant all on public.audit_logs to service_role;
grant all on public.rooms to service_role;
grant all on public.services to service_role;

-- 2. Leitura pública mínima em bookings para anon
revoke select on public.bookings from anon;
grant select (id, "roomId", "roomName", status, date, time, duration) on public.bookings to anon;

-- 3. Staff pode ler/escrever bookings e audit_logs
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.audit_logs to authenticated;

-- 4. Políticas RLS idempotentes
drop policy if exists "anon read bookings" on public.bookings;
create policy "anon read bookings" on public.bookings for select to anon using (true);

drop policy if exists "staff read bookings" on public.bookings;
create policy "staff read bookings" on public.bookings for select to authenticated using (true);

drop policy if exists "staff write bookings" on public.bookings;
create policy "staff write bookings" on public.bookings for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superuser','collaborator','technician')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superuser','collaborator','technician')));

drop policy if exists "admin read audit_logs" on public.audit_logs;
create policy "admin read audit_logs" on public.audit_logs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superuser')));

drop policy if exists "admin write audit_logs" on public.audit_logs;
create policy "admin write audit_logs" on public.audit_logs for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superuser')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superuser')));

-- 5. Service role explícito
drop policy if exists "service write audit_logs" on public.audit_logs;
create policy "service write audit_logs" on public.audit_logs for all to service_role using (true) with check (true);

drop policy if exists "service write bookings" on public.bookings;
create policy "service write bookings" on public.bookings for all to service_role using (true) with check (true);

-- 6. Forçar refresh do schema cache do PostgREST
notify pgrst, 'reload schema';
