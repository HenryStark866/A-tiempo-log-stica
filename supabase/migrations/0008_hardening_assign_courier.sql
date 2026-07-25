-- A TIEMPO LOGÍSTICA — cierre de dos huecos en at_assign_courier
--
-- 1) El guard `if not (at_is_ops() or at_my_role() = 'x')` evalúa a NULL cuando
--    at_my_role() es NULL (sesión anónima), y un `if NULL then` NO entra a la
--    rama: el 'No autorizado' nunca se disparaba. Se pasa a un guard explícito
--    sobre una variable, con `is null` de por medio.
-- 2) `revoke execute ... from anon` (migración 0004) no tiene efecto mientras
--    PUBLIC conserve el EXECUTE que Postgres otorga por defecto al crear la
--    función: anon lo hereda igual. Hay que revocar de PUBLIC y otorgar
--    explícitamente solo a authenticated.

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
  v_role public.at_role := public.at_my_role();
begin
  -- Ops, operario y mensajero pueden armar ruta (el cliente y anon nunca).
  if v_role is null or v_role not in ('admin','coordinador','operario','mensajero') then
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

revoke execute on function public.at_assign_courier(uuid, uuid, uuid) from public, anon;
grant execute on function public.at_assign_courier(uuid, uuid, uuid) to authenticated;
