-- ============================================================
-- FeedBook — Salas + Serviços dinâmicos (pie-menu)
-- Correr no SQL Editor do Supabase DEPOIS do supabase_schema.sql
-- Cria tabelas public.rooms e public.services com seed inicial
-- que espelha os valores que hoje estão fixos no código.
-- ============================================================

-- ------------------------------------------------------------
-- 1. rooms — catálogo de salas gerido no pie-menu
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id text primary key,
  name text not null,
  description text not null default '',
  "descriptionEn" text not null default '',
  "maxMembers" integer not null default 4 check ("maxMembers" > 0),
  "pricePerMemberHour" numeric(10,2),
  gear text[] not null default '{}',
  "gearEn" text[] not null default '{}',
  accent text not null default 'var(--room-red)',
  active boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Seed com as 2 salas que já existem no site.
-- pricePerMemberHour a NULL = usa o preçário global (pricing.perMemberPerHour).
insert into public.rooms (id, name, description, "descriptionEn", "maxMembers", "pricePerMemberHour", gear, "gearEn", accent, active)
values
  (
    'sala-red',
    'SALA RED',
    'Sala de impacto forte para ensaios completos e passagens de alinhamento com pressao real.',
    'High-impact room for full-band rehearsals and pressure-tested run-throughs.',
    6,
    null,
    array['Bateria completa', '2 amps de guitarra', 'PA com monitores'],
    array['Full drum kit', '2 guitar amps', 'PA with monitors'],
    'var(--room-red)',
    true
  ),
  (
    'sala-grey',
    'SALA GREY',
    'Sala equilibrada para composicao, vozes e trabalho de detalhe com mais controlo dinamico.',
    'Balanced room for songwriting, vocals, and detail-focused arrangement work.',
    5,
    null,
    array['Bateria compacta', 'Amp de baixo', 'PA com efeitos de voz'],
    array['Compact drum kit', 'Bass amp', 'PA with vocal FX'],
    'var(--room-grey)',
    true
  )
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. services — catálogo de extras/serviços gerido no pie-menu
-- ------------------------------------------------------------
create table if not exists public.services (
  id text primary key,
  name text not null,
  "nameEn" text not null default '',
  description text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  "sortOrder" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Seed com os 3 extras que já existem no preçário.
insert into public.services (id, name, "nameEn", description, price, active, "sortOrder")
values
  ('engineer', 'Tecnico de sessao', 'Session engineer', '', 24, true, 0),
  ('recording', 'Captacao stereo do ensaio', 'Stereo rehearsal capture', '', 18, true, 1),
  ('backline', 'Preparacao extra de backline', 'Extra backline setup', '', 12, true, 2)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3. updatedAt automático
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists rooms_touch_updated on public.rooms;
create trigger rooms_touch_updated
  before update on public.rooms
  for each row execute function public.touch_updated_at();

drop trigger if exists services_touch_updated on public.services;
create trigger services_touch_updated
  before update on public.services
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 4. RLS — mesmas políticas públicas do schema base (testes).
--    ATENÇÃO: antes de produção, restringir escrita a admins.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'services']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "public read %s" on public.%I', t, t);
    execute format('drop policy if exists "public insert %s" on public.%I', t, t);
    execute format('drop policy if exists "public update %s" on public.%I', t, t);
    execute format('drop policy if exists "public delete %s" on public.%I', t, t);

    execute format(
      'create policy "public read %s" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format(
      'create policy "public insert %s" on public.%I for insert to anon, authenticated with check (true)', t, t);
    execute format(
      'create policy "public update %s" on public.%I for update to anon, authenticated using (true) with check (true)', t, t);
    execute format(
      'create policy "public delete %s" on public.%I for delete to anon, authenticated using (true)', t, t);
  end loop;
end;
$$;
