-- A TIEMPO LOGÍSTICA — cuánto se cobra por una guía se decide en un solo lugar.
--
-- Había dos caminos para facturar y cada uno cobraba distinto:
--
--   · el automático (at_facturar_guia, se dispara al entregar) cobra el precio
--     real del domicilio congelado en la guía, y no cobra nada cuando el
--     comprador ya pagó el domicilio dentro del contraentrega;
--
--   · el manual (at_generate_invoice, el botón de Facturación) seguía en la
--     tarifa plana del comercio —los 6.000 de antes— y no sabía nada del
--     contraentrega.
--
-- O sea que la misma guía valía una cosa o la otra según por dónde se
-- facturara. Y por el camino manual, dos veces mal: se le cobraba de menos el
-- domicilio real, y se le cobraba un domicilio que el comprador ya había
-- pagado en la puerta.
--
-- Ahora la regla vive en at_cobro_de_guia y los dos caminos la llaman. No
-- pueden discrepar porque ya no hay dos reglas que mantener de acuerdo.

create or replace function public.at_cobro_de_guia(
  g public.at_guides,
  out monto numeric,
  out descripcion text
)
language plpgsql stable set search_path = public
as $$
begin
  if g.status = 'devuelta' then
    monto := coalesce((select return_rate from public.at_clients where id = g.client_id), 0);
    descripcion := 'Devolución ' || g.guide_number || ' — logística inversa';

  -- El domicilio venía dentro del contraentrega: el mensajero ya se lo cobró
  -- al comprador en la puerta. Se deja la línea en cero para que el comercio
  -- vea la entrega en su factura y entienda por qué no se le cobra.
  elsif g.cod_includes_shipping then
    monto := 0;
    descripcion := 'Entrega ' || g.guide_number || ' — domicilio cobrado al comprador';

  else
    monto := coalesce(g.shipping_fee, 0);
    descripcion := 'Entrega ' || g.guide_number || ' — ' || g.recipient_name;
  end if;
end $$;

comment on function public.at_cobro_de_guia(public.at_guides) is
  'Cuánto se le cobra al comercio por una guía y cómo se describe en la factura. Único criterio: lo usan la facturación automática y la manual.';

grant execute on function public.at_cobro_de_guia(public.at_guides) to authenticated;

-- ── El camino automático ──────────────────────────────────────────────────
create or replace function public.at_facturar_guia()
returns trigger
language plpgsql security definer set search_path = public
as $function$
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

  select monto, descripcion into v_monto, v_desc
  from public.at_cobro_de_guia(new);

  insert into public.at_invoice_items (invoice_id, guide_id, description, amount)
  values (v_invoice.id, new.id, v_desc, v_monto);

  update public.at_invoices i set
    period_end = greatest(i.period_end, current_date),
    subtotal   = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id),
    total      = (select coalesce(sum(amount),0) from public.at_invoice_items where invoice_id = i.id)
  where i.id = v_invoice.id;

  new.invoice_id := v_invoice.id;
  return new;
end $function$;

-- ── El camino manual ──────────────────────────────────────────────────────
-- Sirve para lo que el automático no alcanza: las guías entregadas ANTES de
-- que existiera el trigger, y cualquier periodo que ops necesite rehacer.
create or replace function public.at_generate_invoice(
  p_client_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.at_invoices
language plpgsql security definer
set search_path = public
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_invoice public.at_invoices;
  v_lineas  int;
  v_subtotal numeric(14,2);
begin
  if not public.at_is_ops() then raise exception 'No autorizado'; end if;

  if not exists (select 1 from public.at_clients where id = p_client_id) then
    raise exception 'Cliente no encontrado';
  end if;

  insert into public.at_invoices (client_id, period_start, period_end, created_by)
  values (p_client_id, p_period_start, p_period_end, auth.uid())
  returning * into v_invoice;

  -- Entregas y devoluciones en una sola pasada, con el mismo criterio de
  -- cobro que usa la facturación automática. Cada estado se ubica en el
  -- periodo por su propia fecha: la entrega por delivered_at, la devolución
  -- por returned_at.
  insert into public.at_invoice_items (invoice_id, guide_id, description, amount)
  select v_invoice.id, g.id, cobro.descripcion, cobro.monto
  from public.at_guides g
  cross join lateral public.at_cobro_de_guia(g) as cobro
  where g.client_id = p_client_id
    and g.invoice_id is null
    and g.status in ('entregada','devuelta')
    and (case when g.status = 'entregada' then g.delivered_at else g.returned_at end)::date
        between p_period_start and p_period_end;

  get diagnostics v_lineas = row_count;

  update public.at_guides set invoice_id = v_invoice.id
  where id in (
    select guide_id from public.at_invoice_items
    where invoice_id = v_invoice.id and guide_id is not null
  );

  -- Se mira si hubo LÍNEAS, no si el total dio cero. Un periodo entero de
  -- entregas con el domicilio cobrado al comprador suma cero y es una factura
  -- perfectamente válida: le muestra al comercio sus entregas y que no debe
  -- nada por ellas. Con la comprobación vieja se borraba y le salía un
  -- "no hay guías facturables" que era mentira.
  if v_lineas = 0 then
    delete from public.at_invoices where id = v_invoice.id;
    raise exception 'No hay guías facturables en el periodo seleccionado';
  end if;

  select coalesce(sum(amount),0) into v_subtotal
  from public.at_invoice_items where invoice_id = v_invoice.id;

  update public.at_invoices set subtotal = v_subtotal, total = v_subtotal
  where id = v_invoice.id
  returning * into v_invoice;

  return v_invoice;
end $function$;

revoke execute on function public.at_generate_invoice(uuid, date, date) from public, anon;
grant execute on function public.at_generate_invoice(uuid, date, date) to authenticated;
