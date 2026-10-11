-- ============================================================================
-- Feedback - Ensaios — Definições da app (feature flags globais)
-- Corre no SQL Editor do Supabase. Idempotente: pode ser corrido várias vezes.
--
-- Guarda o estado do badge "Beta" de forma GLOBAL (partilhada por todos os
-- dispositivos), ao contrário do localStorage que era por-browser. Linha única
-- (id = 1), leitura pública (anon) e escrita reservada a utilizadores
-- autenticados (a API valida o papel admin/superuser antes de escrever).
-- ============================================================================

create table if not exists public.app_settings (
  id           boolean     primary key default true check (id = true),
  "betaEnabled" boolean    not null default true,
  "updatedAt"  timestamptz not null default now()
);

-- Linha única com o badge ativo por omissão.
insert into public.app_settings (id, "betaEnabled")
values (true, true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "public read app_settings" on public.app_settings;
drop policy if exists "public insert app_settings" on public.app_settings;
drop policy if exists "public update app_settings" on public.app_settings;
drop policy if exists "public delete app_settings" on public.app_settings;

-- Leitura pública: o site (anon) precisa de ler o estado do badge.
create policy "public read app_settings"
  on public.app_settings for select
  to anon, authenticated using (true);

-- Escrita apenas para autenticados (a API restringe a admin/superuser).
create policy "public insert app_settings"
  on public.app_settings for insert
  to authenticated with check (true);

create policy "public update app_settings"
  on public.app_settings for update
  to authenticated using (true) with check (true);
