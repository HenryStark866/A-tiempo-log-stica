-- A TIEMPO LOGÍSTICA — funciones, RPCs y triggers

-- ── Helpers de sesión ────────────────────────────────────────────────────
create or replace function public.at_my_role()
returns public.at_role
language sql stable security definer set search_path = public
as $$ select role from public.at_profiles where id = auth.uid() $$;

create or replace function public.at_my_client()
returns uuid
language sql stable security definer set search_path = public
as $$ select client_id from public.at_profiles where id = auth.uid() $$;

create or replace function public.at_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.at_my_role() in ('admin','coordinador','operario','mensajero'), false) $$;

create or replace function public.at_is_ops()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.at_my_role() in ('admin','coordinador'), false) $$;

-- ── updated_at automático ────────────────────────────────────────────────
create or replace function public.at_touch_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;

create trigger at_clients_touch before update on public.at_clients
  for each row execute function public.at_touch_updated_at();
create trigger at_profiles_touch before update on public.at_profiles
  for each row execute function public.at_touch_updated_at();
create trigger at_guides_touch before update on public.at_guides
  for each row execute function public.at_touch_updated_at();

-- ── Alta automática de perfil al registrarse (rol 'pendiente') ───────────
create or replace function public.at_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.at_profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'pendiente')
  on conflict (id) do nothing;
  return new;
exception when others then
  return new; -- nunca bloquear la creación del usuario
end $$;

create trigger at_on_auth_user_created
  after insert on auth.users
  for each row execute function public.at_handle_new_user();

-- ── Antiescalada de privilegios en perfiles ──────────────────────────────
create or replace function public.at_guard_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.client_id is distinct from old.client_id or new.active is distinct from old.active)
     and coalesce(public.at_my_role(),'pendiente') <> 'admin'
     and auth.uid() is not null then
    raise exception 'Solo un administrador puede cambiar rol, cliente o estado activo';
  end if;
  return new;
end $$;

create trigger at_profiles_guard before update on public.at_profiles
  for each row execute function public.at_guard_profile_role();

-- ── Máquina de estados de guías ──────────────────────────────────────────
create or replace function public.at_valid_transition(p_from public.at_guide_status, p_to public.at_guide_status)
returns boolean language sql immutable
as $$
  select (p_from, p_to) in (
    ('creada','recogida'), ('creada','cancelada'),
    ('recogida','en_cedi'), ('recogida','cancelada'),
    ('en_cedi','zonificada'), ('en_cedi','cancelada'),
    ('zonificada','en_ruta'), ('zonificada','en_cedi'), ('zonificada','cancelada'),
    ('en_ruta','entregada'), ('en_ruta','novedad'),
    ('novedad','reprogramada'), ('novedad','en_devolucion'),
    ('reprogramada','zonificada'), ('reprogramada','cancelada'),
    ('en_devolucion','devuelta')
  )
$$;

create or replace function public.at_change_guide_status(
  p_guide_id uuid,
  p_new_status public.at_guide_status,
  p_note text default null
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
    courier_id       = case when p_new_status in ('en_cedi','reprogramada','en_devolucion') then null else g.courier_id end
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, p_new_status, p_note, auth.uid());

  return v_guide;
end $$;

-- ── Fase 9: evaluación de reintentos al retornar la novedad al CEDI ──────
create or replace function public.at_process_return(p_guide_id uuid, p_note text default null)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
begin
  if not public.at_is_staff() then raise exception 'No autorizado'; end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;
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
end $$;

-- ── Fase 3: asignación de zona y mensajero (picking/zonificación) ────────
create or replace function public.at_assign_courier(
  p_guide_id uuid,
  p_courier_id uuid,
  p_zone_id uuid default null
)
returns public.at_guides
language plpgsql security definer set search_path = public
as $$
declare
  v_guide public.at_guides;
  v_courier public.at_profiles;
