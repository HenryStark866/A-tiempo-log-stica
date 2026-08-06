-- A TIEMPO LOGÍSTICA — la factura se arma sola, se paga con comprobante, y el
-- mensajero puede entregar sin pasar por el CEDI.
--
-- Cuatro cosas que van juntas porque son un solo ciclo de plata:
--
--   1. Cada entrega entra sola a la cuenta del comercio, con el precio real
--      del domicilio (el de la matriz origen→destino, congelado en la guía).
--   2. El comercio ve lo que debe, registra el pago y sube el comprobante.
--   3. El admin verifica el comprobante y la factura queda pagada.
--   4. Con factura vencida (más de 48 h sin pagar) no puede pedir más
--      recogidas: se le acumula deuda y la operación se detiene sola.
--
-- Y aparte, lo que cambia la operación: si el destinatario está en la misma
-- zona donde el mensajero está recogiendo, llevar el paquete al CEDI es dar
-- una vuelta al valle para volver al mismo barrio. Ahora puede entregarlo
-- directo.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. La factura se arma sola con cada entrega
-- ══════════════════════════════════════════════════════════════════════════
-- Va en un trigger BEFORE y no en un proceso aparte para que sea imposible
-- que una guía quede entregada y sin facturar: es la misma escritura. BEFORE
-- y no AFTER a propósito: así se asigna invoice_id en la misma fila, sin un
-- segundo UPDATE sobre at_guides que volvería a disparar el trigger.
create or replace function public.at_facturar_guia()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.at_invoices;
  v_monto   numeric(14,2);
  v_desc    text;
begin
  if new.invoice_id is not null then return new; end if;
  if new.status not in ('entregada','devuelta') then return new; end if;
  if old.status = new.status then return new; end if;

  select * into v_invoice
  from public.at_invoices
  where client_id = new.client_id and status = 'borrador'
  order by created_at
  limit 1;

  if not found then
    insert into public.at_invoices (client_id, period_start, period_end)
    values (new.client_id, current_date, current_date)
    returning * into v_invoice;
  end if;

  if new.status = 'devuelta' then
    v_monto := coalesce((select return_rate from public.at_clients where id = new.client_id), 0);
    v_desc  := 'Devolución ' || new.guide_number || ' — logística inversa';

  elsif new.cod_includes_shipping then
    -- El comprador ya pagó el domicilio dentro del contraentrega: esa plata
    -- la recaudó el mensajero, no se le vuelve a cobrar al comercio. El
    -- renglón queda en cero igual, para que el comercio vea la guía en su
    -- cuenta y entienda por qué no suma, en vez de creer que se perdió.
    v_monto := 0;
    v_desc  := 'Entrega ' || new.guide_number || ' — domicilio cobrado al comprador';
  else
    v_monto := coalesce(new.shipping_fee, 0);
    v_desc  := 'Entrega ' || new.guide_number || ' — ' || new.recipient_name;
  end if;

  insert into public.at_invoice_items (invoice_id, guide_id, description, amount)
  values (v_invoice.id, new.id, v_desc, v_monto);

  update public.at_invoices i set
    period_end = greatest(i.period_end, current_date),
    subtotal   = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id),
    total      = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id)
  where i.id = v_invoice.id;

  new.invoice_id := v_invoice.id;
  return new;
end $$;

drop trigger if exists at_guides_facturar on public.at_guides;
create trigger at_guides_facturar
  before update of status on public.at_guides
  for each row execute function public.at_facturar_guia();

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Pagos y comprobantes
-- ══════════════════════════════════════════════════════════════════════════
create table if not exists public.at_invoice_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.at_invoices(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  method       text,
  reference    text,
  receipt_path text,
  reported_by  uuid references public.at_profiles(id) on delete set null,
  reported_at  timestamptz not null default now(),
  status       text not null default 'pendiente'
    check (status in ('pendiente','verificado','rechazado')),
  review_notes text,
  verified_by  uuid references public.at_profiles(id) on delete set null,
  verified_at  timestamptz
);

create index if not exists at_invoice_payments_invoice_idx
  on public.at_invoice_payments (invoice_id, status);

alter table public.at_invoice_payments enable row level security;

drop policy if exists "ops o cliente dueño lee pagos" on public.at_invoice_payments;
create policy "ops o cliente dueño lee pagos" on public.at_invoice_payments
  for select to authenticated
  using (
    public.at_is_ops()
    or exists (select 1 from public.at_invoices i
               where i.id = invoice_id and i.client_id = public.at_my_client())
  );

