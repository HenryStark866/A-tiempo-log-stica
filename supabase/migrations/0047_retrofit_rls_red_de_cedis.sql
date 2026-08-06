-- A TIEMPO LOGÍSTICA — retrofit de RLS y RPCs para que admin_cedi opere su
-- propio CEDI, sin tocar ni ver el de otro.
--
-- Regla de oro de esta migración: TODO lo que se cambia es un ENSANCHE
-- (nuevo rol permitido, nueva condición con OR) o un ESTRECHAMIENTO que solo
-- afecta a alguien con facility_id no nulo. Como hoy NADIE tiene
-- facility_id no nulo (es rol nuevo, sin usuarios todavía), el
-- comportamiento del CEDI Principal queda matemáticamente igual: cada
-- `at_puede_ver_facility(x)` de un usuario nacional (facility_id null)
-- siempre da true.

-- ── 0. A qué CEDI pertenece cada recogida ────────────────────────────────
-- Igual que las guías: se hereda del comercio al crearse.
alter table public.at_pickups
  add column if not exists facility_id uuid references public.at_facilities(id) on delete set null;

do $$
declare v_principal uuid;
begin
  select id into v_principal from public.at_facilities where is_default limit 1;
  if v_principal is not null then
    update public.at_pickups set facility_id = v_principal where facility_id is null;
  end if;
end $$;

create or replace function public.at_set_pickup_facility()
returns trigger
language plpgsql
as $$
begin
  if new.facility_id is null then
    select facility_id into new.facility_id
    from public.at_clients where id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists at_pickups_set_facility on public.at_pickups;
create trigger at_pickups_set_facility
  before insert on public.at_pickups
  for each row execute function public.at_set_pickup_facility();

-- ── 1. Los dos guardianes centrales aprenden del rol nuevo ───────────────
-- Un solo punto de cambio en vez de encontrar y editar cada lista de roles
-- suelta por el código: así ningún RPC se queda "olvidado" sin admin_cedi.
create or replace function public.at_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.at_my_role() in ('admin','coordinador','operario','mensajero','admin_cedi'), false) $$;

create or replace function public.at_is_ops()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.at_my_role() in ('admin','coordinador','admin_cedi'), false) $$;

