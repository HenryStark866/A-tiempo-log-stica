-- A TIEMPO LOGÍSTICA — enrutamiento automático en el CEDI.
--
-- PROBLEMA: al recibir en bodega, el operario tiene que abrir guía por guía y
-- elegirle mensajero y zona en dos desplegables. Con 80 paquetes en la mañana
-- eso son 160 decisiones, y cada una es una oportunidad de equivocarse.
--
-- SOLUCIÓN, en dos partes:
--   1. La zona se resuelve SOLA al recibir el paquete, con la misma función
--      que ya usa el comercio al crear la guía. El operario no la elige.
--   2. El operario asigna LOTES: "estas 14 de Zona 2 son para Julián". Una
--      decisión por zona en vez de una por paquete.

-- ── 1. La zona se resuelve al recibir en bodega ────────────────────────
-- Se engancha en el cambio de estado a en_cedi. Solo rellena cuando está
-- vacía: si el comercio ya la eligió, o el CEDI la corrigió a mano, esa gana.
create or replace function public.at_change_guide_status(
  p_guide_id uuid, p_new_status public.at_guide_status, p_note text default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role in ('pendiente','cliente') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  if not public.at_valid_transition(v_guide.status, p_new_status) then
    raise exception 'Transición inválida: % → %', v_guide.status, p_new_status;
  end if;

  -- Mensajero: solo sus guías y solo iniciar ruta / entregar / reportar novedad
  if v_role = 'mensajero' then
    if v_guide.courier_id is distinct from auth.uid() then
      raise exception 'Esta guía no está asignada a tu perfil';
    end if;
    if p_new_status not in ('en_ruta','entregada','novedad') then
      raise exception 'Rol mensajero no puede aplicar el estado %', p_new_status;
    end if;
  end if;

  -- Operario: fases de recogida, CEDI y devolución
  if v_role = 'operario' and p_new_status not in ('recogida','en_cedi','reprogramada','en_devolucion','devuelta') then
    raise exception 'Rol operario no puede aplicar el estado %', p_new_status;
  end if;

  update public.at_guides g set
    status = p_new_status,
    picked_up_at     = case when p_new_status = 'recogida'  then now() else g.picked_up_at end,
    received_cedi_at = case when p_new_status = 'en_cedi' and g.received_cedi_at is null then now() else g.received_cedi_at end,
    delivered_at     = case when p_new_status = 'entregada' then now() else g.delivered_at end,
    returned_at      = case when p_new_status = 'devuelta'  then now() else g.returned_at end,
    delivery_attempts = case when p_new_status = 'novedad' then g.delivery_attempts + 1 else g.delivery_attempts end,
    courier_id       = case when p_new_status in ('en_cedi','reprogramada','en_devolucion') then null else g.courier_id end,
    -- Zonificación automática al entrar a bodega.
    zone_id = case
      when p_new_status in ('en_cedi','reprogramada') and g.zone_id is null
      then public.at_zone_for_city(coalesce(g.recipient_city,'') || ' ' || coalesce(g.recipient_address,''))
      else g.zone_id
    end
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, p_new_status, p_note, auth.uid());

  return v_guide;
end $$;

