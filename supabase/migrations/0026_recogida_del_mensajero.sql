-- A TIEMPO LOGÍSTICA — la recogida en manos del mensajero.
--
-- QUÉ FALTABA: al mensajero le llega la notificación de recogida asignada,
-- pero la pantalla que abría era una maqueta con datos inventados. Recogía
-- contando cajas de memoria y el CEDI se enteraba de lo que traía cuando ya
-- estaba en la puerta.
--
-- AHORA: ve el listado completo de guías de esa recogida, marca una por una
-- las que sí recibió y confirma. Lo que no marcó no se pierde ni queda como
-- recogido: se suelta de la recogida para que el comercio pueda volver a
-- pedirla, y el CEDI recibe el aviso con lo que viene en camino de verdad.

-- ── 1. Mis recogidas, con todo lo que hay que chequear ─────────────────
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
             p.notes,
             p.package_count,
             c.business_name,
             c.phone         as business_phone,
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
      where p.status = 'asignada'
        -- El mensajero solo ve las suyas; ops las ve todas para poder ayudar
        -- por teléfono cuando alguien se queda trabado en la calle.
        and (v_role <> 'mensajero' or p.operator_id = v_uid)
    ) t
  ), '[]'::json);
end $$;

revoke execute on function public.at_my_pickups() from public, anon;
grant execute on function public.at_my_pickups() to authenticated;

-- ── 2. Confirmar la recogida ───────────────────────────────────────────
-- El mensajero no puede aplicar el estado 'recogida' por at_change_guide_status
-- (esa función solo le permite en_ruta, entregada y novedad, y con razón). Se
-- hace aquí, donde además se valida que la recogida sea suya.
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

  if v_pickup.status <> 'asignada' then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  if coalesce(array_length(p_guide_ids, 1), 0) = 0 then
    raise exception 'Marca al menos un paquete, o reporta la recogida como fallida';
  end if;

  -- Lo que sí recibió: pasa a recogida y queda con su evento, igual que si lo
  -- hubiera hecho el operario a mano.
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

  -- Lo que NO marcó se suelta de la recogida. Dejarlo pegado a una recogida ya
  -- completada lo volvería invisible: ni sale en la lista del comercio para
  -- volver a pedirlo, ni llega nunca al CEDI.
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

  -- El CEDI tiene que saber qué viene en camino ANTES de que llegue la moto.
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
      '/cedi'
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
