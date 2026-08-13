-- A TIEMPO LOGÍSTICA — cerrar lo que quedó incoherente al nacer el rol asesor.
--
-- Al agregar un rol nuevo no basta con darle permisos donde hace falta: hay que
-- revisar TODAS las funciones que decían 'cliente', porque cada una lo usaba
-- con un significado distinto. En unas quería decir «alguien de un comercio»
-- —y ahí el asesor debe entrar—; en otras quería decir «alguien que NO es del
-- equipo de operación» —y ahí el asesor debe quedar fuera igual que su jefe—.
--
-- Se revisaron las quince que quedaban. Cuatro estaban mal.

-- ── 1. El agujero de verdad ──────────────────────────────────────────────
-- at_change_guide_status bloqueaba a 'pendiente' y a 'cliente'. El asesor no
-- estaba en esa lista, así que pasaba de largo y podía cambiar el estado de un
-- pedido como si fuera del CEDI: marcar 'entregada' algo que nadie entregó.
--
-- Y eso no es cosmético: al pasar a 'entregada' se dispara at_facturar_guia,
-- que le mete la línea a la factura del comercio. Un asesor podía generarle
-- cobros a su propio jefe sin salir de la oficina.
--
-- El estado de un pedido lo mueve quien lo toca físicamente —el mensajero y el
-- CEDI—, nunca quien lo registra.
create or replace function public.at_change_guide_status(
  p_guide_id uuid,
  p_new_status at_guide_status,
  p_note text default null
)
returns at_guides
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide public.at_guides;
  v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role in ('pendiente','cliente','asesor') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  if not public.at_puede_ver_facility(v_guide.facility_id) then
    raise exception 'Este pedido no pertenece a tu CEDI';
  end if;

  if not public.at_valid_transition(v_guide.status, p_new_status) then
    raise exception 'Transición inválida: % → %', v_guide.status, p_new_status;
  end if;

  if v_role = 'mensajero' then
    if v_guide.courier_id is distinct from auth.uid() then
      raise exception 'Este pedido no está asignado a tu perfil';
    end if;
    if p_new_status not in ('en_ruta','entregada','novedad') then
      raise exception 'Rol mensajero no puede aplicar el estado %', p_new_status;
    end if;
  end if;

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
end $function$;

-- ── 2. Sus pedidos, y SOLO los suyos ─────────────────────────────────────
-- Aquí había una trampa fina. El filtro decía:
--
--     where (v_role <> 'cliente' or g.client_id = v_client)
--
-- o sea «si no eres cliente, ves todo». Añadir 'asesor' a la lista de roles
-- permitidos y nada más habría dejado al asesor viendo los pedidos de TODOS los
-- comercios de A Tiempo, que es exactamente lo contrario de lo que se buscaba.
-- Por eso el filtro se cambia también, no solo el guardia de la entrada.
create or replace function public.at_my_shipments()
returns json
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  v_facility uuid := public.at_my_facility();
  result json;
begin
  if v_role is null then raise exception 'No autorizado'; end if;
  if v_role in ('cliente','asesor') and v_client is null then
    return '[]'::json;
  end if;
  if v_role not in ('cliente','asesor','admin','coordinador','operario','admin_cedi') then
    raise exception 'No autorizado';
  end if;

  select coalesce(json_agg(t order by t.created_at desc), '[]'::json) into result
  from (
    select g.id,
           g.guide_number,
           g.status,
           g.recipient_name,
           g.recipient_address,
           g.recipient_city,
           g.is_cod,
           g.cod_amount,
           g.delivery_attempts,
           g.created_at,
           g.delivered_at,
           g.client_id,
           cl.business_name as client_name,
           z.name  as zone_name,
           z.delivery_rate,
           c.full_name as courier_name,
           case when g.status = 'en_ruta' then c.last_lat end as courier_lat,
           case when g.status = 'en_ruta' then c.last_lng end as courier_lng,
           case when g.status = 'en_ruta' then c.last_position_at end as courier_position_at
    from public.at_guides g
    left join public.at_zones z    on z.id = g.zone_id
    left join public.at_profiles c on c.id = g.courier_id
    left join public.at_clients cl on cl.id = g.client_id
    where (v_role not in ('cliente','asesor') or g.client_id = v_client)
      and (v_role in ('cliente','asesor') or v_facility is null or g.facility_id = v_facility)
      and g.status in ('creada','recogida','en_cedi','zonificada','en_ruta','novedad','reprogramada','en_devolucion')
    order by g.created_at desc
    limit 200
  ) t;

  return result;
