-- A TIEMPO LOGÍSTICA — arrancar la recogida y ver la flota en vivo.
--
-- Va aparte de 0028 porque ahí se agregó el valor 'en_curso' al enum, y
-- Postgres no deja usar un valor de enum en la misma transacción en que se crea.
--
-- QUÉ RESUELVE:
--   1. No había forma de decir "ya voy en camino al comercio": la recogida
--      saltaba de 'asignada' a 'completada', y entre medias el CEDI no sabía
--      si el mensajero había arrancado.
--   2. Nadie tenía un mapa. La posición se guarda desde 0014, pero solo se
--      veía como texto, y en el seguimiento de una guía suelta.

-- ── 1. Arrancar ────────────────────────────────────────────────────────
create or replace function public.at_start_pickup(p_pickup_id uuid)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup   public.at_pickups;
  v_role     public.at_role := public.at_my_role();
  v_comercio text;
  v_ops      record;
  v_nombre   text;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;

  if v_role = 'mensajero' then
    if v_pickup.operator_id is distinct from auth.uid() then
      raise exception 'Esta recogida no está asignada a tu perfil';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  -- Volver a pulsar Iniciar no reinicia el reloj: interesa cuándo salió de
  -- verdad, no cuántas veces tocó el botón.
  if v_pickup.status = 'en_curso' then
    return v_pickup;
  end if;
  if v_pickup.status <> 'asignada' then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  update public.at_pickups
  set status = 'en_curso', started_at = now()
  where id = p_pickup_id
  returning * into v_pickup;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
  select full_name    into v_nombre    from public.at_profiles where id = v_pickup.operator_id;

  for v_ops in
    select id from public.at_profiles
    where role in ('operario','coordinador','admin') and active
  loop
    insert into public.at_notifications (user_id, title, body, link)
    values (v_ops.id, 'Mensajero en camino al comercio',
            coalesce(v_nombre,'Un mensajero') || ' salió hacia ' ||
            coalesce(v_comercio,'un comercio') || ' · ' || v_pickup.address,
            '/mapa');
  end loop;

  return v_pickup;
end $$;

revoke execute on function public.at_start_pickup(uuid) from public, anon;
grant execute on function public.at_start_pickup(uuid) to authenticated;

-- ── 2. Las recogidas del mensajero, ahora también las que ya arrancó ────
create or replace function public.at_my_pickups()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
  v_uid  uuid := auth.uid();
begin
  if v_role not in ('mensajero','admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select json_agg(t order by t.scheduled_date, t.scheduled_time nulls last)
    from (
      select p.id            as pickup_id,
             p.status,
             p.address,
             p.contact_name,
             p.contact_phone,
             p.scheduled_date,
             p.scheduled_time,
             p.started_at,
             p.notes,
             p.package_count,
             c.business_name,
             c.phone         as business_phone,
             c.address       as business_address,
             coalesce((
               select json_agg(json_build_object(
                        'id', g.id,
                        'guide_number', g.guide_number,
                        'recipient_name', g.recipient_name,
                        'recipient_city', g.recipient_city,
                        'is_cod', g.is_cod,
                        'cod_amount', g.cod_amount
                      ) order by g.guide_number)
               from public.at_guides g
               where g.pickup_id = p.id and g.status = 'creada'
             ), '[]'::json) as guias
      from public.at_pickups p
      join public.at_clients c on c.id = p.client_id
      where p.status in ('asignada','en_curso')
        and (v_role <> 'mensajero' or p.operator_id = v_uid)
    ) t
  ), '[]'::json);
end $$;

revoke execute on function public.at_my_pickups() from public, anon;
grant execute on function public.at_my_pickups() to authenticated;

