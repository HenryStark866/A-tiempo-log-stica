-- ═══════════════════════════════════════════════════════════════════════════
-- 1) EL RÓTULO LLEVA LA MARCA DEL COMERCIO
--
-- El rótulo es lo único del envío que el comprador ve antes de abrir la caja,
-- y hasta ahora solo decía el nombre del comercio en texto. El logo ya estaba
-- cargado (at_clients.logo_url, bucket público at-brand-logos) y se usaba en
-- la vitrina, pero no viajaba pegado al paquete.
-- ═══════════════════════════════════════════════════════════════════════════
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
           z.name as zone_name
    from public.at_guides g
    join public.at_clients cl on cl.id = g.client_id
    left join public.at_zones z on z.id = g.zone_id
    where g.id = any(p_ids)
      and (public.at_is_staff() or g.client_id = public.at_my_client())
    limit 200
  ) t
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) CONTRAENTREGA SIN VALOR NO EXISTE
--
-- Un pedido marcado como contraentrega con cod_amount en cero es un mensajero
-- que llega, entrega y no cobra: la plata no se pierde en una cuenta, se
-- pierde en la calle y no hay cómo recuperarla. La pantalla ya pedía el campo,
-- pero un cero pasaba la validación del navegador tan campante, y ni Shopify
-- ni ningún script futuro pasan por esa pantalla.
--
-- Se comprobó que no hubiera ninguna fila que lo incumpliera antes de exigirlo.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.at_guides drop constraint if exists at_guides_cod_con_valor;
alter table public.at_guides add constraint at_guides_cod_con_valor
  check (not is_cod or cod_amount > 0);