insert into storage.buckets (id, name, public)
values ('at-payment-receipts', 'at-payment-receipts', false)
on conflict (id) do nothing;

drop policy if exists "at comercio sube su comprobante" on storage.objects;
create policy "at comercio sube su comprobante"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'at-payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "at comercio reemplaza su comprobante" on storage.objects;
create policy "at comercio reemplaza su comprobante"
on storage.objects for update to authenticated
using (
  bucket_id = 'at-payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "at dueno u ops ve comprobantes" on storage.objects;
create policy "at dueno u ops ve comprobantes"
on storage.objects for select to authenticated
using (
  bucket_id = 'at-payment-receipts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.at_is_ops()
  )
);

-- ── El comercio reporta que pagó ──────────────────────────────────────────
create or replace function public.at_report_invoice_payment(
  p_invoice_id   uuid,
  p_amount       numeric,
  p_reference    text default null,
  p_receipt_path text default null,
  p_method       text default null
)
returns public.at_invoice_payments
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.at_invoices;
  v_out public.at_invoice_payments;
begin
  select * into v_invoice from public.at_invoices where id = p_invoice_id;
  if not found then raise exception 'Factura no encontrada'; end if;

  if not (public.at_is_ops() or v_invoice.client_id = public.at_my_client()) then
    raise exception 'No autorizado';
  end if;
  if v_invoice.status = 'pagada' then
    raise exception 'Esta factura ya está pagada';
  end if;
  if v_invoice.status = 'anulada' then
    raise exception 'Esta factura está anulada';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El valor pagado tiene que ser mayor que cero';
  end if;
  -- El comprobante tiene que estar en la carpeta de quien lo reporta: sin
  -- esto alguien podría adjuntar el archivo de otro como suyo.
  if p_receipt_path is not null and split_part(p_receipt_path, '/', 1) <> auth.uid()::text then
    raise exception 'El comprobante no corresponde a tu carpeta';
  end if;

  insert into public.at_invoice_payments
    (invoice_id, amount, method, reference, receipt_path, reported_by)
  values
    (p_invoice_id, p_amount, nullif(trim(p_method),''), nullif(trim(p_reference),''),
     nullif(trim(p_receipt_path),''), auth.uid())
  returning * into v_out;

  -- Al admin nacional, que es quien verifica.
  insert into public.at_notifications (user_id, title, body, link)
  select p.id, 'Pago reportado',
         coalesce((select business_name from public.at_clients where id = v_invoice.client_id), 'Un comercio')
           || ' reportó ' || to_char(p_amount, 'FM$999G999G999')
           || ' de la factura ' || v_invoice.invoice_number,
         '/facturacion'
  from public.at_profiles p
  where p.role in ('admin','coordinador') and p.active;

  return v_out;
end $$;

revoke execute on function public.at_report_invoice_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.at_report_invoice_payment(uuid, numeric, text, text, text) to authenticated;

-- ── El admin verifica el comprobante ──────────────────────────────────────
-- Una factura queda pagada solo cuando la suma de los pagos VERIFICADOS
-- alcanza el total. Un comprobante subido no paga nada por sí solo: si
-- bastara con reportar, cualquiera se desbloquearía las recogidas escribiendo
-- un número.
create or replace function public.at_verify_invoice_payment(
  p_payment_id uuid,
  p_approved   boolean,
  p_notes      text default null
)
returns public.at_invoice_payments
language plpgsql security definer set search_path = public
as $$
declare
  v_pago    public.at_invoice_payments;
  v_invoice public.at_invoices;
  v_pagado  numeric(14,2);
