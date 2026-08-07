-- A TIEMPO LOGÍSTICA — el mensajero decide qué hace con lo que acaba de recoger.
--
-- Hasta ahora la app decidía POR ÉL. Al confirmar una recogida, preguntaba a la
-- base qué guías iban a la misma zona del comercio; si no había ninguna, no le
-- ofrecía nada y los paquetes se iban al CEDI sin que nadie eligiera. Y si él
-- sabía que le convenía entregar algo que el sistema no consideró "cerca", el
-- servidor se lo negaba de plano:
--
--     'La guía % no va a la misma zona del comercio: tiene que pasar por el CEDI'
--
-- Peor todavía: la consulta exigía que el comercio tuviera zona de origen. Los
-- comercios sin zona —hoy cuatro— no podían tener entrega directa nunca, aunque
-- el destinatario viviera en la esquina.
--
-- Quien está parado en la puerta del comercio con los paquetes en la mano es el
-- mensajero. Él sabe cómo está el tráfico, qué le cabe en la moto y qué le queda
-- de camino. La zona sigue siendo la recomendación —se le marca cuáles son "aquí
-- mismo" y vienen preseleccionadas— pero deja de ser una prohibición.
--
-- A cambio, la decisión queda registrada y distingue los dos casos: si fue en su
-- zona o si fue criterio del mensajero. Si un paquete empieza a dar vueltas o
-- llega tarde, en el historial de la guía está quién decidió saltarse el CEDI y
-- sabiendo qué.

-- ── 1. Qué se acaba de recoger, con la recomendación al lado ──────────────
-- Antes devolvía SOLO las de la misma zona. Ahora devuelve todas las de la
-- recogida y añade `misma_zona`, para que la app sugiera en vez de filtrar.
create or replace function public.at_guias_entrega_directa(p_pickup_id uuid)
returns json
language sql stable security definer set search_path = public
as $function$
  select coalesce(json_agg(json_build_object(
           'id', g.id,
           'guide_number', g.guide_number,
           'recipient_name', g.recipient_name,
           'recipient_address', g.recipient_address,
           'zone_name', z.name,
           'is_cod', g.is_cod,
           'cod_amount', g.cod_amount,
           -- La recomendación. Falsa también cuando no se sabe la zona: sin
           -- saberlo no se recomienda, pero tampoco se prohíbe.
           'misma_zona', (c.zone_id is not null and zdest.id = c.zone_id)
         ) order by (c.zone_id is not null and zdest.id = c.zone_id) desc,
                    g.recipient_address), '[]'::json)
  from public.at_guides g
  join public.at_pickups pk on pk.id = g.pickup_id
  join public.at_clients c  on c.id = pk.client_id
  left join lateral (
    select z2.id from public.at_zones z2
    where z2.id = coalesce(
      g.zone_id,
      public.at_zone_for_city(coalesce(g.recipient_city,'') || ' ' || coalesce(g.recipient_address,''))
    )
  ) zdest on true
  left join public.at_zones z on z.id = zdest.id
  where g.pickup_id = p_pickup_id
    and g.status = 'recogida'
$function$;

comment on function public.at_guias_entrega_directa(uuid) is
  'Lo que el mensajero acaba de recoger, con misma_zona como recomendación. No filtra: la decisión es suya.';

revoke execute on function public.at_guias_entrega_directa(uuid) from public, anon;
grant execute on function public.at_guias_entrega_directa(uuid) to authenticated;

-- ── 2. Se las queda y sale a entregar ─────────────────────────────────────
create or replace function public.at_entrega_directa(p_guide_ids uuid[])
returns json
language plpgsql security definer set search_path = public
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_g record;
  v_zona_destino uuid;
  v_misma_zona boolean;
  v_tomadas int := 0;
  v_fuera_de_zona int := 0;
