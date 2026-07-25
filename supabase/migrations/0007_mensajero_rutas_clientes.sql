-- A TIEMPO LOGÍSTICA — el mensajero puede crear rutas y clientes
--
-- El mensajero deja de ser un rol puramente de ejecución: ahora también puede
-- zonificar/armar rutas (Fase 3) y dar de alta comercios aliados que consigue en
-- calle. Sigue SIN poder editar tarifas ni desactivar clientes existentes: eso
-- es de ops (admin/coordinador), porque impacta facturación.

-- ── Clientes: el mensajero puede crear, no editar ────────────────────────
-- Las políticas permisivas se suman (OR) a "ops administra clientes".
drop policy if exists "mensajero crea clientes" on public.at_clients;

create policy "mensajero crea clientes" on public.at_clients
  for insert to authenticated
  with check (public.at_my_role() = 'mensajero');

-- ── Ruteo: el mensajero puede zonificar y cargar guías a un mensajero ────
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
  -- Ops, operario y mensajero pueden armar ruta (el cliente nunca).
  if not (public.at_is_ops() or public.at_my_role() in ('operario','mensajero')) then
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

revoke execute on function public.at_assign_courier(uuid, uuid, uuid) from anon;