begin
  if not (public.at_is_ops() or public.at_my_role() = 'operario') then
    raise exception 'No autorizado';
  end if;

  select * into v_courier from public.at_profiles where id = p_courier_id and role = 'mensajero' and active;
  if not found then raise exception 'El mensajero no existe o está inactivo'; end if;

  select * into v_guide from public.at_guides where id = p_guide_id for update;
  if not found then raise exception 'Guía no encontrada'; end if;
  if v_guide.status not in ('en_cedi','reprogramada') then
    raise exception 'Solo guías en CEDI o reprogramadas se pueden zonificar (estado actual: %)', v_guide.status;
  end if;

  update public.at_guides g set
    courier_id = p_courier_id,
    zone_id = coalesce(p_zone_id, g.zone_id, v_courier.zone_id),
    status = 'zonificada'
  where g.id = p_guide_id
  returning * into v_guide;

  insert into public.at_guide_events (guide_id, status, note, actor_id)
  values (p_guide_id, 'zonificada', 'Asignada a ' || v_courier.full_name, auth.uid());

  return v_guide;
end $$;

-- ── Fase 7: cierre de caja del mensajero ─────────────────────────────────
create or replace function public.at_create_settlement(p_courier_id uuid default null, p_date date default current_date)
returns public.at_settlements
language plpgsql security definer set search_path = public
as $$
declare
  v_courier uuid := coalesce(p_courier_id, auth.uid());
  v_settlement public.at_settlements;
  v_total numeric(12,2);
begin
  if not public.at_is_staff() then raise exception 'No autorizado'; end if;
  if public.at_my_role() = 'mensajero' and v_courier <> auth.uid() then
    raise exception 'Un mensajero solo puede cerrar su propia caja';
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
end $$;

create or replace function public.at_report_deposit(
  p_settlement_id uuid,
  p_amount numeric,
  p_reference text
)
returns public.at_settlements
language plpgsql security definer set search_path = public
as $$
declare v_s public.at_settlements;
begin
  select * into v_s from public.at_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Cierre no encontrado'; end if;
  if not (public.at_is_ops() or v_s.courier_id = auth.uid()) then
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
end $$;

create or replace function public.at_reconcile_settlement(p_settlement_id uuid, p_notes text default null)
returns public.at_settlements
language plpgsql security definer set search_path = public
as $$
declare v_s public.at_settlements;
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  select * into v_s from public.at_settlements where id = p_settlement_id for update;
  if not found then raise exception 'Cierre no encontrado'; end if;
  if v_s.status <> 'consignado' then raise exception 'El cierre debe estar consignado para conciliarse'; end if;

  update public.at_settlements set
    status = case when coalesce(deposited_amount,0) = expected_amount then 'conciliado' else 'con_diferencia' end,
    notes = coalesce(p_notes, notes),
    reconciled_by = auth.uid(),
    reconciled_at = now()
  where id = p_settlement_id
  returning * into v_s;
  return v_s;
end $$;

