-- A TIEMPO LOGÍSTICA — El domicilio se cobra según la matriz de tarifa (zona de origen y zona de destino)
-- Si no hay zona de destino o par registrado, usa la tarifa por defecto de la zona de destino.
-- El parámetro delivery_rate a nivel de comercio queda solo como fallback extremo si tampoco hay zona de destino.

create or replace function public.at_precio_domicilio(p_client_id uuid, p_dest_zone_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- 1. Matriz por par de zonas (origen del comercio -> destino de la guía)
    (select r.delivery_rate
     from public.at_zone_pair_rates r
     where r.origin_zone_id = (select zone_id from public.at_clients where id = p_client_id)
       and r.dest_zone_id = p_dest_zone_id),
    -- 2. Si no hay tarifa registrada para la combinación, se cobra el domicilio estándar de la zona de destino
    (select z.delivery_rate from public.at_zones z where z.id = p_dest_zone_id),
    -- 3. Caso extremo sin zona de destino reconocida: tarifa fallback de la cuenta
    (select c.delivery_rate from public.at_clients c where c.id = p_client_id),
    0
  )
$$;

revoke execute on function public.at_precio_domicilio(uuid, uuid) from public, anon;
grant execute on function public.at_precio_domicilio(uuid, uuid) to authenticated;
