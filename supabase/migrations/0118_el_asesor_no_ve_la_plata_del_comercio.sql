-- A TIEMPO LOGÍSTICA — el panel del asesor deja de traer la plata del comercio.
--
-- El asesor comercial trabaja PARA un comercio; no es su dueño. Su labor es
-- operativa: crear pedidos y programar recogidas. Para eso le sirven las guías
-- del día, el lead time de recogida y el reparto por estado.
--
-- El recaudo contraentrega pendiente y la tasa de devoluciones son otra cosa:
-- son la salud financiera del negocio de otra persona. La pantalla ya dejó de
-- pintar esas dos tarjetas, pero esconder algo en el navegador no es
-- esconderlo: `at_dashboard_kpis` seguía mandando los dos números en el JSON, y
-- verlos era abrir la pestaña de red del navegador. Aquí se dejan de enviar.
--
-- Esta migración solo cambia el cuerpo de esa función. No toca tablas, ni
-- columnas, ni políticas, ni la firma —sigue siendo `at_dashboard_kpis()`
-- devolviendo json con las mismas ocho llaves—, así que el frontend anterior
-- tampoco se rompe: donde había una cifra, para el asesor, llega un cero.
--
-- El molde no es nuevo: la migración 0077 ya hacía exactamente esto con
-- `settlements_pending`, para que el asesor no viera las conciliaciones de caja
-- de toda la operación de A Tiempo.

create or replace function public.at_dashboard_kpis()
returns json
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_client uuid := public.at_my_client();
  v_facility uuid := public.at_my_facility();
  v_rol public.at_role := public.at_my_role();
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

  select json_build_object(
    'by_status', (
      select coalesce(json_object_agg(status, n), '{}'::json)
      from (select status, count(*) n from public.at_guides
            where (v_client is null or client_id = v_client)
              and (v_facility is null or facility_id = v_facility)
            group by status) s
    ),
    'guides_today', (
      select count(*) from public.at_guides
      where created_at::date = current_date
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ),
    'delivered_today', (
      select count(*) from public.at_guides
      where delivered_at::date = current_date
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ),
    'ltr_hours', (
      select round(avg(extract(epoch from (picked_up_at - created_at)) / 3600)::numeric, 1)
      from public.at_guides
      where picked_up_at is not null and created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ),
    -- ── Solo para el dueño ───────────────────────────────────────────────
    -- `null` y no el cálculo: al asesor ni siquiera se le corre la consulta.
    'tli_pct', case when v_solo_opera then null else (
      select round(100.0 * count(*) filter (where status = 'devuelta')
             / nullif(count(*) filter (where status in ('entregada','devuelta')), 0), 1)
      from public.at_guides
      where created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ) end,
    -- Cero y no `null` porque el tipo del frontend lo declara `number` y hay
    -- pantallas que lo formatean como pesos. La tarjeta no se pinta para el
    -- asesor, así que el cero no se lee en ninguna parte: es solo un relleno
    -- que no dice cuánta plata hay.
    'cod_pending', case when v_solo_opera then 0 else (
      select coalesce(sum(cod_amount),0) from public.at_guides
      where is_cod and status = 'entregada' and settlement_id is null
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ) end,
    'settlements_pending', case when v_es_cliente then 0 else (
      select count(*) from public.at_settlements s
      where s.status in ('pendiente','consignado')
        and (v_facility is null or (
          select p.facility_id from public.at_profiles p where p.id = s.courier_id
        ) = v_facility)
    ) end,
    'active_couriers', (
      select count(distinct courier_id) from public.at_guides
      where status in ('zonificada','en_ruta') and courier_id is not null
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    )
  ) into result;

  return result;
end $function$;

comment on function public.at_dashboard_kpis() is
  'Métricas de Mi panel, recortadas por rol. El asesor comercial no recibe tli_pct ni cod_pending: opera para el comercio pero la salud financiera es del dueño.';

-- ── Verificación, para correr a mano después del push ──────────────────
-- Con la sesión de un asesor abierta (o suplantándola con set local role +
-- request.jwt.claims), estas dos llaves tienen que venir vacías:
--
--   select (public.at_dashboard_kpis() ->> 'tli_pct')     as tli,       -- null
--          (public.at_dashboard_kpis() ->> 'cod_pending') as recaudo;   -- 0
--
-- Y con la del dueño del mismo comercio, con su valor real. Si el dueño
-- también las viera vacías, el `v_rol` no está llegando: revisar
-- at_profiles.role de esa cuenta.
