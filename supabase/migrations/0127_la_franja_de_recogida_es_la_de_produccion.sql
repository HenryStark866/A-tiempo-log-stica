-- La franja de recogida y su validación, tal como estaban en producción.
--
-- Hasta hoy estas dos funciones vivían en el staging como reconstrucciones
-- deducidas del código (devolvían un registro y lanzaban otro mensaje). Se
-- recuperó el respaldo de producción del 2026-09-23 y aquí quedan idénticas a
-- las de entonces: la franja es un JSON {desde, hasta} y la validación solo
-- comprueba el rango (los turnos de 15 minutos los exige el CHECK
-- at_pickups_hora_en_franja, 0088).
--
-- Se borran antes de crear porque la forma del resultado de la franja cambia
-- (record -> json) y CREATE OR REPLACE no puede cambiarla. Los permisos que
-- dejó la 0100 se vuelven a dar al final.

drop function if exists public.at_valida_hora_recogida(time without time zone);
drop function if exists public.at_franja_de_recogida();

create or replace function public.at_franja_de_recogida() RETURNS json
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$ select json_build_object('desde', '08:00'::time, 'hasta', '17:00'::time) $$;

comment on function public.at_franja_de_recogida() is 'La franja en la que se recoge. Único lugar donde vive el horario: la app lo muestra y las RPC lo exigen.';

create or replace function public.at_valida_hora_recogida(p_hora time without time zone) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare
  v_desde time := (public.at_franja_de_recogida() ->> 'desde')::time;
  v_hasta time := (public.at_franja_de_recogida() ->> 'hasta')::time;
begin
  -- Null es válido: pedir la recogida sin hora concreta sigue permitido, y el
  -- CEDI la agenda donde le cuadre.
  if p_hora is null then return; end if;
  if p_hora < v_desde or p_hora > v_hasta then
    raise exception 'Recogemos entre las % y las %. Elige una hora dentro de esa franja.',
      to_char(v_desde, 'HH24:MI'), to_char(v_hasta, 'HH24:MI');
  end if;
end $$;


revoke execute on function public.at_franja_de_recogida()                       from public, anon;
revoke execute on function public.at_valida_hora_recogida(time without time zone) from public, anon;
grant  execute on function public.at_franja_de_recogida()                       to authenticated, service_role;
grant  execute on function public.at_valida_hora_recogida(time without time zone) to authenticated, service_role;