-- ── 2. El tablero del CEDI ─────────────────────────────────────────────
-- Todo lo que el operario necesita para decidir, en una sola consulta: qué hay
-- por despachar agrupado por zona, qué quedó sin zona, y qué mensajeros están
-- habilitados con cuánto cupo les queda.
create or replace function public.at_cedi_board()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
begin
  if v_role not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  return json_build_object(
    'zonas', coalesce((
      select json_agg(z2 order by z2.sort_order)
      from (
        select z.id as zone_id, z.name as zone_name, z.sort_order,
               count(g.id) as pendientes,
               json_agg(json_build_object(
                 'id', g.id, 'guide_number', g.guide_number,
                 'recipient_name', g.recipient_name,
                 'recipient_address', g.recipient_address,
                 'recipient_city', g.recipient_city,
                 'is_cod', g.is_cod, 'cod_amount', g.cod_amount,
                 'business_name', c.business_name
               ) order by g.recipient_address) as guias
        from public.at_guides g
        join public.at_zones z   on z.id = g.zone_id
        join public.at_clients c on c.id = g.client_id
        where g.status in ('en_cedi','reprogramada')
        group by z.id, z.name, z.sort_order
      ) z2
    ), '[]'::json),

    -- Sin zona: la dirección no se reconoció. Van aparte porque no se pueden
    -- despachar en lote; alguien tiene que mirarlas.
    'sin_zona', coalesce((
      select json_agg(json_build_object(
               'id', g.id, 'guide_number', g.guide_number,
               'recipient_name', g.recipient_name,
               'recipient_address', g.recipient_address,
               'recipient_city', g.recipient_city,
               'business_name', c.business_name
             ) order by g.created_at)
      from public.at_guides g
      join public.at_clients c on c.id = g.client_id
      where g.status in ('en_cedi','reprogramada') and g.zone_id is null
    ), '[]'::json),

    -- Solo mensajeros habilitados: los que están sin verificar no aparecen,
    -- para que el operario no los elija y choque contra el rechazo.
    'mensajeros', coalesce((
      select json_agg(json_build_object(
               'id', p.id, 'full_name', p.full_name,
               'courier_type', p.courier_type,
               'zone_id', p.zone_id, 'zone_name', z.name,
               'max_capacity', p.max_capacity,
               'carga_actual', (
                 select count(*) from public.at_guides g
                 where g.courier_id = p.id and g.status in ('zonificada','en_ruta')
               )
             ) order by p.full_name)
      from public.at_profiles p
      left join public.at_zones z on z.id = p.zone_id
      where p.role = 'mensajero' and p.active and p.verified_at is not null
    ), '[]'::json)
  );
end $$;

revoke execute on function public.at_cedi_board() from public, anon;
grant execute on function public.at_cedi_board() to authenticated;

-- ── 3. Asignar una zona completa a un mensajero ────────────────────────
-- Por dentro llama a at_assign_courier guía por guía, en vez de hacer un
-- UPDATE masivo. Es más lento, pero garantiza que un despacho en lote deje
-- exactamente el mismo rastro que uno manual: valida la habilitación del
-- mensajero, escribe el evento de cada guía y emite su código de entrega.
-- Duplicar esa lógica aquí sería la forma segura de que algún día se
-- desincronicen.
create or replace function public.at_assign_zone_batch(
  p_zone_id    uuid,
  p_courier_id uuid,
  p_limit      int default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_courier   public.at_profiles;
  v_id        uuid;
  v_asignadas int := 0;
  v_cupo      int;
  v_carga     int;
begin
  if public.at_my_role() not in ('admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado', v_courier.full_name;
  end if;

  select count(*) into v_carga from public.at_guides
  where courier_id = p_courier_id and status in ('zonificada','en_ruta');

  -- El cupo diario existe para que a nadie le carguen más de lo que alcanza a
  -- entregar. Un despacho en lote es justo donde eso se desborda sin querer.
  v_cupo := greatest(coalesce(v_courier.max_capacity, 999) - v_carga, 0);
  if p_limit is not null then
    v_cupo := least(v_cupo, greatest(p_limit, 0));
  end if;

  if v_cupo = 0 then
    raise exception '% ya tiene % guía(s) asignadas y llegó a su cupo', v_courier.full_name, v_carga;
  end if;

  for v_id in
    select g.id from public.at_guides g
    where g.zone_id = p_zone_id
      and g.status in ('en_cedi','reprogramada')
    order by g.recipient_address
    limit v_cupo
  loop
    perform public.at_assign_courier(v_id, p_courier_id, p_zone_id);
    v_asignadas := v_asignadas + 1;
  end loop;

  select count(*) into v_carga from public.at_guides
  where zone_id = p_zone_id and status in ('en_cedi','reprogramada');

  return json_build_object(
    'asignadas', v_asignadas,
    'restantes', v_carga,
    'mensajero', v_courier.full_name
  );
end $$;

revoke execute on function public.at_assign_zone_batch(uuid, uuid, int) from public, anon;
grant execute on function public.at_assign_zone_batch(uuid, uuid, int) to authenticated;

-- ── 4. Zonificar lo que ya está en bodega sin zona ─────────────────────
-- Lo recibido antes de este cambio entró sin zonificar. Se resuelve ahora para
-- que el tablero no arranque con una lista de "sin zona" que en realidad sí
-- tienen zona reconocible.
update public.at_guides
set zone_id = public.at_zone_for_city(coalesce(recipient_city,'') || ' ' || coalesce(recipient_address,''))
where status in ('en_cedi','reprogramada')
  and zone_id is null
  and public.at_zone_for_city(coalesce(recipient_city,'') || ' ' || coalesce(recipient_address,'')) is not null;
