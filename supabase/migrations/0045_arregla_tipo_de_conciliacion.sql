-- at_reconcile_settlement (migración 0002) fallaba siempre con "column
-- "status" is of type at_settlement_status but expression is of type text":
-- el CASE que decide entre 'conciliado' y 'con_diferencia' resolvía sus dos
-- ramas como texto plano, y Postgres no lo deja asignar a una columna enum
-- sin decirle explícitamente a qué tipo castear. Nadie pudo conciliar un
-- cierre de caja desde que existe la función.

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
    status = (case when coalesce(deposited_amount,0) = expected_amount
                then 'conciliado' else 'con_diferencia' end)::public.at_settlement_status,
    notes = coalesce(p_notes, notes),
    reconciled_by = auth.uid(),
    reconciled_at = now()
  where id = p_settlement_id
  returning * into v_s;
  return v_s;
end $$;
