-- ============================================================
-- FeedBook — ONBOARDING DO PAINEL ADMINISTRATIVO (Issue #135)
-- Aplicar após as migrações de segurança. Idempotente.
-- ============================================================

create table if not exists public.admin_onboarding_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  onboarding_version integer not null default 1,
  status text not null default 'not_started',
  last_step integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_onboarding_progress_status_check
    check (status in ('not_started', 'in_progress', 'completed', 'skipped')),
  constraint admin_onboarding_progress_last_step_check
    check (last_step >= 0)
);

alter table public.admin_onboarding_progress
  add column if not exists onboarding_version integer not null default 1,
  add column if not exists status text not null default 'not_started',
  add column if not exists last_step integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.admin_onboarding_progress
  drop constraint if exists admin_onboarding_progress_status_check,
  add constraint admin_onboarding_progress_status_check
    check (status in ('not_started', 'in_progress', 'completed', 'skipped'));

alter table public.admin_onboarding_progress
  drop constraint if exists admin_onboarding_progress_last_step_check,
  add constraint admin_onboarding_progress_last_step_check
    check (last_step >= 0);

alter table public.admin_onboarding_progress enable row level security;

drop policy if exists "users manage own onboarding progress" on public.admin_onboarding_progress;
create policy "users manage own onboarding progress"
  on public.admin_onboarding_progress
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_admin_onboarding_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_onboarding_progress_updated_at on public.admin_onboarding_progress;
create trigger set_admin_onboarding_progress_updated_at
before update on public.admin_onboarding_progress
for each row execute function public.set_admin_onboarding_progress_updated_at();

notify pgrst, 'reload schema';