begin
  if v_role is null or (v_role <> 'mensajero' and not public.at_is_ops()) then
    raise exception 'No autorizado';
  end if;
  if coalesce(array_length(p_guide_ids, 1), 0) = 0 then
    raise exception 'No marcaste ninguna guía';
  end if;

  for v_g in
    select g.id, g.guide_number, g.status, g.zone_id, g.facility_id,
           g.recipient_city, g.recipient_address,
           pk.operator_id, c.zone_id as client_zone
    from public.at_guides g
    join public.at_pickups pk on pk.id = g.pickup_id
    join public.at_clients c  on c.id = g.client_id
    where g.id = any(p_guide_ids)
  loop
    -- Estas tres comprobaciones se quedan: no son criterio operativo, son de
    -- seguridad. Nadie toma guías de otro, ni de otro CEDI, ni reabre una guía
    -- que ya avanzó.
    if v_g.status <> 'recogida' then
      raise exception 'La guía % ya no está recién recogida (está en %)', v_g.guide_number, v_g.status;
    end if;
    if v_role = 'mensajero' and v_g.operator_id is distinct from auth.uid() then
      raise exception 'La guía % es de una recogida que no hiciste tú', v_g.guide_number;
    end if;
    if not public.at_puede_ver_facility(v_g.facility_id) then
      raise exception 'La guía % no pertenece a tu CEDI', v_g.guide_number;
    end if;

    v_zona_destino := coalesce(
      v_g.zone_id,
      public.at_zone_for_city(coalesce(v_g.recipient_city,'') || ' ' || coalesce(v_g.recipient_address,''))
    );
    v_misma_zona := v_g.client_zone is not null
                    and v_zona_destino is not null
                    and v_zona_destino = v_g.client_zone;

    if not v_misma_zona then
      v_fuera_de_zona := v_fuera_de_zona + 1;
    end if;

    update public.at_guides set
      status     = 'en_ruta',
      zone_id    = coalesce(v_zona_destino, zone_id),
      courier_id = case when v_role = 'mensajero' then auth.uid() else courier_id end
    where id = v_g.id;

    -- El historial distingue los dos casos. No es burocracia: es lo que permite
    -- entender después por qué un paquete anduvo por donde anduvo.
    insert into public.at_guide_events (guide_id, status, note, actor_id)
    values (v_g.id, 'en_ruta',
            case when v_misma_zona
              then 'Entrega directa: el destinatario está en la misma zona de la recogida, no pasa por el CEDI'
              else 'Entrega directa por decisión del mensajero: el destino no está en la zona de la recogida'
            end,
            auth.uid());

    v_tomadas := v_tomadas + 1;
  end loop;

  return json_build_object('en_ruta', v_tomadas, 'fuera_de_zona', v_fuera_de_zona);
end $function$;

comment on function public.at_entrega_directa(uuid[]) is
  'El mensajero se queda guías recién recogidas y sale a entregarlas sin pasar por el CEDI.';

revoke execute on function public.at_entrega_directa(uuid[]) from public, anon;
grant execute on function public.at_entrega_directa(uuid[]) to authenticated;

-- ── 3. La otra opción: arrancar para el CEDI, dicho a propósito ───────────
-- No cambia el estado —'recogida' ya significa "recogido y en camino al CEDI"—
-- pero deja constancia de que el mensajero eligió, y a qué hora arrancó. Sin
-- esto, el botón "los llevo al CEDI" solo cerraba una ventana y no existía en
-- ningún lado: no se podía distinguir al que salió de inmediato del que se
-- quedó con los paquetes dos horas.
create or replace function public.at_iniciar_traslado(p_pickup_id uuid)
returns json
language plpgsql security definer set search_path = public
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_pickup public.at_pickups;
  v_n int := 0;
begin
  if v_role is null or (v_role <> 'mensajero' and not public.at_is_ops()) then
    raise exception 'No autorizado';
  end if;

  select * into v_pickup from public.at_pickups where id = p_pickup_id;
  if not found then
    raise exception 'Esa recogida no existe';
  end if;
  if v_role = 'mensajero' and v_pickup.operator_id is distinct from auth.uid() then
    raise exception 'Esa recogida no la hiciste tú';
  end if;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  select g.id, 'recogida', 'El mensajero arrancó para el CEDI con este paquete', auth.uid()
  from public.at_guides g
  where g.pickup_id = p_pickup_id and g.status = 'recogida';

  get diagnostics v_n = row_count;
  return json_build_object('en_traslado', v_n);
end $function$;

comment on function public.at_iniciar_traslado(uuid) is
  'Deja constancia de que el mensajero salió hacia el CEDI con lo recogido.';

revoke execute on function public.at_iniciar_traslado(uuid) from public, anon;
grant execute on function public.at_iniciar_traslado(uuid) to authenticated;
