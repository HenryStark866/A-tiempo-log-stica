-- A TIEMPO LOGÍSTICA — rastreo por token y ubicación en vivo para el comprador.
--
-- QUÉ FALTABA: el comprador ve el estado de su paquete, pero no dónde va. La
-- posición del mensajero ya se guarda (at_report_position, 0014) y el comercio
-- la ve en Seguimiento; al comprador no le llega.
--
-- POR QUÉ NO BASTA CON AGREGARLA A at_track_guide: esa función busca por
-- número de guía, y los números son CONSECUTIVOS (ATL-100015, ATL-100016…).
-- Hoy eso solo expone estado e historial, que es poca cosa. Pero publicar ahí
-- la ubicación en vivo dejaría que cualquiera recorriera la secuencia y
-- siguiera a los mensajeros por la ciudad en tiempo real, todo el día. Es el
-- mismo problema que ya se había resuelto para el QR de pago con payment_token.
--
-- SOLUCIÓN: un token aleatorio por guía. El QR del rótulo apunta al token, así
-- que la ubicación solo la ve quien tiene el paquete en la mano. La búsqueda
-- por número sigue existiendo para quien solo recuerda su guía, pero sin
-- ubicación: estado e historial, como hasta ahora.
--
-- Se hace ahora porque todavía no se ha impreso ningún rótulo. Cambiar la URL
-- del QR después obligaría a reimprimir lo que ya está pegado a las cajas.

-- ── 1. Token de rastreo ────────────────────────────────────────────────
alter table public.at_guides
  add column if not exists tracking_token text;

update public.at_guides
set tracking_token = encode(extensions.gen_random_bytes(12), 'hex')
where tracking_token is null;

alter table public.at_guides
  alter column tracking_token set default encode(extensions.gen_random_bytes(12), 'hex');

alter table public.at_guides
  alter column tracking_token set not null;

create unique index if not exists at_guides_tracking_token_idx
  on public.at_guides (tracking_token);

comment on column public.at_guides.tracking_token is
  'Token del QR de rastreo. No se deriva del número de guía porque ese es consecutivo, y con la ubicación en vivo expuesta eso permitiría seguir mensajeros a voluntad.';

-- ── 2. Rastreo con ubicación, solo para quien tiene el token ───────────
create or replace function public.at_track_guide_by_token(p_token text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'guide_number', g.guide_number,
    'status', g.status,
    'recipient_city', g.recipient_city,
    'recipient_name', g.recipient_name,
    'created_at', g.created_at,
    'delivered_at', g.delivered_at,
    'delivery_attempts', g.delivery_attempts,
    'business_name', cl.business_name,
    -- La posición solo mientras va en la calle. Antes de salir no dice nada
    -- útil (está en el CEDI) y después de entregar sería seguir al mensajero
    -- sin motivo.
    'courier_name',        case when g.status = 'en_ruta' then c.full_name end,
    'courier_lat',         case when g.status = 'en_ruta' then c.last_lat end,
    'courier_lng',         case when g.status = 'en_ruta' then c.last_lng end,
    'courier_position_at', case when g.status = 'en_ruta' then c.last_position_at end,
    'events', coalesce((
      select json_agg(json_build_object('status', e.status, 'created_at', e.created_at)
             order by e.created_at)
      from public.at_guide_events e where e.guide_id = g.id
    ), '[]'::json)
  )
  from public.at_guides g
  left join public.at_profiles c on c.id = g.courier_id
  left join public.at_clients  cl on cl.id = g.client_id
  -- Longitud mínima: corta de raíz que alguien pruebe tokens cortos a ver si
  -- pega. Mismo guardia que usa at_payment_info.
  where length(coalesce(trim(p_token), '')) >= 12
    and g.tracking_token = trim(p_token)
$$;

grant execute on function public.at_track_guide_by_token(text) to anon, authenticated;

-- ── 3. Datos del rótulo, para imprimir sin exponer la tabla ────────────
-- El comercio ya puede leer sus guías por RLS, pero el rótulo necesita además
-- el nombre del comercio y la zona en una sola consulta.
create or replace function public.at_label_data(p_ids uuid[])
returns json
language sql stable security definer set search_path = public
as $$
  select coalesce(json_agg(t order by t.guide_number), '[]'::json)
  from (
    select g.id, g.guide_number, g.tracking_token, g.payment_token,
           g.recipient_name, g.recipient_phone, g.recipient_address,
           g.recipient_city, g.is_cod, g.cod_amount, g.notes, g.created_at,
           cl.business_name, cl.phone as business_phone,
           z.name as zone_name
    from public.at_guides g
    join public.at_clients cl on cl.id = g.client_id
    left join public.at_zones z on z.id = g.zone_id
    where g.id = any(p_ids)
      -- Mismo alcance que ve en pantalla: el comercio solo sus guías.
      and (public.at_is_staff() or g.client_id = public.at_my_client())
    limit 200
  ) t
$$;

revoke execute on function public.at_label_data(uuid[]) from public, anon;
grant execute on function public.at_label_data(uuid[]) to authenticated;
