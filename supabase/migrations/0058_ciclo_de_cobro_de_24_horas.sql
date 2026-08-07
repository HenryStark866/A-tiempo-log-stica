-- A TIEMPO LOGÍSTICA — el ciclo de cobro es de 24 horas, no de 48.
--
-- El plazo estaba escrito a mano en cuatro sitios distintos (dos funciones,
-- una condición repetida y un mensaje de error). Cambiarlo obligaba a
-- encontrarlos todos, y olvidar uno dejaba la app diciendo un plazo y
-- aplicando otro: el comercio leería "tienes hasta mañana" y quedaría
-- bloqueado antes.
--
-- Ahora el plazo vive en una sola función. El próximo ajuste es una línea.

create or replace function public.at_ciclo_cobro()
returns interval
language sql immutable
set search_path = public
as $$ select interval '24 hours' $$;

comment on function public.at_ciclo_cobro() is
  'Cuánto tiempo tiene un comercio para pagar antes de que se le detengan las recogidas. Único lugar donde vive el plazo.';

grant execute on function public.at_ciclo_cobro() to authenticated;

-- ── Estado de cartera ─────────────────────────────────────────────────────
create or replace function public.at_estado_cartera(p_client_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'al_dia', not exists (
      select 1 from public.at_invoices
      where client_id = p_client_id
        and status in ('borrador','emitida')
        and created_at < now() - public.at_ciclo_cobro()
    ),
    'saldo', coalesce((
      select sum(total) from public.at_invoices
      where client_id = p_client_id and status in ('borrador','emitida')
    ), 0),
    'vence_en', (
      select min(created_at) + public.at_ciclo_cobro()
      from public.at_invoices
      where client_id = p_client_id and status in ('borrador','emitida')
    )
  )
$$;

revoke execute on function public.at_estado_cartera(uuid) from public, anon;
grant execute on function public.at_estado_cartera(uuid) to authenticated;

-- ── El bloqueo al pedir recogida ──────────────────────────────────────────
-- El mensaje ya no trae el número escrito a mano: lo saca del mismo plazo que
-- aplica la condición, para que no puedan discrepar nunca.
create or replace function public.at_request_pickup(
  p_client_id uuid default null,
  p_scheduled_date date default null,
  p_scheduled_time time without time zone default null,
  p_address text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_notes text default null,
  p_guide_ids uuid[] default '{}'::uuid[]
)
returns at_pickups
language plpgsql security definer set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_client uuid;
  v_pickup public.at_pickups;
  v_address text;
  v_ajenas int;
  v_vencida public.at_invoices;
  v_horas int := extract(epoch from public.at_ciclo_cobro()) / 3600;
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;

  if v_role = 'cliente' then
    v_client := public.at_my_client();
    if v_client is null then
      raise exception 'Tu cuenta todavía no tiene comercio';
    end if;

    select * into v_vencida
    from public.at_invoices
    where client_id = v_client
      and status in ('borrador','emitida')
      and created_at < now() - public.at_ciclo_cobro()
    order by created_at
    limit 1;

    if found then
      raise exception 'Tienes la factura % sin pagar desde hace más de % horas (%). Reporta el pago y, apenas lo verifiquemos, puedes volver a solicitar recogidas.',
        v_vencida.invoice_number, v_horas, to_char(v_vencida.total, 'FM$999G999G999');
    end if;
  else
    v_client := p_client_id;
    if v_client is null then
      raise exception 'Selecciona el comercio que solicita la recogida';
    end if;
    if not exists (select 1 from public.at_clients where id = v_client) then
      raise exception 'El comercio indicado no existe';
    end if;
  end if;

  select count(*) into v_ajenas
  from public.at_guides g
  where g.id = any(p_guide_ids) and g.client_id is distinct from v_client;
  if v_ajenas > 0 then
    raise exception 'Hay % guía(s) que no pertenecen a ese comercio', v_ajenas;
  end if;

  v_address := coalesce(
    nullif(trim(p_address), ''),
    (select nullif(trim(address), '') from public.at_clients where id = v_client)
  );
  if v_address is null then
    raise exception 'Indica la dirección donde debemos recoger';
  end if;

  update public.at_clients set address = v_address
  where id = v_client and coalesce(trim(address), '') = '';

  insert into public.at_pickups
    (client_id, scheduled_date, scheduled_time, address, contact_name, contact_phone, notes, status, created_by)
  values
    (v_client, coalesce(p_scheduled_date, current_date), p_scheduled_time, v_address,
     nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
     nullif(trim(p_notes), ''), 'pendiente', auth.uid())
  returning * into v_pickup;

  update public.at_guides g set pickup_id = v_pickup.id
  where g.id = any(p_guide_ids) and g.client_id = v_client
    and g.status = 'creada' and g.pickup_id is null;

  return v_pickup;
end $function$;