-- ── Cierre operativo: facturación quincenal/mensual ──────────────────────
create or replace function public.at_generate_invoice(
  p_client_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.at_invoices
language plpgsql security definer set search_path = public
as $$
declare
  v_client public.at_clients;
  v_invoice public.at_invoices;
  v_subtotal numeric(14,2);
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  select * into v_client from public.at_clients where id = p_client_id;
  if not found then raise exception 'Cliente no encontrado'; end if;

  insert into public.at_invoices (client_id, period_start, period_end, created_by)
  values (p_client_id, p_period_start, p_period_end, auth.uid())
  returning * into v_invoice;

  -- Entregas exitosas del periodo aún no facturadas
  insert into public.at_invoice_items (invoice_id, guide_id, description, amount)
  select v_invoice.id, g.id,
         'Entrega ' || g.guide_number || ' — ' || g.recipient_name,
         v_client.delivery_rate
  from public.at_guides g
  where g.client_id = p_client_id and g.status = 'entregada' and g.invoice_id is null
    and g.delivered_at::date between p_period_start and p_period_end;

  -- Devoluciones (logística inversa) del periodo aún no facturadas
  insert into public.at_invoice_items (invoice_id, guide_id, description, amount)
  select v_invoice.id, g.id,
         'Devolución ' || g.guide_number || ' — logística inversa',
         v_client.return_rate
  from public.at_guides g
  where g.client_id = p_client_id and g.status = 'devuelta' and g.invoice_id is null
    and g.returned_at::date between p_period_start and p_period_end;

  update public.at_guides set invoice_id = v_invoice.id
  where id in (select guide_id from public.at_invoice_items where invoice_id = v_invoice.id and guide_id is not null);

  select coalesce(sum(amount),0) into v_subtotal from public.at_invoice_items where invoice_id = v_invoice.id;

  if v_subtotal = 0 then
    delete from public.at_invoices where id = v_invoice.id;
    raise exception 'No hay guías facturables en el periodo seleccionado';
  end if;

  update public.at_invoices set subtotal = v_subtotal, total = v_subtotal
  where id = v_invoice.id
  returning * into v_invoice;

  return v_invoice;
end $$;

-- ── Rastreo público por número de guía (para clientes finales) ───────────
create or replace function public.at_track_guide(p_guide_number text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'guide_number', g.guide_number,
    'status', g.status,
    'recipient_city', g.recipient_city,
    'created_at', g.created_at,
    'delivered_at', g.delivered_at,
    'delivery_attempts', g.delivery_attempts,
    'events', coalesce((
      select json_agg(json_build_object('status', e.status, 'created_at', e.created_at) order by e.created_at)
      from public.at_guide_events e where e.guide_id = g.id
    ), '[]'::json)
  )
  from public.at_guides g
  where upper(g.guide_number) = upper(trim(p_guide_number))
$$;

grant execute on function public.at_track_guide(text) to anon, authenticated;

-- ── KPIs del dashboard (métricas del flujograma) ─────────────────────────
create or replace function public.at_dashboard_kpis()
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.at_my_client();
  result json;
begin
  if not (public.at_is_staff() or public.at_my_role() = 'cliente') then
    raise exception 'No autorizado';
  end if;

  select json_build_object(
    'by_status', (
      select coalesce(json_object_agg(status, n), '{}'::json)
      from (select status, count(*) n from public.at_guides
            where v_client is null or client_id = v_client group by status) s
    ),
    'guides_today', (
      select count(*) from public.at_guides
      where created_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    'delivered_today', (
      select count(*) from public.at_guides
      where delivered_at::date = current_date and (v_client is null or client_id = v_client)
    ),
    -- LTR: horas promedio desde creación hasta digitalización en recogida (últimos 30 días)
    'ltr_hours', (
      select round(avg(extract(epoch from (picked_up_at - created_at)) / 3600)::numeric, 1)
      from public.at_guides
      where picked_up_at is not null and created_at > now() - interval '30 days'
        and (v_client is null or client_id = v_client)
    ),
    -- TLI: % de guías finalizadas que terminaron en devolución (últimos 30 días)
    'tli_pct', (
      select round(100.0 * count(*) filter (where status = 'devuelta')
             / nullif(count(*) filter (where status in ('entregada','devuelta')), 0), 1)
      from public.at_guides
      where created_at > now() - interval '30 days' and (v_client is null or client_id = v_client)
    ),
    'cod_pending', (
      select coalesce(sum(cod_amount),0) from public.at_guides
      where is_cod and status = 'entregada' and settlement_id is null
        and (v_client is null or client_id = v_client)
    ),
    'settlements_pending', (
      select count(*) from public.at_settlements where status in ('pendiente','consignado')
    ),
    'active_couriers', (
      select count(distinct courier_id) from public.at_guides
      where status in ('zonificada','en_ruta') and courier_id is not null
        and (v_client is null or client_id = v_client)
    )
  ) into result;

  return result;
end $$;