-- ── 2. El guardián de facility ────────────────────────────────────────────
create or replace function public.at_puede_ver_facility(p_facility_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.at_my_facility() is null or public.at_my_facility() = p_facility_id $$;

revoke execute on function public.at_puede_ver_facility(uuid) from public, anon;
grant execute on function public.at_puede_ver_facility(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. RLS: mismas políticas, con la condición de facility añadida por AND.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "staff o dueño lee guías" on public.at_guides;
create policy "staff o dueño lee guías" on public.at_guides
  for select to authenticated
  using ((at_is_staff() and at_puede_ver_facility(facility_id)) or client_id = at_my_client());

drop policy if exists "ops edita guías" on public.at_guides;
create policy "ops edita guías" on public.at_guides
  for update to authenticated
  using (at_is_ops() and at_puede_ver_facility(facility_id))
  with check (at_is_ops() and at_puede_ver_facility(facility_id));

drop policy if exists "staff o dueño lee recogidas" on public.at_pickups;
create policy "staff o dueño lee recogidas" on public.at_pickups
  for select to authenticated
  using ((at_is_staff() and at_puede_ver_facility(facility_id)) or client_id = at_my_client());

drop policy if exists "staff gestiona recogidas" on public.at_pickups;
create policy "staff gestiona recogidas" on public.at_pickups
  for update to authenticated
  using (at_is_staff() and at_puede_ver_facility(facility_id))
  with check (at_is_staff() and at_puede_ver_facility(facility_id));

drop policy if exists "ops administra zonas" on public.at_zones;
create policy "ops administra zonas" on public.at_zones
  for all to authenticated
  using (at_is_ops() and at_puede_ver_facility(facility_id))
  with check (at_is_ops() and at_puede_ver_facility(facility_id));
-- "autenticados leen zonas" (select, using true) se deja intacta: acotarla
-- bien requiere resolver el CEDI del COMERCIO que consulta (no el de su
-- perfil, que para un cliente nunca se llena), y hacerlo a medias en esta
-- pasada es peor que dejarlo para la siguiente. Hoy no cambia nada porque
-- solo hay un CEDI con zonas reales.

drop policy if exists "ops o mensajero dueño lee cierres" on public.at_settlements;
create policy "ops o mensajero dueño lee cierres" on public.at_settlements
  for select to authenticated
  using (
    (at_is_ops() and at_puede_ver_facility(
      (select p.facility_id from public.at_profiles p where p.id = courier_id)
    ))
    or courier_id = auth.uid()
  );

-- ══════════════════════════════════════════════════════════════════════════
-- 4. RPCs: mismo comportamiento de siempre + el corte por facility donde
--    corresponde. Cada función se reemplaza entera para que quede exacta;
--    los comentarios marcan solo lo que cambió.
-- ══════════════════════════════════════════════════════════════════════════

-- ── at_change_guide_status ────────────────────────────────────────────────
create or replace function public.at_change_guide_status(p_guide_id uuid, p_new_status at_guide_status, p_note text default null)
returns at_guides
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide public.at_guides;
  v_role public.at_role := public.at_my_role();
begin
  if v_role is null or v_role in ('pendiente','cliente') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  -- NUEVO: el CEDI de la guía tiene que ser el mío (o soy personal nacional).
  if not public.at_puede_ver_facility(v_guide.facility_id) then
    raise exception 'Esta guía no pertenece a tu CEDI';
  end if;

  if not public.at_valid_transition(v_guide.status, p_new_status) then
    raise exception 'Transición inválida: % → %', v_guide.status, p_new_status;
  end if;

  if v_role = 'mensajero' then
    if v_guide.courier_id is distinct from auth.uid() then
      raise exception 'Esta guía no está asignada a tu perfil';
    end if;
    if p_new_status not in ('en_ruta','entregada','novedad') then
      raise exception 'Rol mensajero no puede aplicar el estado %', p_new_status;
    end if;
  end if;

  -- NUEVO: admin_cedi tiene los mismos poderes que operario dentro de su
  -- CEDI (además de los de coordinación, que ya le dio at_is_ops()); el
  -- corte de estados sigue aplicando solo a operario.
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

-- ── at_confirm_delivery ───────────────────────────────────────────────────
create or replace function public.at_confirm_delivery(
  p_guide_id uuid,
  p_evidence_url text default null,
  p_signature_name text default null,
  p_note text default null,
  p_delivery_code text default null
)
returns at_guides
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide   public.at_guides;
  v_role    public.at_role := public.at_my_role();
  v_code    public.at_delivery_codes;
  v_nota    text := p_note;
  v_llego   boolean;
  v_escrito text := nullif(trim(coalesce(p_delivery_code, '')), '');
begin
  if v_role is null or v_role in ('pendiente','cliente') then
    raise exception 'No autorizado';
  end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  if not public.at_puede_ver_facility(v_guide.facility_id) then
    raise exception 'Esta guía no pertenece a tu CEDI';
  end if;

  if v_guide.status <> 'en_ruta' then
    raise exception 'Solo guías en ruta pueden marcarse como entregadas (estado actual: %)', v_guide.status;
  end if;

  if v_role = 'mensajero' and v_guide.courier_id is distinct from auth.uid() then
    raise exception 'Esta guía no está asignada a tu perfil';
  end if;

  -- NUEVO: admin_cedi además de mensajero/admin/coordinador.
  if v_role not in ('mensajero','admin','coordinador','admin_cedi') then
    raise exception 'Rol % no puede confirmar entregas', v_role;
  end if;

  if v_guide.is_cod and coalesce(length(trim(p_evidence_url)), 0) = 0 then
    raise exception 'Esta guía es contraentrega: la evidencia de entrega (foto) es obligatoria';
  end if;

  select * into v_code from public.at_delivery_codes where guide_id = p_guide_id for update;

  if found and v_code.verified_at is null then
    select exists (
      select 1 from public.at_message_outbox
      where guide_id = p_guide_id and status = 'enviado'
    ) into v_llego;

    if v_code.locked then
      raise exception 'El código se bloqueó por demasiados intentos. Un coordinador debe reenviarlo.';
    end if;

    if v_escrito is not null then
      if extensions.crypt(v_escrito, v_code.code_hash) = v_code.code_hash then
        update public.at_delivery_codes
        set verified_at = now(), attempts = attempts + 1
        where guide_id = p_guide_id;
      else
        update public.at_delivery_codes set
          attempts = attempts + 1,
          locked   = (attempts + 1) >= 5
        where guide_id = p_guide_id
        returning * into v_code;

        if v_code.locked then
          raise exception 'Código incorrecto. Se bloqueó por 5 intentos fallidos: un coordinador debe reenviarlo.';
        end if;
        raise exception 'Código incorrecto. Te quedan % intento(s).', 5 - v_code.attempts;
      end if;

    elsif v_llego then
      if v_role = 'mensajero' then
        raise exception 'Pídele al comprador el código de 6 dígitos de su paquete';
      end if;
      v_nota := coalesce(v_nota || ' · ', '') || 'Entregada SIN código, autorizada por coordinación';

    else
      v_nota := coalesce(v_nota || ' · ', '')
             || 'Entregada sin código: el mensaje nunca se le pudo enviar al comprador';
    end if;
  end if;

  update public.at_guides g set
    status = 'entregada',
    delivered_at = now(),
    delivery_evidence_url = coalesce(p_evidence_url, g.delivery_evidence_url),
    delivery_signature_name = coalesce(p_signature_name, g.delivery_signature_name)
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'entregada', v_nota, auth.uid());

  return v_guide;
end $function$;

-- ── at_process_return ─────────────────────────────────────────────────────
create or replace function public.at_process_return(p_guide_id uuid, p_note text default null)
returns at_guides
language plpgsql security definer set search_path = public
as $function$
declare
  v_guide public.at_guides;
begin
  if not public.at_is_staff() then raise exception 'No autorizado'; end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;

  if not public.at_puede_ver_facility(v_guide.facility_id) then
    raise exception 'Esta guía no pertenece a tu CEDI';
  end if;

  if v_guide.status <> 'novedad' then
    raise exception 'Solo guías en novedad pueden procesarse como retorno (estado actual: %)', v_guide.status;
  end if;

  if v_guide.delivery_attempts >= 2 then
    return public.at_change_guide_status(p_guide_id, 'en_devolucion',
      coalesce(p_note,'2do intento fallido: pasa a logística inversa'));
  else
    return public.at_change_guide_status(p_guide_id, 'reprogramada',
      coalesce(p_note,'1er intento fallido: reprogramada para nuevo despacho'));
  end if;
end $function$;

-- ── at_assign_pickup ──────────────────────────────────────────────────────
create or replace function public.at_assign_pickup(p_pickup_id uuid, p_courier_id uuid)
returns at_pickups
language plpgsql security definer set search_path = public
as $function$
declare
  v_pickup public.at_pickups;
  v_courier public.at_profiles;
  v_comercio text;
  v_guias int;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador asigna recogidas';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado: sus documentos no han sido aprobados', v_courier.full_name;
  end if;

  select * into v_pickup from public.at_pickups where id = p_pickup_id for update;
  if not found then raise exception 'Recogida no encontrada'; end if;

  -- NUEVO: la recogida y el mensajero tienen que ser de mi CEDI.
  if not public.at_puede_ver_facility(v_pickup.facility_id) then
    raise exception 'Esta recogida no pertenece a tu CEDI';
  end if;
  if not public.at_puede_ver_facility(v_courier.facility_id) then
    raise exception 'Ese mensajero no pertenece a tu CEDI';
  end if;

  if v_pickup.status in ('completada','cancelada') then
    raise exception 'Esta recogida ya está %', v_pickup.status;
  end if;

  update public.at_pickups
  set operator_id = p_courier_id, status = 'asignada'
  where id = p_pickup_id
  returning * into v_pickup;

  select business_name into v_comercio from public.at_clients where id = v_pickup.client_id;
  select count(*) into v_guias from public.at_guides where pickup_id = p_pickup_id;

  insert into public.at_notifications (user_id, title, body, link)
  values (
    p_courier_id,
    'Nueva recogida asignada',
    coalesce(v_comercio,'Un comercio') || ' · ' || v_pickup.address
      || case when v_pickup.scheduled_time is not null
              then ' · ' || to_char(v_pickup.scheduled_time,'HH24:MI') else '' end
      || case when v_guias > 0 then ' · ' || v_guias || ' guía(s)' else '' end,
    '/recogidas'
  );

  return v_pickup;
end $function$;

-- ── at_assign_zone_batch ──────────────────────────────────────────────────
create or replace function public.at_assign_zone_batch(p_zone_id uuid, p_courier_id uuid, p_limit int default null)
returns json
language plpgsql security definer set search_path = public
as $function$
declare
  v_courier   public.at_profiles;
  v_zone      public.at_zones;
  v_id        uuid;
  v_asignadas int := 0;
  v_cupo      int;
  v_carga     int;
begin
  -- NUEVO: admin_cedi entra al mismo camino que admin/coordinador/operario.
  if public.at_my_role() not in ('admin','coordinador','operario','admin_cedi') then
    raise exception 'No autorizado';
  end if;

  select * into v_zone from public.at_zones where id = p_zone_id;
  if not found then raise exception 'Zona no encontrada'; end if;
  if not public.at_puede_ver_facility(v_zone.facility_id) then
    raise exception 'Esa zona no pertenece a tu CEDI';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;
  if not public.at_puede_ver_facility(v_courier.facility_id) then
    raise exception 'Ese mensajero no pertenece a tu CEDI';
  end if;
  if v_courier.verified_at is null then
    raise exception 'El mensajero % todavía no está habilitado', v_courier.full_name;
  end if;

  select count(*) into v_carga from public.at_guides
  where courier_id = p_courier_id and status in ('zonificada','en_ruta');

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
end $function$;

-- ── at_cedi_board ──────────────────────────────────────────────────────────
create or replace function public.at_cedi_board()
returns json
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_facility uuid := public.at_my_facility();
begin
  if v_role not in ('admin','coordinador','operario','admin_cedi') then
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
          and (v_facility is null or g.facility_id = v_facility)
        group by z.id, z.name, z.sort_order
      ) z2
    ), '[]'::json),

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
        and (v_facility is null or g.facility_id = v_facility)
    ), '[]'::json),

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
        and (v_facility is null or p.facility_id = v_facility)
    ), '[]'::json)
  );
