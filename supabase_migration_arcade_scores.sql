-- Issue #191. Apply manually before enabling the shared 404 leaderboard.
begin;
create table if not exists public.arcade_scores (
  session_id uuid primary key,
  nick text not null check (nick ~ '^[A-Z0-9_-]{3,12}$'),
  score integer not null check (score between 1 and 36000),
  client_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists arcade_scores_ranking on public.arcade_scores (score desc, created_at asc);
create index if not exists arcade_scores_client on public.arcade_scores (client_hash, created_at desc);
alter table public.arcade_scores enable row level security;
revoke all on public.arcade_scores from public, anon, authenticated;
grant select, insert, delete on public.arcade_scores to service_role;

-- Invoker: only service_role has EXECUTE and table access. Atomic per-client rate limit.
create or replace function public.submit_arcade_score(p_session uuid, p_nick text, p_score integer, p_client text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client, 191));
  if (select count(*) from public.arcade_scores where client_hash = p_client
      and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'arcade_rate_limit';
  end if;
  insert into public.arcade_scores(session_id, nick, score, client_hash)
    values (p_session, p_nick, p_score, p_client);
end;
$$;
revoke all on function public.submit_arcade_score(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.submit_arcade_score(uuid, text, integer, text) to service_role;
commit;