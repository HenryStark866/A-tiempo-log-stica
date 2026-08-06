-- A TIEMPO LOGÍSTICA — los tres pendientes que quedaron anotados en el
-- retrofit anterior, cerrados:
--
--   1. Un comercio ve solo las zonas (y tarifas) de SU CEDI, no las de otro.
--   2. Crear una guía o una recogida valida el CEDI en el momento de
--      insertar, no solo después. Se pudo confirmar con una prueba real
--      —insertar dentro de una transacción con rollback— que el trigger que
--      resuelve facility_id corre ANTES que el WITH CHECK de la política,
--      así que ya no es una suposición: el dato existe a tiempo para
--      validarlo.
--   3. Seguimiento (el mapa en vivo que ve el comercio) ya no mezcla envíos
--      de todos los CEDIs cuando lo mira el personal.

-- ── 1. Zonas: la facility "efectiva" de quien pregunta ──────────────────
-- Para el personal es la de su perfil (como ya existía). Para un comercio,
-- que nunca tiene facility_id en su PERFIL —solo en su comercio—, se
-- resuelve a través de su cliente. Hoy todo comercio y todo perfil de
-- personal resuelven a NULL o al CEDI Principal, así que esto no cambia
-- nada todavía: es la pieza que hacía falta para cuando exista un segundo
-- CEDI con zonas propias.
create or replace function public.at_mi_facility_efectiva()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.at_my_facility(),
    (select facility_id from public.at_clients where id = public.at_my_client())
  )
$$;

revoke execute on function public.at_mi_facility_efectiva() from public, anon;
grant execute on function public.at_mi_facility_efectiva() to authenticated;

create or replace function public.at_puede_ver_facility_efectiva(p_facility_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.at_mi_facility_efectiva() is null or public.at_mi_facility_efectiva() = p_facility_id $$;

revoke execute on function public.at_puede_ver_facility_efectiva(uuid) from public, anon;
grant execute on function public.at_puede_ver_facility_efectiva(uuid) to authenticated;

drop policy if exists "autenticados leen zonas" on public.at_zones;
create policy "autenticados leen zonas" on public.at_zones
  for select to authenticated
  using (at_puede_ver_facility_efectiva(facility_id));

-- ── 2. Crear guía o recogida valida el CEDI desde el insert ──────────────
-- Verificado con una inserción real dentro de una transacción de prueba: el
-- trigger at_guides_set_facility / at_pickups_set_facility ya dejó
-- facility_id puesto para cuando este WITH CHECK lo mira. La rama del
-- comercio no necesita el candado: su guía hereda el CEDI de su propio
-- comercio, así que ya sale correcta sola.
drop policy if exists "staff o cliente crea guías propias" on public.at_guides;
create policy "staff o cliente crea guías propias" on public.at_guides
  for insert to authenticated
  with check (
    (at_is_staff() and at_puede_ver_facility(facility_id))
    or (at_my_role() = 'cliente' and client_id = at_my_client() and status = 'creada')
  );

drop policy if exists "cliente solicita recogida propia" on public.at_pickups;
create policy "cliente solicita recogida propia" on public.at_pickups
  for insert to authenticated
  with check (
    (at_my_role() = 'cliente' and client_id = at_my_client() and status = 'pendiente')
    or (at_is_staff() and at_puede_ver_facility(facility_id))
  );

-- ── 3. Seguimiento: el personal ve solo los envíos de su CEDI ────────────
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
  if v_role = 'cliente' and v_client is null then
    return '[]'::json;
  end if;
  if v_role not in ('cliente','admin','coordinador','operario','admin_cedi') then
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
    where (v_role <> 'cliente' or g.client_id = v_client)
      and (v_role = 'cliente' or v_facility is null or g.facility_id = v_facility)
      and g.status in ('creada','recogida','en_cedi','zonificada','en_ruta','novedad','reprogramada','en_devolucion')
    order by g.created_at desc
    limit 200
  ) t;

  return result;
end $function$;