end $function$;

-- ── at_receive_pickup ──────────────────────────────────────────────────────
create or replace function public.at_receive_pickup(p_token text)
returns json
language plpgsql security definer set search_path = public
as $function$
declare
  v_pickup     public.at_pickups;
  v_role       public.at_role := public.at_my_role();
  v_recibidas  int := 0;
  v_ya_estaban int := 0;
  v_sin_salir  int := 0;
  v_comercio   text;
begin
  if v_role is null or v_role not in ('admin','coordinador','operario','admin_cedi') then
    raise exception 'Solo el personal del CEDI puede recibir mercancía';
  end if;

  select * into v_pickup
  from public.at_pickups
  where pickup_token = nullif(trim(p_token), '')
  for update;

  if not found then
    raise exception 'Ese código no corresponde a ninguna recogida';
  end if;

  if not public.at_puede_ver_facility(v_pickup.facility_id) then
    raise exception 'Ese lote no pertenece a tu CEDI';
  end if;

  select business_name into v_comercio
  from public.at_clients where id = v_pickup.client_id;

  with movidas as (
    update public.at_guides g set
      status = 'en_cedi',
      received_cedi_at = coalesce(g.received_cedi_at, now()),
      courier_id = null,
      zone_id = coalesce(
        g.zone_id,
        public.at_zone_for_city(
          coalesce(g.recipient_city, '') || ' ' || coalesce(g.recipient_address, '')
        )
      )
    where g.pickup_id = v_pickup.id
      and g.status = 'recogida'
    returning g.id
  ),
  eventos as (
    insert into public.at_guide_events (guide_id, status, note, actor_id)
    select m.id, 'en_cedi', 'Ingreso al CEDI con el QR de la recogida', auth.uid()
    from movidas m
    returning 1
  )
  select count(*) into v_recibidas from movidas;

  select
    count(*) filter (where g.status = 'en_cedi'),
    count(*) filter (where g.status = 'creada')
  into v_ya_estaban, v_sin_salir
  from public.at_guides g
  where g.pickup_id = v_pickup.id;

  v_ya_estaban := greatest(v_ya_estaban - v_recibidas, 0);

  return json_build_object(
    'recibidas',   v_recibidas,
    'ya_estaban',  v_ya_estaban,
    'sin_salir',   v_sin_salir,
    'comercio',    v_comercio,
    'pickup_id',   v_pickup.id
  );