-- ── 3. Confirmar también desde "en curso" ──────────────────────────────
create or replace function public.at_confirm_pickup(
  p_pickup_id uuid,
  p_guide_ids uuid[],
  p_note      text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_pickup    public.at_pickups;
  v_role      public.at_role := public.at_my_role();
  v_recogidas int := 0;
  v_faltantes int := 0;
  v_comercio  text;
  v_ops       record;
begin
  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;

  if v_role = 'mensajero' then
    if v_pickup.operator_id is distinct from auth.uid() then
      raise exception 'Esta recogida no está asignada a tu perfil';
    end if;
  elsif v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  if v_pickup.status not in ('asignada','en_curso') then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  if coalesce(array_length(p_guide_ids, 1), 0) = 0 then
    raise exception 'Marca al menos un paquete, o reporta la recogida como fallida';
  end if;

  update public.at_guides g
  set status = 'recogida', picked_up_at = now()
  where g.pickup_id = p_pickup_id
    and g.id = any(p_guide_ids)
    and g.status = 'creada';
  get diagnostics v_recogidas = row_count;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  select g.id, 'recogida',
         coalesce(nullif(trim(p_note),'') || ' · ', '') || 'Recogida verificada en el comercio',
         auth.uid()
  from public.at_guides g
  where g.pickup_id = p_pickup_id and g.id = any(p_guide_ids) and g.status = 'recogida';

  update public.at_guides g
  set pickup_id = null
  where g.pickup_id = p_pickup_id
    and g.status = 'creada'
    and not (g.id = any(p_guide_ids));
  get diagnostics v_faltantes = row_count;

  update public.at_pickups
  set status = 'completada',
      completed_at = now(),
      package_count = v_recogidas,
      notes = case
        when v_faltantes > 0
        then coalesce(notes || ' · ', '') || v_faltantes || ' paquete(s) no estaban listos'
        else notes end
  where id = p_pickup_id;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;

  for v_ops in
    select id from public.at_profiles
    where role in ('operario','coordinador','admin') and active
  loop
    insert into public.at_notifications (user_id, title, body, link)
    values (
      v_ops.id,
      'Recogida en camino al CEDI',
      coalesce(v_comercio,'Un comercio') || ' · ' || v_recogidas || ' paquete(s)'
        || case when v_faltantes > 0
                then ' · ' || v_faltantes || ' no estaban listos' else '' end,
      '/mapa'
    );
  end loop;

  return json_build_object(
    'recogidas', v_recogidas,
    'faltantes', v_faltantes,
    'comercio',  v_comercio
  );
end $$;

revoke execute on function public.at_confirm_pickup(uuid, uuid[], text) from public, anon;
grant execute on function public.at_confirm_pickup(uuid, uuid[], text) to authenticated;

-- ── 4. La flota en vivo ────────────────────────────────────────────────
-- Todo lo que el mapa necesita en una consulta: dónde está cada mensajero, qué
-- lleva encima y qué está haciendo. Solo para quien coordina la operación; el
-- comercio ve la posición de SU paquete, no la de la flota.
create or replace function public.at_live_couriers()
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.at_my_role() not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select json_agg(t order by t.full_name)
    from (
      select p.id,
             p.full_name,
             p.phone,
             p.courier_type,
             p.last_lat,
             p.last_lng,
             p.last_position_at,
             z.name as zone_name,
             p.max_capacity,
             (select count(*) from public.at_guides g
              where g.courier_id = p.id and g.status = 'zonificada')  as por_salir,
             (select count(*) from public.at_guides g
              where g.courier_id = p.id and g.status = 'en_ruta')     as en_ruta,
             (select count(*) from public.at_guides g
              where g.courier_id = p.id and g.status = 'entregada'
                and g.delivered_at::date = current_date)              as entregadas_hoy,
             -- Qué recogida trae entre manos, si alguna.
             (select json_build_object(
                       'pickup_id', pk.id,
                       'business_name', c.business_name,
                       'address', pk.address,
                       'started_at', pk.started_at)
              from public.at_pickups pk
              join public.at_clients c on c.id = pk.client_id
              where pk.operator_id = p.id and pk.status = 'en_curso'
              order by pk.started_at desc limit 1)                    as recogida_en_curso
      from public.at_profiles p
      left join public.at_zones z on z.id = p.zone_id
      where p.role = 'mensajero' and p.active and p.verified_at is not null
    ) t
  ), '[]'::json);
end $$;

revoke execute on function public.at_live_couriers() from public, anon;
grant execute on function public.at_live_couriers() to authenticated;