end $function$;

-- ── 3. Editar un pedido que todavía no salió ─────────────────────────────
-- Registrar pedidos sin poder corregir un teléfono mal escrito no es un
-- trabajo: es una trampa. Se le abre, con la misma comprobación de pertenencia
-- que tiene el dueño.
create or replace function public.at_update_guide(
  p_guide_id uuid, p_recipient_name text, p_recipient_phone text,
  p_recipient_address text, p_recipient_city text, p_zone_id uuid,
  p_is_cod boolean, p_cod_amount numeric, p_notes text
)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide  public.at_guides;
  v_role   public.at_role := public.at_my_role();
  v_client uuid           := public.at_my_client();
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_guide.status <> 'creada' then
    raise exception 'Este pedido ya fue despachado al CEDI y no se puede editar';
  end if;

  if v_role in ('cliente','asesor') and v_guide.client_id is distinct from v_client then
    raise exception 'No tienes permiso para editar este pedido';
  elsif v_role not in ('cliente','asesor','admin','coordinador','operario') then
    raise exception 'No autorizado';
  end if;

  if coalesce(trim(p_recipient_name), '') = '' then
    raise exception 'El destinatario necesita nombre';
  end if;
  if coalesce(trim(p_recipient_address), '') = '' then
    raise exception 'El destinatario necesita dirección';
  end if;

  update public.at_guides set
    recipient_name    = trim(p_recipient_name),
    recipient_phone   = nullif(trim(coalesce(p_recipient_phone, '')), ''),
    recipient_address = trim(p_recipient_address),
    recipient_city    = trim(p_recipient_city),
    zone_id           = p_zone_id,
    is_cod            = coalesce(p_is_cod, false),
    cod_amount        = case when coalesce(p_is_cod, false)
                             then greatest(coalesce(p_cod_amount, 0), 0)
                             else 0 end,
    notes             = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at        = now()
  where id = p_guide_id;
end $function$;

-- ── 4. El tablero que el menú ya le mostraba ─────────────────────────────
-- El menú le ofrece «Mi panel» al asesor y la función lo rechazaba: habría
-- entrado a una pantalla rota el primer día.
--
-- Ojo con `v_es_cliente`: decide si se cuentan las conciliaciones de caja, y
-- ESA consulta no filtra por comercio. Con el asesor fuera de esa variable,
-- habría visto el conteo de conciliaciones de toda la operación de A Tiempo.
create or replace function public.at_dashboard_kpis()
returns json
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_client uuid := public.at_my_client();
  v_facility uuid := public.at_my_facility();
  v_rol public.at_role := public.at_my_role();
  -- «Es de un comercio», que es lo que esta variable siempre quiso decir.
  v_es_cliente boolean := v_rol in ('cliente','asesor');
  result json;
begin
  if not (public.at_is_staff() or coalesce(v_rol in ('cliente','asesor'), false)) then
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
    'tli_pct', (
      select round(100.0 * count(*) filter (where status = 'devuelta')
             / nullif(count(*) filter (where status in ('entregada','devuelta')), 0), 1)
      from public.at_guides
      where created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ),
    'cod_pending', (
      select coalesce(sum(cod_amount),0) from public.at_guides
      where is_cod and status = 'entregada' and settlement_id is null
        and (v_client is null or client_id = v_client)
        and (v_facility is null or facility_id = v_facility)
    ),
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