end $function$;

-- ── at_live_couriers ───────────────────────────────────────────────────────
create or replace function public.at_live_couriers()
returns json
language plpgsql stable security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare v_facility uuid := public.at_my_facility();
begin
  if public.at_my_role() not in ('admin','coordinador','operario','admin_cedi') then
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
        and (v_facility is null or p.facility_id = v_facility)
    ) t
  ), '[]'::json);
end $function$;

-- ── at_dashboard_kpis ──────────────────────────────────────────────────────
create or replace function public.at_dashboard_kpis()
returns json
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_client uuid := public.at_my_client();
  v_facility uuid := public.at_my_facility();
  v_es_cliente boolean := public.at_my_role() = 'cliente';
  result json;
begin
  if not (public.at_is_staff() or coalesce(public.at_my_role() = 'cliente', false)) then
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

-- ── at_default_facility → "mi sede" ────────────────────────────────────────
-- Renombrada en espíritu, no en firma (para no tocar cada llamada del
-- frontend): ahora devuelve la sede de QUIEN PREGUNTA. El personal nacional
-- sigue viendo la sede por defecto (como siempre); un admin_cedi ve la suya.
create or replace function public.at_default_facility()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'id', f.id, 'name', f.name, 'address', f.address,
    'city', f.city, 'phone', f.phone, 'notes', f.notes
  )
  from public.at_facilities f
  where f.active
    and public.at_is_staff()
    and f.id = coalesce(
      public.at_my_facility(),
      (select id from public.at_facilities where is_default limit 1)
    )
  limit 1
