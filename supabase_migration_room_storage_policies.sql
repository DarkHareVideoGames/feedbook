-- ============================================================
-- FeedBook — Storage: políticas do bucket "images" (fotos das salas)
-- ============================================================
-- Pressupostos:
--   * O bucket "images" é PÚBLICO (leitura anónima para o site).
--   * As fotos ficam na pasta "rooms/" (path: rooms/<sala>-<ts>.<ext>).
--   * A escrita é feita pelo admin logado (Supabase Auth → role authenticated).
--
-- Efeito:
--   * Leitura (select): anon + authenticated, só em images/rooms/*.
--   * Upload (insert): apenas authenticated, só em images/rooms/* e
--     apenas jpg/jpeg/png/webp.
--   * Update/Delete: apenas authenticated, só em images/rooms/*.
--
-- Idempotente: cada policy é removida antes de ser recriada.
-- Correr no SQL Editor do Supabase.
-- ============================================================

-- 1) Leitura pública (o site carrega as fotos sem login).
drop policy if exists "public read room images" on storage.objects;
create policy "public read room images"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'rooms'
  );

-- 2) Upload apenas para utilizadores autenticados (admins), na pasta rooms/.
drop policy if exists "admins upload room images" on storage.objects;
create policy "admins upload room images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'rooms'
    and storage."extension"(name) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- 3) Atualização/substituição apenas para autenticados, na pasta rooms/.
drop policy if exists "admins update room images" on storage.objects;
create policy "admins update room images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'rooms'
  )
  with check (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'rooms'
  );

-- 4) Remoção apenas para autenticados, na pasta rooms/.
drop policy if exists "admins delete room images" on storage.objects;
create policy "admins delete room images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'images'
    and (storage.foldername(name))[1] = 'rooms'
  );
