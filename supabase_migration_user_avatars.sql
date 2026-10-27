-- ============================================================================
-- FeedBook — fotografia opcional dos utilizadores (Issue #133)
--
-- Adiciona profiles."avatarUrl" e políticas para imagens públicas em
-- images/users/. Escrita e remoção ficam limitadas a admin/superuser.
-- Idempotente: seguro de executar mais do que uma vez.
-- ============================================================================

alter table public.profiles
  add column if not exists "avatarUrl" text;

drop policy if exists "public read user avatars" on storage.objects;
create policy "public read user avatars"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'users'
  );

drop policy if exists "admins upload user avatars" on storage.objects;
create policy "admins upload user avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'users'
    and storage."extension"(name) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superuser')
    )
  );

drop policy if exists "admins update user avatars" on storage.objects;
create policy "admins update user avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'users'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superuser')
    )
  )
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'users'
    and storage."extension"(name) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superuser')
    )
  );

drop policy if exists "admins delete user avatars" on storage.objects;
create policy "admins delete user avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'users'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'superuser')
    )
  );