-- Issue #154: até 5 fotos por sala. Aplicar após room_images.
-- Não altera políticas RLS nem ficheiros do Storage.
begin;

alter table public.rooms
  add column if not exists "imageUrls" text[];

-- Preservar a fotografia atual como primeira foto da galeria.
update public.rooms
set "imageUrls" = case
  when nullif(btrim("imageUrl"), '') is not null then array[btrim("imageUrl")]
  else array[]::text[]
end
where "imageUrls" is null;

alter table public.rooms
  alter column "imageUrls" set default array[]::text[],
  alter column "imageUrls" set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_image_urls_max_five'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms add constraint rooms_image_urls_max_five
      check (cardinality("imageUrls") <= 5);
  end if;
end $$;

commit;