begin
  if not public.at_is_ops() then
    raise exception 'Solo administración verifica los pagos';
  end if;
  if not p_approved and coalesce(trim(p_notes), '') = '' then
    raise exception 'Para rechazar un pago hay que decir por qué';
  end if;

  update public.at_invoice_payments set
    status       = case when p_approved then 'verificado' else 'rechazado' end,
    review_notes = nullif(trim(coalesce(p_notes,'')), ''),
    verified_by  = auth.uid(),
    verified_at  = now()
  where id = p_payment_id
  returning * into v_pago;

  if not found then raise exception 'Pago no encontrado'; end if;

  select * into v_invoice from public.at_invoices where id = v_pago.invoice_id;

  select coalesce(sum(amount),0) into v_pagado
  from public.at_invoice_payments
  where invoice_id = v_pago.invoice_id and status = 'verificado';

  if p_approved and v_pagado >= v_invoice.total and v_invoice.total > 0 then
    update public.at_invoices
    set status = 'pagada', paid_at = now()
    where id = v_invoice.id;
  end if;

  -- Al comercio: que sepa si quedó al día o si tiene que corregir algo.
  insert into public.at_notifications (user_id, title, body, link)
  select p.id,
         case when p_approved then 'Pago verificado' else 'Pago rechazado' end,
         case when p_approved
              then case when v_pagado >= v_invoice.total
                        then 'La factura ' || v_invoice.invoice_number || ' quedó pagada. Ya puedes solicitar recogidas.'
                        else 'Abonamos ' || to_char(v_pago.amount, 'FM$999G999G999')
                             || ' a la factura ' || v_invoice.invoice_number || '. Todavía queda saldo.' end
              else coalesce(v_pago.review_notes, 'Revisa el comprobante y vuelve a reportarlo.') end,
         '/facturacion'
  from public.at_profiles p
  where p.client_id = v_invoice.client_id and p.active;

  return v_pago;
end $$;

revoke execute on function public.at_verify_invoice_payment(uuid, boolean, text) from public, anon;
grant execute on function public.at_verify_invoice_payment(uuid, boolean, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Con deuda vencida no hay más recogidas
-- ══════════════════════════════════════════════════════════════════════════
-- 48 horas de gracia desde que la factura se genera. Dentro de esa ventana
-- puede seguir despachando aunque no haya pagado; pasada, se detiene.
create or replace function public.at_estado_cartera(p_client_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'al_dia', not exists (
      select 1 from public.at_invoices
      where client_id = p_client_id
        and status in ('borrador','emitida')
        and created_at < now() - interval '48 hours'
    ),
    'saldo', coalesce((
      select sum(total) from public.at_invoices
      where client_id = p_client_id and status in ('borrador','emitida')
    ), 0),
    'vence_en', (
      select min(created_at) + interval '48 hours'
      from public.at_invoices
      where client_id = p_client_id and status in ('borrador','emitida')
    )
  )
$$;

revoke execute on function public.at_estado_cartera(uuid) from public, anon;
grant execute on function public.at_estado_cartera(uuid) to authenticated;

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
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;

  if v_role = 'cliente' then
    v_client := public.at_my_client();
    if v_client is null then
      raise exception 'Tu cuenta todavía no tiene comercio';
    end if;

    -- NUEVO: cartera vencida detiene la operación. Solo por la puerta del
    -- autoservicio: si es el CEDI quien la crea a mano, está decidiendo
    -- conscientemente y ve la deuda en Facturación.
    select * into v_vencida
    from public.at_invoices
    where client_id = v_client
      and status in ('borrador','emitida')
      and created_at < now() - interval '48 hours'
    order by created_at
    limit 1;

    if found then
      raise exception 'Tienes la factura % sin pagar desde hace más de 48 horas (%). Reporta el pago y, apenas lo verifiquemos, puedes volver a solicitar recogidas.',
        v_vencida.invoice_number, to_char(v_vencida.total, 'FM$999G999G999');
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

  update public.at_clients
  set address = v_address
  where id = v_client and coalesce(trim(address), '') = '';

  insert into public.at_pickups
    (client_id, scheduled_date, scheduled_time, address, contact_name, contact_phone, notes, status, created_by)
  values
    (v_client, coalesce(p_scheduled_date, current_date), p_scheduled_time, v_address,
     nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''),
     nullif(trim(p_notes), ''), 'pendiente', auth.uid())
  returning * into v_pickup;

  update public.at_guides g
  set pickup_id = v_pickup.id
  where g.id = any(p_guide_ids)
    and g.client_id = v_client
    and g.status = 'creada'
    and g.pickup_id is null;

  return v_pickup;