$$;

-- ── at_verify_courier ──────────────────────────────────────────────────────
create or replace function public.at_verify_courier(
  p_courier_id uuid,
  p_courier_type at_courier_type,
  p_zone_id uuid default null,
  p_max_capacity int default null
)
returns at_profiles
language plpgsql security definer set search_path = public
as $function$
declare
  v_courier  public.at_profiles;
  v_faltante text;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador habilita mensajeros';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero';
  if not found then raise exception 'Ese usuario no es un mensajero'; end if;

  -- NUEVO: el mensajero a habilitar tiene que ser de mi CEDI.
  if not public.at_puede_ver_facility(v_courier.facility_id) then
    raise exception 'Ese mensajero no pertenece a tu CEDI';
  end if;
  if p_zone_id is not null and not public.at_puede_ver_facility(
    (select facility_id from public.at_zones where id = p_zone_id)
  ) then
    raise exception 'Esa zona no pertenece a tu CEDI';
  end if;

  select string_agg(replace(d.tipo::text, '_', ' '), ', ')
    into v_faltante
  from unnest(public.at_required_courier_docs(p_courier_type)) as d(tipo)
  where not exists (
    select 1 from public.at_courier_documents cd
    where cd.courier_id = p_courier_id
      and cd.doc_type   = d.tipo
      and cd.status     = 'aprobado'
  );

  if v_faltante is not null then
    raise exception 'Faltan documentos aprobados: %', v_faltante;
  end if;

  update public.at_profiles set
    courier_type = p_courier_type,
    zone_id      = coalesce(p_zone_id, zone_id),
    max_capacity = coalesce(p_max_capacity, max_capacity),
    verified_at  = now(),
    verified_by  = auth.uid(),
    active       = true
  where id = p_courier_id
  returning * into v_courier;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_courier_id, 'Ya estás habilitado',
          'Tus documentos fueron aprobados. Ya puedes recibir recogidas y entregas.',
          '/entregas');

  perform public.at_log_security_event(
    'mensajero_habilitado', 'info',
    jsonb_build_object('mensajero_id', p_courier_id, 'courier_type', p_courier_type)
  );

  return v_courier;
end $function$;

-- ── at_revoke_courier ──────────────────────────────────────────────────────
create or replace function public.at_revoke_courier(p_courier_id uuid, p_reason text)
returns at_profiles
language plpgsql security definer set search_path = public
as $function$
declare
  v_courier public.at_profiles;
begin
  if not public.at_is_ops() then
    raise exception 'Solo un administrador o coordinador retira la habilitación';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Hay que decir por qué se retira la habilitación';
  end if;

  select * into v_courier from public.at_profiles
  where id = p_courier_id and role = 'mensajero';
  if not found then raise exception 'Ese usuario no es un mensajero'; end if;

  -- NUEVO: antes se actualizaba directo; ahora hay que mirar antes de tocar
  -- para poder negarlo si el mensajero es de otro CEDI.
  if not public.at_puede_ver_facility(v_courier.facility_id) then
    raise exception 'Ese mensajero no pertenece a tu CEDI';
  end if;

  update public.at_profiles
  set verified_at = null, verified_by = null
  where id = p_courier_id
  returning * into v_courier;

  insert into public.at_notifications (user_id, title, body, link)
  values (p_courier_id, 'Habilitación suspendida', trim(p_reason), '/mi-perfil');

  perform public.at_log_security_event(
    'mensajero_revocado', 'advertencia',
    jsonb_build_object('mensajero_id', p_courier_id, 'motivo', trim(p_reason))
  );

  return v_courier;
