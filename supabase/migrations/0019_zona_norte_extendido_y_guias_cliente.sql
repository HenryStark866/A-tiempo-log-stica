-- A TIEMPO LOGÍSTICA — Tarifa real de Zona 4 y guías editables por el comercio.
--
-- DOS COSAS INDEPENDIENTES:
--   1. Zona 4 · Norte Extendido cobraba una tarifa desactualizada.
--   2. El comercio no podía corregir ni eliminar una guía recién creada. Si se
--      equivocaba en la dirección tocaba llamar a operaciones.

-- ── 1. Tarifa vigente de Zona 4 ────────────────────────────────────────
-- Copacabana y Girardota. Las guías ya facturadas o liquidadas no se tocan:
-- la tarifa se lee de esta tabla al facturar, así que cambiarla aquí solo
-- afecta lo que se cobre de ahora en adelante.
update public.at_zones
set delivery_rate = 22000
where sort_order = 4;

-- ── 2. Editar y eliminar, solo antes de salir hacia el CEDI ────────────
--
-- El corte es el estado 'creada'. Apenas operaciones marca 'recogida', el
-- paquete ya salió físicamente y sus datos no pueden cambiar.
--
-- Va por RPC y NO por una política de UPDATE abierta. Con RLS amplio, el
-- comercio podría mandar por API cualquier columna de la fila —incluidos
-- guide_number y payment_token— y romper el rastreo o el QR de pago de una
-- guía ajena. La función fija la lista de campos editables y el resto queda
-- fuera de su alcance.
--
-- No se crea política de DELETE por la misma razón: sin ella, RLS niega el
-- borrado directo y todo pasa obligatoriamente por at_delete_guide, que es
-- donde se valida. La cascada de at_guide_events ya existe desde 0001.

create or replace function public.at_update_guide(
  p_guide_id          uuid,
  p_recipient_name    text,
  p_recipient_phone   text,
  p_recipient_address text,
  p_recipient_city    text,
  p_zone_id           uuid,
  p_is_cod            boolean,
  p_cod_amount        numeric,
  p_notes             text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_guide  public.at_guides;
  v_role   public.at_role := public.at_my_role();
  v_client uuid           := public.at_my_client();
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then
    raise exception 'Guía no encontrada';
  end if;

  if v_guide.status <> 'creada' then
    raise exception 'Esta guía ya fue despachada al CEDI y no se puede editar';
  end if;

  if v_role = 'cliente' and v_guide.client_id is distinct from v_client then
    raise exception 'No tienes permiso para editar esta guía';
  elsif v_role not in ('cliente', 'admin', 'coordinador', 'operario') then
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
    -- Sin contraentrega no hay monto que recaudar; se limpia para que no quede
    -- un valor viejo cobrándose si vuelven a activar la casilla.
    cod_amount        = case when coalesce(p_is_cod, false)
                             then greatest(coalesce(p_cod_amount, 0), 0)
                             else 0 end,
    notes             = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at        = now()
  where id = p_guide_id;
end $$;

revoke execute on function public.at_update_guide(uuid, text, text, text, text, uuid, boolean, numeric, text) from public, anon;
grant execute on function public.at_update_guide(uuid, text, text, text, text, uuid, boolean, numeric, text) to authenticated;

create or replace function public.at_delete_guide(p_guide_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_guide  public.at_guides;
  v_role   public.at_role := public.at_my_role();
  v_client uuid           := public.at_my_client();
begin
  select * into v_guide from public.at_guides where id = p_guide_id;
  if not found then
    raise exception 'Guía no encontrada';
  end if;

  if v_guide.status <> 'creada' then
    raise exception 'Esta guía ya fue despachada al CEDI y no se puede eliminar';
  end if;

  if v_role = 'cliente' and v_guide.client_id is distinct from v_client then
    raise exception 'No tienes permiso para eliminar esta guía';
  elsif v_role not in ('cliente', 'admin', 'coordinador', 'operario') then
    raise exception 'No autorizado';
  end if;

  delete from public.at_guides where id = p_guide_id;
end $$;

revoke execute on function public.at_delete_guide(uuid) from public, anon;
grant execute on function public.at_delete_guide(uuid) to authenticated;
