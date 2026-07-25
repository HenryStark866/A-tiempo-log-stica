-- A TIEMPO LOGÍSTICA — at_request_pickup también para staff
--
-- La primera versión tomaba el comercio de at_my_client(), que es NULL para
-- admin/coordinador/operario: el staff no podía solicitar una recogida en nombre
-- de un comercio. Ahora recibe p_client_id, pero el cliente NO puede usarlo para
-- suplantar a otro: si el rol es cliente se ignora y se fuerza su propio comercio.

drop function if exists public.at_request_pickup(date, time, text, text, text, text, uuid[]);

create or replace function public.at_request_pickup(
  p_client_id      uuid    default null,
  p_scheduled_date date    default null,
  p_scheduled_time time    default null,
  p_address        text    default null,
  p_contact_name   text    default null,
  p_contact_phone  text    default null,
  p_notes          text    default null,
  p_guide_ids      uuid[]  default '{}'
)
returns public.at_pickups
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.at_role := public.at_my_role();
  v_client uuid;
  v_pickup public.at_pickups;
  v_address text;
  v_ajenas int;
begin
  if v_role is null or v_role in ('pendiente','mensajero') then
    raise exception 'No autorizado';
  end if;

  -- El cliente solo puede solicitar para su propio comercio, pase lo que pase.
  if v_role = 'cliente' then
    v_client := public.at_my_client();
    if v_client is null then
      raise exception 'Tu cuenta todavía no tiene comercio';
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
end $$;

revoke execute on function public.at_request_pickup(uuid, date, time, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.at_request_pickup(uuid, date, time, text, text, text, text, uuid[]) to authenticated;
