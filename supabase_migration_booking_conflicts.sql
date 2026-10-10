-- ============================================================
-- Feedback - Ensaios — MIGRAÇÃO de conflitos de marcações
-- (intervalo mínimo de 30 min entre marcações NA MESMA sala)
--
-- Correr no SQL Editor do painel do Supabase.
-- É IDEMPOTENTE: recria apenas a função e o trigger; NÃO mexe
-- em dados nem noutras tabelas. Seguro para uma base com dados.
--
-- Regra (igual à do site): cada marcação ocupa, na sua sala, o
-- intervalo [início, fim + 30 min] — 30 min de folga para
-- preparar/limpar a sala a seguir. Duas marcações NA MESMA sala
-- e NO MESMO dia conflituam se esses intervalos se tocarem:
--     novoInicio < outroFim + 30  AND  outroInicio < novoFim + 30
-- Entre salas diferentes NUNCA há conflito.
--
-- Só entram na conta marcações activas (igual a isBookingActive()
-- do front-end):
--     status NOT IN ('rejected','cancelled')  AND  paymentStatus <> 'refunded'
--
-- O trigger é a "fonte da verdade": mesmo que dois pedidos cheguem
-- ao mesmo tempo, a base de dados só aceita um — evita reserva dupla.
-- ============================================================

create or replace function public.bookings_enforce_buffer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_start integer;
  v_new_end   integer;
begin
  -- Só valida marcações que ocupam a sala (activas). As canceladas,
  -- rejeitadas ou reembolsadas passam sem restrição.
  if NEW.status in ('rejected', 'cancelled')
     or coalesce(NEW."paymentStatus", '') = 'refunded' then
    return NEW;
  end if;

  -- Início/fim da nova marcação, em minutos desde a meia-noite.
  v_new_start := split_part(NEW."time", ':', 1)::int * 60
               + split_part(NEW."time", ':', 2)::int;
  v_new_end   := v_new_start + round(NEW."duration" * 60);

  if exists (
    select 1
      from public.bookings b
     where b.id <> NEW.id                              -- ignora a própria linha (em UPDATE)
       and b."date" = NEW."date"                       -- mesmo dia
       and b."roomId" is not distinct from NEW."roomId" -- mesma sala
       and b.status not in ('rejected', 'cancelled')   -- só activas
       and coalesce(b."paymentStatus", '') <> 'refunded'
       and v_new_start < (split_part(b."time", ':', 1)::int * 60
                          + split_part(b."time", ':', 2)::int)
                         + round(b."duration" * 60) + 30
       and (split_part(b."time", ':', 1)::int * 60
            + split_part(b."time", ':', 2)::int) < v_new_end + 30
  ) then
    raise exception
      'Horário indisponível: esta sala já tem uma marcação que requer 30 minutos de intervalo (preparação/limpeza).',
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

-- BEFORE INSERT OR UPDATE (sem lista de colunas): garante a integridade
-- sempre que uma marcação ocupa a sala, inclusive quando o admin confirma
-- (pending -> confirmed) ou altera data/hora/duração de uma marcação.
drop trigger if exists bookings_enforce_buffer_trigger on public.bookings;
create trigger bookings_enforce_buffer_trigger
  before insert or update on public.bookings
  for each row
  execute function public.bookings_enforce_buffer();
