-- ═══════════════════════════════════════════════════════════════════════════
-- EL ASESOR NO VE LA PLATA DEL COMERCIO, TAMPOCO DESPUÉS DE OPTIMIZAR
--
-- Dos migraciones reescribieron `at_dashboard_kpis` sin saber una de la otra,
-- porque vivían en ramas distintas:
--
--   · 0100 (rama de perfil/admin) le quitó al asesor comercial `tli_pct` y
--     `cod_pending`: trabaja PARA un comercio, no es su dueño, y la salud
--     financiera es del dueño;
--   · 0109 (main) reescribió la misma función para que hiciera UN solo
--     recorrido de at_guides en vez de siete subconsultas.
--
-- Las dos son buenas y ninguna es la culpable. El problema es el orden: 0109
-- lleva número más alto, así que al aplicarse pisa entera la definición de la
-- 0100 y devuelve el margen y el recaudo pendiente a quien no le toca. Sin
-- error, sin aviso: la función sigue existiendo y respondiendo, solo que con
-- una cifra de más para el asesor.
--
-- Esta migración escribe la versión que ninguna de las dos alcanzó a escribir:
-- el recorrido único de la 0109 con el recorte por rol de la 0100.
--
-- Es `create or replace`, así que da igual en qué orden se aplique respecto a
-- las otras dos mientras se aplique DESPUÉS. Con el número 0115 lo está.
--
-- ── Un matiz respecto a la 0100 ───────────────────────────────────────────
-- La 0100 decía «al asesor ni siquiera se le corre la consulta», y era cierto:
-- cada métrica era su propia subconsulta y el `case` la evitaba entera. Aquí
-- ya no hay siete consultas que evitar, hay un recorrido único del que salen
-- todas las cifras a la vez. El `case` sigue decidiendo qué se DEVUELVE, que
-- es lo que importa para lo que el asesor puede ver; lo que se ahorraba en
-- trabajo lo ahorra ahora, y de sobra, el recorrido único de la 0109.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.at_dashboard_kpis()
returns json
language plpgsql
security definer
set search_path to 'public'
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_client   uuid := public.at_my_client();
  v_facility uuid := public.at_my_facility();
  v_rol      public.at_role := public.at_my_role();
  -- «Es de un comercio»: el dueño y su asesor.
  v_es_cliente boolean := v_rol in ('cliente','asesor');
  -- El que solo opera. Se separa del anterior a propósito: `v_es_cliente`
  -- responde «¿es del comercio?» y este responde «¿es el dueño?», que no es la
  -- misma pregunta y mezclarlas fue lo que dejó la plata a la vista.
  v_solo_opera boolean := v_rol = 'asesor';
  result json;
begin
  if not (public.at_is_staff() or coalesce(v_es_cliente, false)) then
    raise exception 'No autorizado';
  end if;

  with base as (
    -- El único recorrido. El filtro de comercio y sede se aplica aquí, una vez,
    -- en vez de repetirse en siete subconsultas.
    select
      g.status,
      g.created_at,
      g.delivered_at,
      g.picked_up_at,
      g.is_cod,
      g.cod_amount,
      g.settlement_id,
      g.courier_id,
      g.created_at > now() - interval '30 days' as reciente
    from public.at_guides g
    where (v_client is null or g.client_id = v_client)
      and (v_facility is null or g.facility_id = v_facility)
  )
  select json_build_object(
    'by_status', coalesce(
      (select json_object_agg(s.status, s.n)
       from (select b.status, count(*) n from base b group by b.status) s),
      '{}'::json
    ),
    'guides_today',    count(*) filter (where created_at::date = current_date),
    'delivered_today', count(*) filter (where delivered_at::date = current_date),
    'ltr_hours', round(
      (avg(extract(epoch from (picked_up_at - created_at)) / 3600)
       filter (where picked_up_at is not null and reciente))::numeric, 1),

    -- ── Solo para el dueño ───────────────────────────────────────────────
    'tli_pct', case when v_solo_opera then null::numeric else round(
      100.0 * count(*) filter (where reciente and status = 'devuelta')
      / nullif(count(*) filter (where reciente and status in ('entregada','devuelta')), 0), 1)
    end,

    -- Cero y no `null` porque el tipo del frontend lo declara `number` y hay
    -- pantallas que lo formatean como pesos. La tarjeta no se pinta para el
    -- asesor, así que el cero no se lee en ninguna parte: es solo un relleno
    -- que no dice cuánta plata hay.
    'cod_pending', case when v_solo_opera then 0::numeric else coalesce(
      sum(cod_amount) filter (where is_cod and status = 'entregada' and settlement_id is null), 0)
    end,

    'settlements_pending', case when v_es_cliente then 0 else (
      -- Esta es de otra tabla, así que se queda aparte.
      select count(*) from public.at_settlements s
      where s.status in ('pendiente','consignado')
        and (v_facility is null or (
          select p.facility_id from public.at_profiles p where p.id = s.courier_id
        ) = v_facility)
    ) end,
    'active_couriers', count(distinct courier_id)
      filter (where status in ('zonificada','en_ruta') and courier_id is not null)
  ) into result
  from base;

  return result;
end $function$;

comment on function public.at_dashboard_kpis() is
  'Métricas de Mi panel, en un solo recorrido de at_guides y recortadas por rol. El asesor comercial no recibe tli_pct ni cod_pending: opera para el comercio pero la salud financiera es del dueño.';

-- Los permisos son los de siempre; se repiten porque `create or replace` no los
-- toca pero tampoco los garantiza si alguien los movió por el camino.
revoke execute on function public.at_dashboard_kpis() from public, anon;
grant execute on function public.at_dashboard_kpis() to authenticated;

-- ── Cómo se comprueba ─────────────────────────────────────────────────────
-- Con la sesión de un asesor abierta:
--   select (public.at_dashboard_kpis() ->> 'tli_pct')     as tli,      -- null
--          (public.at_dashboard_kpis() ->> 'cod_pending') as recaudo;  -- 0
-- Con la del dueño del mismo comercio, las dos traen cifra.
