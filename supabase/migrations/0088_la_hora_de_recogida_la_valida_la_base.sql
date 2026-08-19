-- ═══════════════════════════════════════════════════════════════════════════
-- LA HORA DE RECOGIDA LA VALIDA LA BASE — no el reloj del navegador
--
-- La pantalla de Recogidas ya no ofrece horas que no se pueden atender: los
-- turnos van de 15 en 15 dentro de la franja, y si la fecha es hoy desaparecen
-- las que ya pasaron. Pero eso es cortesía, no una garantía:
--
--   · El reloj lo pone el aparato del cliente. Un PC con la fecha mal puesta
--     —o alguien que la cambia a propósito— ve otra lista.
--   · La RPC se puede llamar sola, sin pasar por la pantalla.
--   · Y hay una puerta más ancha que esa: la política «cliente solicita
--     recogida propia» (migración 0010) permite un INSERT directo sobre
--     at_pickups. Cualquier validación que viva SOLO dentro de
--     at_request_pickup se salta escribiendo en la tabla.
--
-- Por eso esto no se mete en las funciones sino en la tabla, que es por donde
-- pasan todos los caminos: un CHECK para lo que no depende del reloj (la
-- franja y los turnos) y un trigger para lo que sí (que el momento no haya
-- pasado). Lo que se agregue mañana —otra pantalla, un import, una edge
-- function— nace validado sin acordarse de esto.
--
-- Los mensajes son palabra por palabra los mismos que muestra la pantalla:
-- PostgREST entrega el texto de la excepción y la pantalla lo pinta tal cual,
-- así que si aquí se escriben distinto el comercio lee dos versiones del mismo
-- problema según por dónde le llegue.
--
-- Al comercio se le exige; al CEDI no. Un operario a veces registra una
-- recogida que está ocurriendo delante de él, o se pone al día con la del día
-- anterior: bloquearlo no protege nada y sí para la operación.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La franja y los turnos, como restricción de la tabla ──────────────
-- Esto no necesita reloj: las 07:40 están fuera de la jornada hoy, ayer y en
-- diciembre. Va como CHECK y no dentro de una función porque es una propiedad
-- del dato, no del camino por el que entró.
--
-- NOT VALID a propósito: las filas que ya existen no se revisan. Si alguna
-- recogida vieja tiene 07:40 guardado, el despliegue no se cae por eso —pero
-- desde ya ningún INSERT ni UPDATE puede escribir una hora fuera de rejilla—.
-- Cuando quieras darla por buena del todo, mira qué hay fuera de la franja:
--
--   select id, scheduled_date, scheduled_time from public.at_pickups
--   where scheduled_time is not null
--     and (scheduled_time < time '08:00' or scheduled_time > time '17:00'
--          or extract(minute from scheduled_time)::int % 15 <> 0
--          or extract(second from scheduled_time) <> 0);
--
-- y, si no queda nada, ejecuta:
--   alter table public.at_pickups validate constraint at_pickups_hora_en_franja;
alter table public.at_pickups
  drop constraint if exists at_pickups_hora_en_franja;

alter table public.at_pickups
  add constraint at_pickups_hora_en_franja check (
    scheduled_time is null
    or (
      scheduled_time >= time '08:00'
      and scheduled_time <= time '17:00'
      and extract(minute from scheduled_time)::int % 15 = 0
      and extract(second from scheduled_time) = 0
    )
  ) not valid;

comment on constraint at_pickups_hora_en_franja on public.at_pickups is
  'La hora deseada cae en la jornada (08:00–17:00) y en un turno de 15 minutos. La pantalla de Recogidas ofrece exactamente estas opciones; esto es lo que impide que entre otra cosa por otro camino.';

-- ── 2. Que el momento no haya pasado ─────────────────────────────────────
-- Esto sí necesita reloj, y el reloj bueno es el del servidor.
--
-- `set "TimeZone"` es obligatorio aquí por lo que explica la migración 0041:
-- la base corre en UTC, así que sin esto `current_date` cambia de día a las
-- 7 p. m. hora de Medellín y a las 8 de la noche la función daría por
-- «mañana» lo que el comercio está pidiendo para hoy.
create or replace function public.at_valida_momento_recogida()
returns trigger
language plpgsql
security definer
set search_path to 'public'
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_role public.at_role := public.at_my_role();
begin
  -- El CEDI registra lo que ve. Esta validación protege al comercio de pedir
  -- algo imposible, no al operario de escribir lo que ya ocurrió.
  if v_role is null or v_role not in ('cliente', 'asesor') then
    return new;
  end if;

  if new.scheduled_date < current_date then
    raise exception 'La hora seleccionada ya pasó. Por favor, elige una hora futura o cambia la fecha.'
      using errcode = 'check_violation';
  end if;

  if new.scheduled_date = current_date then
    -- Sin hora («sin preferencia») la recogida vale hasta que cierre la
    -- jornada: es lo que promete la pantalla cuando se deja el campo vacío.
    if localtime >= time '17:00' then
      raise exception 'El horario de recogidas por hoy ha finalizado. Por favor, selecciona una fecha a partir de mañana.'
        using errcode = 'check_violation';
    end if;

    if new.scheduled_time is not null and new.scheduled_time <= localtime then
      raise exception 'La hora seleccionada ya pasó. Por favor, elige una hora futura o cambia la fecha.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $function$;

comment on function public.at_valida_momento_recogida() is
  'Impide que un comercio agende una recogida en un momento que ya pasó. Corre sobre at_pickups y solo cuando la fecha o la hora cambian, para no estorbar al mensajero que cierra a las 6 p. m. una recogida de las 8 a. m.';

revoke execute on function public.at_valida_momento_recogida() from public, anon;

-- Van dos triggers y no uno con un `when` compartido porque en la cláusula
-- `when` de un trigger de INSERT no existe `old` (ni `tg_op`), así que no hay
-- forma de escribir «en INSERT siempre, en UPDATE solo si cambió» en una sola
-- condición. Al INSERT se le mira todo; al UPDATE, solo cuando alguien mueve
-- de verdad el momento.
--
-- Ese `when` del UPDATE es la mitad de esto y no un detalle de rendimiento:
-- sin él, el mensajero que marca «completada» a las 6 p. m. una recogida
-- programada para las 8 a. m. se comería el error de «esa hora ya pasó»,
-- porque su UPDATE también toca la fila.
drop trigger if exists at_pickups_valida_momento on public.at_pickups;
create trigger at_pickups_valida_momento
  before insert on public.at_pickups
  for each row
  execute function public.at_valida_momento_recogida();

drop trigger if exists at_pickups_valida_momento_al_mover on public.at_pickups;
create trigger at_pickups_valida_momento_al_mover
  before update of scheduled_date, scheduled_time on public.at_pickups
  for each row
  when (
    new.scheduled_date is distinct from old.scheduled_date
    or new.scheduled_time is distinct from old.scheduled_time
  )
  execute function public.at_valida_momento_recogida();

-- ── 3. La franja, escrita donde se pueda leer ────────────────────────────
comment on column public.at_pickups.scheduled_time is
  'Hora deseada de recogida, en turnos de 15 minutos entre las 08:00 y las 17:00 (hora de Medellín). NULL = el comercio no tiene preferencia. La franja la sostienen el CHECK at_pickups_hora_en_franja y el trigger at_pickups_valida_momento; la pantalla src/app/(plataforma)/recogidas y src/lib/tiempo.ts ofrecen esa misma rejilla.';
