-- A TIEMPO LOGÍSTICA — Editar ítems de factura
-- Permite a los administradores / coordinadores ajustar montos y descripciones de ítems,
-- o agregar nuevos conceptos (ajustes, cargos) antes de emitir la factura.

-- 1. Upsert (insertar/actualizar) un ítem de factura
create or replace function public.at_upsert_invoice_item(
  p_invoice_id uuid,
  p_item_id uuid,
  p_description text,
  p_amount numeric
)
returns public.at_invoice_items
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice public.at_invoices;
  v_out public.at_invoice_items;
begin
  -- 1. Verificar que sea staff (ops)
  if not public.at_is_ops() then
    raise exception 'Solo administración puede modificar ítems de factura';
  end if;

  -- 2. Cargar y verificar la factura
  select * into v_invoice from public.at_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Factura no encontrada';
  end if;

  if v_invoice.status <> 'borrador' then
    raise exception 'Solo se pueden editar facturas en estado borrador';
  end if;

  if p_description is null or trim(p_description) = '' then
    raise exception 'La descripción del ítem es requerida';
  end if;

  -- 3. Insertar o actualizar el ítem
  if p_item_id is null then
    insert into public.at_invoice_items (invoice_id, description, amount)
    values (p_invoice_id, trim(p_description), p_amount)
    returning * into v_out;
  else
    update public.at_invoice_items set
      description = trim(p_description),
      amount = p_amount
    where id = p_item_id and invoice_id = p_invoice_id
    returning * into v_out;

    if not found then
      raise exception 'Item no encontrado en esta factura';
    end if;
  end if;

  -- 4. Recalcular subtotal y total de la factura
  update public.at_invoices i set
    subtotal = (select coalesce(sum(amount), 0) from public.at_invoice_items where invoice_id = i.id),
    total = (select coalesce(sum(amount), 0) from public.at_invoice_items where invoice_id = i.id)
  where id = p_invoice_id;

  return v_out;
end $$;

revoke execute on function public.at_upsert_invoice_item(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.at_upsert_invoice_item(uuid, uuid, text, numeric) to authenticated;


-- 2. Eliminar un ítem de factura
create or replace function public.at_delete_invoice_item(
  p_item_id uuid
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_status text;
begin
  -- 1. Verificar que sea staff (ops)
  if not public.at_is_ops() then
    raise exception 'Solo administración puede eliminar ítems de factura';
  end if;

  -- 2. Cargar y verificar factura e ítem
  select invoice_id into v_invoice_id
  from public.at_invoice_items
  where id = p_item_id;

  if not found then
    raise exception 'Item no encontrado';
  end if;

  select status into v_status
  from public.at_invoices
  where id = v_invoice_id;

  if v_status <> 'borrador' then
    raise exception 'Solo se pueden eliminar ítems de facturas en estado borrador';
  end if;

  -- 3. Eliminar el ítem
  delete from public.at_invoice_items where id = p_item_id;

  -- 4. Recalcular subtotal y total de la factura
  update public.at_invoices i set
    subtotal = (select coalesce(sum(amount), 0) from public.at_invoice_items where invoice_id = i.id),
    total = (select coalesce(sum(amount), 0) from public.at_invoice_items where invoice_id = i.id)
  where id = v_invoice_id;

  return true;
end $$;

revoke execute on function public.at_delete_invoice_item(uuid) from public, anon;
grant execute on function public.at_delete_invoice_item(uuid) to authenticated;
