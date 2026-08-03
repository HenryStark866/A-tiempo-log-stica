-- A TIEMPO LOGÍSTICA — nombre del comercio en el seguimiento en vivo
--
-- at_my_shipments no traía el comercio de cada guía. Para staff (admin,
-- coordinador, operario) que ven el seguimiento de TODOS los comercios a la
-- vez, no había con qué filtrar por cliente en la pantalla. Para el rol
-- cliente el campo es siempre el mismo comercio, así que no cambia nada.

create or replace function public.at_my_shipments()
returns json
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_client uuid := public.at_my_client();
  v_role public.at_role := public.at_my_role();
  result json;
begin
  if v_role is null then raise exception 'No autorizado'; end if;
  if v_role = 'cliente' and v_client is null then
    return '[]'::json;
  end if;
  if v_role not in ('cliente','admin','coordinador','operario') then
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
      and g.status in ('creada','recogida','en_cedi','zonificada','en_ruta','novedad','reprogramada','en_devolucion')
    order by g.created_at desc
    limit 200
  ) t;

  return result;
end $function$;
