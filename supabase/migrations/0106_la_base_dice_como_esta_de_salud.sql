-- A TIEMPO LOGÍSTICA — un sitio donde preguntar «¿está bien esto?».
--
-- ── Por qué hace falta ────────────────────────────────────────────────────
-- Los tres fallos silenciosos del 2026-08-27 tenían todos la misma forma: algo
-- llevaba semanas roto y «corría» sin quejarse. El cron de Shopify devolvía 401
-- cada quince minutos, la cola de mensajes se llenaba sin que nadie la vaciara,
-- y el único rastro estaba en net._http_response, que no mira nadie.
--
-- Un panel más no lo arregla: lo que faltaba era un NÚMERO que se pueda
-- consultar desde fuera cada pocos minutos, sin abrir sesión, y que valga rojo
-- cuando algo lleva parado más de lo normal. Eso es esta función; /api/salud la
-- expone y el workflow de vigilancia la interroga.
--
-- ── Qué se enseña y a quién ───────────────────────────────────────────────
-- Sin sesión: SOLO el semáforo y la hora. Ni cuántos mensajes hay en cola ni
-- qué cron falló — eso le dice a un curioso dónde está flojo el sistema y
-- cuándo conviene empujar.
-- Con sesión de staff: el detalle, que es lo que hace falta para arreglarlo.
--
-- Nunca sale un dato de una persona: son cuentas agregadas, sin nombres, sin
-- teléfonos y sin números de guía.

create or replace function public.at_salud()
returns json
language plpgsql
volatile              -- volatile porque at_limitar escribe el contador
security definer
set search_path to 'public', 'cron'
as $$
declare
  v_pendientes    int;
  v_atrasados     int;
  v_fallidos      int;
  v_ultimo_cron   timestamptz;
  v_estado        text;
begin
  -- Generoso: esto lo consulta un vigilante automático, no una persona. Lo
  -- que se corta es el bucle, no el monitoreo.
  perform public.at_limitar('salud', 120, 2000);

  select count(*) into v_pendientes
  from public.at_message_outbox where status = 'pendiente';

  -- El cron vacía la cola cada minuto. Un mensaje pendiente de hace un cuarto
  -- de hora significa que el reloj no está corriendo o que el envío falla —
  -- que es exactamente el fallo que estuvo meses sin verse.
  select count(*) into v_atrasados
  from public.at_message_outbox
  where status = 'pendiente' and created_at < now() - interval '15 minutes';

  select count(*), max(start_time) into v_fallidos, v_ultimo_cron
  from cron.job_run_details
  where start_time > now() - interval '1 hour' and status <> 'succeeded';

  if v_ultimo_cron is null then
    select max(start_time) into v_ultimo_cron from cron.job_run_details;
  end if;

  v_estado := case
    when v_atrasados > 0 or v_fallidos > 0 then 'degradado'
    else 'ok'
  end;

  -- Sin sesión de staff, el semáforo y nada más.
  if not public.at_is_staff() then
    return json_build_object('estado', v_estado, 'ahora', now());
  end if;

  return json_build_object(
    'estado',           v_estado,
    'ahora',            now(),
    'buzon_pendiente',  v_pendientes,
    'buzon_atrasado',   v_atrasados,
    'crons_fallidos',   v_fallidos,
    'ultimo_cron',      v_ultimo_cron
  );
end $$;

comment on function public.at_salud() is
  'Semáforo de la operación. Sin sesión devuelve solo estado y hora; con sesión de staff, el detalle.';

-- Anon a propósito: un vigilante externo tiene que poder preguntar sin
-- credenciales, y eso es justamente lo que lo hace útil a las 3 de la mañana.
-- Lo que ve sin sesión no le sirve a nadie para nada más.
grant execute on function public.at_salud() to anon, authenticated, service_role;


-- ── Las cinco tablas con RLS y sin políticas ──────────────────────────────
--
-- El linter de Supabase las marca en INFO («RLS enabled, no policy») y hay que
-- mirarlas una por una, porque el mismo síntoma puede ser lo correcto o un
-- olvido grave. Aquí las cinco están cerradas A PROPÓSITO: nadie las toca por
-- la API REST; se escriben y se leen solo desde funciones SECURITY DEFINER que
-- comprueban el rol por dentro.
--
-- Se deja escrito en la propia base, y no solo en un documento, porque el
-- linter se va a volver a quejar dentro de tres meses y quien lo lea entonces
-- tiene que poder saber en diez segundos si esto está bien o mal. Un
-- `comment on table` viaja con la tabla; un documento no.

comment on table public.at_delivery_codes is
  'Códigos de entrega. RLS activo y SIN políticas a propósito: el código prueba quién recibió el paquete, así que nadie lo lee por la API. Solo lo tocan funciones SECURITY DEFINER (at_confirm_pickup, at_delivery_code_whatsapp).';

comment on table public.at_pending_action_state is
  'Estado de acciones a medias. RLS activo y SIN políticas a propósito: es memoria interna del flujo, no un dato del negocio. Solo lo tocan funciones SECURITY DEFINER.';

comment on table public.at_shopify_connections is
  'Tiendas conectadas, CON EL TOKEN DE ADMIN de cada Shopify. RLS activo y SIN políticas a propósito, y aquí es lo más importante de las cinco: ese token lee los pedidos y los datos personales de toda la tienda. Solo lo lee la edge function shopify-sync, con service_role.';

comment on table public.at_survey_snooze is
  'A quién no se le vuelve a preguntar y hasta cuándo. RLS activo y SIN políticas a propósito: se escribe desde la función que aplaza la encuesta.';

comment on table public.at_rate_limit is
  'Contador de peticiones por ventana. Lo llena at_limitar; se purga solo con el cron at-limpiar-rate-limit. RLS activo y SIN políticas a propósito: nadie la toca por la API.';
