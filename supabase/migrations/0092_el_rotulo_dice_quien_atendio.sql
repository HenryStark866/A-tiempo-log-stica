-- A TIEMPO LOGÍSTICA — el rótulo dice qué asesor atendió el pedido.
--
-- ── Por qué ────────────────────────────────────────────────────────────────
--
-- at_guides.created_by ya guarda quién creó el pedido desde 0001, y ya se usa
-- para contar cuántos pedidos lleva cada asesor (0074). Pero esa información
-- nunca llegaba al rótulo: el mensajero y el comprador solo veían el nombre
-- del comercio, no quién de adentro atendió la venta.
--
-- En un comercio con varios asesores eso importa para el reclamo del día
-- siguiente («¿quién me vendió esto?») y para que el dueño identifique de un
-- vistazo, sin abrir el pedido, quién lo despachó.
--
-- Se muestra SOLO cuando quien creó el pedido es un asesor. Si lo creó el
-- dueño, el rótulo ya dice el nombre del comercio en «Remite» — repetirlo como
-- «Atendido por» no añade nada. Y si vino de Shopify o de la cola sin señal,
-- created_by puede ser nulo: tampoco hay nadie que nombrar.
create or replace function public.at_label_data(p_ids uuid[])
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(json_agg(t order by t.guide_number), '[]'::json)
  from (
    select g.id, g.guide_number, g.tracking_token, g.payment_token,
           g.recipient_name, g.recipient_phone, g.recipient_address,
           g.recipient_city, g.is_cod, g.cod_amount, g.notes, g.created_at,
           cl.business_name, cl.phone as business_phone,
           cl.logo_url as business_logo,
           z.name as zone_name,
           nullif(trim(asesor.full_name), '') as advisor_name
    from public.at_guides g
    join public.at_clients cl on cl.id = g.client_id
    left join public.at_zones z on z.id = g.zone_id
    left join public.at_profiles asesor
      on asesor.id = g.created_by and asesor.role = 'asesor'
    where g.id = any(p_ids)
      and (public.at_is_staff() or g.client_id = public.at_my_client())
    limit 200
  ) t
$function$;

comment on function public.at_label_data(uuid[]) is
  'Datos para imprimir el rótulo de una o varias guías, con el logo del comercio y, si quien la creó fue un asesor, su nombre.';


-- ── Comprobación ──────────────────────────────────────────────────────────
do $$
begin
  assert (
    select count(*) from pg_proc
    where proname = 'at_label_data'
      and pronamespace = 'public'::regnamespace
  ) = 1, 'la función no quedó';
end $$;