end $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Entrega directa: del comercio al destinatario, sin pasar por el CEDI
-- ══════════════════════════════════════════════════════════════════════════
create or replace function public.at_valid_transition(p_from at_guide_status, p_to at_guide_status)
returns boolean
language sql immutable set search_path = public
as $function$
  select (p_from, p_to) in (
    ('creada','recogida'), ('creada','cancelada'),
    ('recogida','en_cedi'), ('recogida','cancelada'),
    -- NUEVA: el mensajero entrega sin devolverse al CEDI cuando el
    -- destinatario está en la misma zona donde acaba de recoger.
    ('recogida','en_ruta'),
    ('en_cedi','zonificada'), ('en_cedi','cancelada'),
    ('zonificada','en_ruta'), ('zonificada','en_cedi'), ('zonificada','cancelada'),
    ('en_ruta','entregada'), ('en_ruta','novedad'),
    ('novedad','reprogramada'), ('novedad','en_devolucion'),
    ('reprogramada','zonificada'), ('reprogramada','cancelada'),
    ('en_devolucion','devuelta')
  )
$function$;

-- Qué guías de una recogida se pueden entregar directo. La app no tiene
-- coordenadas, así que "más cerca que el CEDI" se deduce por zonas: si el
-- destinatario cae en la misma zona desde la que se está recogiendo, ir al
-- CEDI es cruzar el valle para volver al mismo barrio.
create or replace function public.at_guias_entrega_directa(p_pickup_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
           'id', g.id,
           'guide_number', g.guide_number,
           'recipient_name', g.recipient_name,
           'recipient_address', g.recipient_address,
           'zone_name', z.name,
           'is_cod', g.is_cod,
           'cod_amount', g.cod_amount
         ) order by g.recipient_address), '[]'::json)
  from public.at_guides g
  join public.at_pickups pk on pk.id = g.pickup_id
  join public.at_clients c  on c.id = pk.client_id
  left join public.at_zones z on z.id = coalesce(
    g.zone_id,
    public.at_zone_for_city(coalesce(g.recipient_city,'') || ' ' || coalesce(g.recipient_address,''))
  )
  where g.pickup_id = p_pickup_id
    and g.status = 'recogida'
    and c.zone_id is not null
    and coalesce(
      g.zone_id,
      public.at_zone_for_city(coalesce(g.recipient_city,'') || ' ' || coalesce(g.recipient_address,''))
    ) = c.zone_id
$$;

revoke execute on function public.at_guias_entrega_directa(uuid) from public, anon;
grant execute on function public.at_guias_entrega_directa(uuid) to authenticated;

-- El mensajero se queda las guías y sale a entregarlas. No pasa por
-- at_change_guide_status porque allá el mensajero solo puede tocar lo que ya
-- tiene asignado, y en 'recogida' la guía todavía no tiene dueño: es
-- justamente esta función la que se lo asigna.
create or replace function public.at_entrega_directa(p_guide_ids uuid[])
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
  v_g record;
  v_zona_destino uuid;
  v_zona_origen uuid;
  v_tomadas int := 0;
begin
  if v_role is null or (v_role <> 'mensajero' and not public.at_is_ops()) then
    raise exception 'No autorizado';
  end if;
  if coalesce(array_length(p_guide_ids, 1), 0) = 0 then
    raise exception 'No marcaste ninguna guía';
  end if;

  for v_g in
    select g.*, pk.operator_id, c.zone_id as client_zone
    from public.at_guides g
    join public.at_pickups pk on pk.id = g.pickup_id
    join public.at_clients c  on c.id = g.client_id
    where g.id = any(p_guide_ids)
    for update of g
  loop
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
    v_zona_origen := v_g.client_zone;

    if v_zona_destino is null or v_zona_origen is null or v_zona_destino <> v_zona_origen then
      raise exception 'La guía % no va a la misma zona del comercio: tiene que pasar por el CEDI', v_g.guide_number;
    end if;

    update public.at_guides set
      status     = 'en_ruta',
      zone_id    = v_zona_destino,
      courier_id = case when v_role = 'mensajero' then auth.uid() else courier_id end
    where id = v_g.id;

    insert into public.at_guide_events (guide_id, status, note, actor_id)
    values (v_g.id, 'en_ruta',
            'Entrega directa: el destinatario está en la misma zona de la recogida, no pasa por el CEDI',
            auth.uid());

    v_tomadas := v_tomadas + 1;
  end loop;

  return json_build_object('en_ruta', v_tomadas);
end $$;

revoke execute on function public.at_entrega_directa(uuid[]) from public, anon;
grant execute on function public.at_entrega_directa(uuid[]) to authenticated;
