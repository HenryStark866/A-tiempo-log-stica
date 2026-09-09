-- A TIEMPO LOGÍSTICA — el rastreo público lleva de vuelta a la tienda.
--
-- Quien recibe un paquete abre el QR del rótulo, ve dónde va su pedido y se
-- sale. En esa pantalla ya sabe QUIÉN se lo envió —`business_name` lleva ahí
-- desde el principio— pero no tiene por dónde volver a comprarle. El comercio
-- ya guardó sus redes en Mi perfil (migración 0043); solo faltaba que llegaran
-- hasta ahí.
--
-- ── Por qué solo en la ruta del token ─────────────────────────────────────
-- Hay dos rastreos públicos y NO son lo mismo:
--
--   at_track_guide(numero)      → se entra con el número de guía, que es
--                                 consecutivo y por tanto adivinable. Por eso
--                                 NO devuelve `business_name`: quien teclee
--                                 ATL-100008 no tiene por qué enterarse de
--                                 quién le envía a quién.
--   at_track_guide_by_token(t)  → se entra con un token aleatorio que solo
--                                 tiene quien recibió el paquete. Aquí sí se
--                                 dice el comercio.
--
-- Las redes van únicamente en la segunda. Ponerlas en la primera convertiría
-- un contador de números en un directorio de qué comercio le vende a quién.
--
-- ── Qué se expone ─────────────────────────────────────────────────────────
-- Los cuatro enlaces de marketing que el propio comercio escribió para que se
-- vieran, ya validados como URLs completas por `at_update_my_links`. Nada de
-- teléfono, NIT, dirección ni correo: eso sigue sin salir de aquí.
--
-- La firma no cambia y las llaves anteriores siguen todas, así que el
-- frontend anterior no se rompe: simplemente ignora las nuevas.

-- ── Por qué esta migración se llama 0112 y no 0101 ────────────────────────
-- Se escribió como 0101 y el merge con la rama de Henry se la llevó por
-- delante: él ya tenía su propia 0101 (y hasta la 0111). Renumerada al primer
-- hueco libre. Las 0098, 0099 y 0100 quedaron DUPLICADAS en la carpeta tras
-- ese mismo merge; se resolvieron renumerando las nuestras a 0116, 0117 y
-- 0118, porque el CLI indexa cada migración por su versión y dos filas con la
-- misma clave no caben en supabase_migrations.

create or replace function public.at_track_guide_by_token(p_token text)
returns json
language plpgsql volatile security definer set search_path = public
as $function$
declare v_out json;
begin
  perform public.at_limitar('rastreo_token', 120, 3000);

  select json_build_object(
    'guide_number', g.guide_number,
    'status', g.status,
    'recipient_city', g.recipient_city,
    'recipient_name', g.recipient_name,
    'created_at', g.created_at,
    'delivered_at', g.delivered_at,
    'delivery_attempts', g.delivery_attempts,
    'business_name', cl.business_name,
    -- Las redes del comercio, para que quien recibió el paquete pueda volver
    -- a la tienda. Van tal como están guardadas; la pantalla decide cuál
    -- muestra y cómo.
    'business_website',   cl.website_url,
    'business_instagram', cl.instagram_url,
    'business_facebook',  cl.facebook_url,
    'business_tiktok',    cl.tiktok_url,
    'courier_name',        case when g.status = 'en_ruta' then c.full_name end,
    'courier_lat',         case when g.status = 'en_ruta' then c.last_lat end,
    'courier_lng',         case when g.status = 'en_ruta' then c.last_lng end,
    'courier_position_at', case when g.status = 'en_ruta' then c.last_position_at end,
    'events', coalesce((
      select json_agg(json_build_object('status', e.status, 'created_at', e.created_at)
             order by e.created_at)
      from public.at_guide_events e where e.guide_id = g.id
    ), '[]'::json)
  ) into v_out
  from public.at_guides g
  left join public.at_profiles c on c.id = g.courier_id
  left join public.at_clients  cl on cl.id = g.client_id
  where length(coalesce(trim(p_token), '')) >= 12
    and g.tracking_token = trim(p_token);

  return v_out;
end $function$;

comment on function public.at_track_guide_by_token(text) is
  'Rastreo público por token del rótulo. Devuelve el estado del envío, la posición del mensajero mientras va en ruta, y los enlaces públicos del comercio remitente. Los datos del comercio salen solo por esta vía y no por at_track_guide, que se consulta con un número adivinable.';

-- ── Verificación, para correr a mano después del push ──────────────────
-- Con el token de una guía de un comercio que tenga Instagram guardado:
--
--   select public.at_track_guide_by_token('<token de 24 caracteres>')
--          -> 'business_instagram';        -- el enlace
--
-- Y que la otra puerta siga sin decir de quién es el envío:
--
--   select public.at_track_guide('ATL-100008') ? 'business_name';   -- false