end $function$;

-- ── at_create_settlement ───────────────────────────────────────────────────
create or replace function public.at_create_settlement(p_courier_id uuid default null, p_date date default current_date)
returns at_settlements
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_courier uuid := coalesce(p_courier_id, auth.uid());
  v_settlement public.at_settlements;
  v_total numeric(12,2);
begin
  if not public.at_is_staff() then raise exception 'No autorizado'; end if;
  if public.at_my_role() = 'mensajero' and v_courier <> auth.uid() then
    raise exception 'Un mensajero solo puede cerrar su propia caja';
  end if;

  -- NUEVO: si actúo por otro (staff cerrando la caja de un mensajero), ese
  -- mensajero tiene que ser de mi CEDI.
  if v_courier <> auth.uid() and not public.at_puede_ver_facility(
    (select facility_id from public.at_profiles where id = v_courier)
  ) then
    raise exception 'Ese mensajero no pertenece a tu CEDI';
  end if;

  select coalesce(sum(cod_amount),0) into v_total
  from public.at_guides
  where courier_id = v_courier and is_cod and status = 'entregada'
    and settlement_id is null and delivered_at::date <= p_date;

  if v_total = 0 then
    raise exception 'No hay recaudos pendientes de consignar para este mensajero';
  end if;

  insert into public.at_settlements (courier_id, settlement_date, expected_amount)
  values (v_courier, p_date, v_total)
  on conflict (courier_id, settlement_date)
    do update set expected_amount = public.at_settlements.expected_amount + excluded.expected_amount
  returning * into v_settlement;

  update public.at_guides
  set settlement_id = v_settlement.id
  where courier_id = v_courier and is_cod and status = 'entregada'
    and settlement_id is null and delivered_at::date <= p_date;

  return v_settlement;
end $function$;

-- ── at_report_deposit ──────────────────────────────────────────────────────
create or replace function public.at_report_deposit(p_settlement_id uuid, p_amount numeric, p_reference text)
returns at_settlements
language plpgsql security definer set search_path = public
as $function$
declare v_s public.at_settlements;
begin
  select * into v_s from public.at_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Cierre no encontrado'; end if;

  if not (
    (public.at_is_ops() and public.at_puede_ver_facility(
      (select facility_id from public.at_profiles where id = v_s.courier_id)
    ))
    or coalesce(v_s.courier_id = auth.uid(), false)
  ) then
    raise exception 'No autorizado';
  end if;

  if v_s.status not in ('pendiente') then
    raise exception 'Este cierre ya fue consignado o conciliado';
  end if;

  update public.at_settlements set
    deposited_amount = p_amount,
    bank_reference = p_reference,
    status = 'consignado'
  where id = p_settlement_id
  returning * into v_s;
  return v_s;
end $function$;

-- ── at_reconcile_settlement ────────────────────────────────────────────────
create or replace function public.at_reconcile_settlement(p_settlement_id uuid, p_notes text default null)
returns at_settlements
language plpgsql security definer set search_path = public
as $function$
declare v_s public.at_settlements;
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  select * into v_s from public.at_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Cierre no encontrado'; end if;

  if not public.at_puede_ver_facility(
    (select facility_id from public.at_profiles where id = v_s.courier_id)
  ) then
    raise exception 'Ese cierre no pertenece a tu CEDI';
  end if;

  if v_s.status <> 'consignado' then raise exception 'El cierre debe estar consignado para conciliarse'; end if;

  update public.at_settlements set
    status = (case when coalesce(deposited_amount,0) = expected_amount
                then 'conciliado' else 'con_diferencia' end)::public.at_settlement_status,
    notes = coalesce(p_notes, notes),
    reconciled_by = auth.uid(),
    reconciled_at = now()
  where id = p_settlement_id
  returning * into v_s;
  return v_s;
end $function$;
