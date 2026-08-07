-- A TIEMPO LOGÍSTICA — Clarificación de devoluciones:
-- El servicio logístico prestado para un intento de entrega o retorno ya fue operado/pagado.
-- No se retorna dinero a nadie en devoluciones; únicamente se realiza la entrega física del paquete de regreso al comercio e-commerce.

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
    -- En caso de devolución, el costo cobrado al comercio es la tarifa de retorno/logística inversa (o tarifa pactada),
    -- sin efectuar ningún tipo de reembolso ni retorno de dinero al comprador o comercio.
    v_monto := coalesce((select return_rate from public.at_clients where id = new.client_id), 0);
    v_desc  := 'Devolución ' || new.guide_number || ' — retorno físico de paquete a e-commerce (sin reembolso)';

  elsif new.cod_includes_shipping then
    -- El comprador pagó el domicilio dentro del valor recaudado
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
