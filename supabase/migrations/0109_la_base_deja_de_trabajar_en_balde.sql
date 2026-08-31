-- A TIEMPO LOGÍSTICA — quitarle a la base el trabajo que no sirve para nada.
--
-- Supabase avisó de que el proyecto «está agotando varios recursos». Medido con
-- pg_stat_statements, esto es lo que se encontró y lo que arregla este archivo.
-- Lo que NO arregla —el tiempo real, que es el consumo mayor— está al final.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. EL PANEL RECORRÍA LOS PEDIDOS OCHO VECES PARA PINTAR UNA PANTALLA
-- ══════════════════════════════════════════════════════════════════════════
--
-- at_dashboard_kpis() era la consulta más lenta de la aplicación: 115 ms de
-- media, 1.033 llamadas, 119 segundos de CPU acumulados. Y es la primera
-- pantalla que abre todo el mundo al entrar.
--
-- El motivo: siete subconsultas independientes, cada una con su propio
-- `select ... from at_guides` y todas con el MISMO filtro de comercio y sede.
-- Postgres no las junta solo: recorre la tabla una vez por cada una.
--
-- Ahora se recorre UNA vez y se separan las cuentas con `filter`. Con tres
-- guías no se nota; con cincuenta mil es la diferencia entre que el panel abra
-- y que no.
--
-- Se comprobó contra los datos reales que las dos versiones devuelven un JSON
-- idéntico, carácter por carácter, antes de aplicar esto.

create or replace function public.at_dashboard_kpis()
returns json
language plpgsql
security definer
set search_path to 'public'
set "TimeZone" to 'America/Bogota'
as $function$
declare
  v_client   uuid := public.at_my_client();
  v_facility uuid := public.at_my_facility();
  v_rol      public.at_role := public.at_my_role();
  v_es_cliente boolean := v_rol in ('cliente','asesor');
  result json;
begin
  if not (public.at_is_staff() or coalesce(v_rol in ('cliente','asesor'), false)) then
    raise exception 'No autorizado';
  end if;

  with base as (
    -- El único recorrido. El filtro de comercio y sede se aplica aquí, una vez,
    -- en vez de repetirse en siete subconsultas.
    select
      g.status,
      g.created_at,
      g.delivered_at,
      g.picked_up_at,
      g.is_cod,
      g.cod_amount,
      g.settlement_id,
      g.courier_id,
      g.created_at > now() - interval '30 days' as reciente
    from public.at_guides g
    where (v_client is null or g.client_id = v_client)
      and (v_facility is null or g.facility_id = v_facility)
  )
  select json_build_object(
    'by_status', coalesce(
      (select json_object_agg(s.status, s.n)
       from (select b.status, count(*) n from base b group by b.status) s),
      '{}'::json
    ),
    'guides_today',    count(*) filter (where created_at::date = current_date),
    'delivered_today', count(*) filter (where delivered_at::date = current_date),
    'ltr_hours', round(
      (avg(extract(epoch from (picked_up_at - created_at)) / 3600)
       filter (where picked_up_at is not null and reciente))::numeric, 1),
    'tli_pct', round(
      100.0 * count(*) filter (where reciente and status = 'devuelta')
      / nullif(count(*) filter (where reciente and status in ('entregada','devuelta')), 0), 1),
    'cod_pending', coalesce(
      sum(cod_amount) filter (where is_cod and status = 'entregada' and settlement_id is null), 0),
    'settlements_pending', case when v_es_cliente then 0 else (
      -- Esta es de otra tabla, así que se queda aparte.
      select count(*) from public.at_settlements s
      where s.status in ('pendiente','consignado')
        and (v_facility is null or (
          select p.facility_id from public.at_profiles p where p.id = s.courier_id
        ) = v_facility)
    ) end,
    'active_couriers', count(distinct courier_id)
      filter (where status in ('zonificada','en_ruta') and courier_id is not null)
  ) into result
  from base;

  return result;
end $function$;


-- ══════════════════════════════════════════════════════════════════════════
-- 2. EL RELOJ LLAMABA AL PUENTE CADA MINUTO PARA NO MANDAR NADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `at-enviar-mensajes` corre cada minuto y hacía SIEMPRE una petición HTTP a la
-- edge function, hubiera algo en la cola o no. Llevaba 8.105 llamadas y 146
-- segundos de CPU; y cada una levanta además una edge function que se conecta a
-- la base, mira un buzón vacío y se va.
--
-- Se mantiene el minuto —un código de entrega no puede esperar más— pero ahora
-- primero se pregunta si hay algo. Esa pregunta usa el índice parcial
-- `at_message_outbox_pendientes_idx` y cuesta microsegundos.
--
-- El `attempts < 3` es el MISMO filtro que aplica la edge function por dentro
-- (MAX_INTENTOS). Tiene que ser el mismo: si aquí se dejara pasar un mensaje
-- que allá se ignora, volveríamos a llamar en balde cada minuto para siempre.

create or replace function public.at_despachar_buzon()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
begin
  if not exists (
    select 1 from public.at_message_outbox
    where status = 'pendiente' and attempts < 3
  ) then
    return;
  end if;

  perform net.http_post(
    url     := 'https://uhbtivaepyhwfdvtpfjq.supabase.co/functions/v1/enviar-mensajes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- La llave anónima: es pública por diseño (viaja en el navegador de
      -- cualquiera). Lo que protege esta puerta es la cabecera de abajo.
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

comment on function public.at_despachar_buzon() is
  'Llama a enviar-mensajes SOLO si hay algo pendiente. Lo usa el cron at-enviar-mensajes.';

revoke execute on function public.at_despachar_buzon() from public, anon, authenticated;

select cron.unschedule('at-enviar-mensajes')
where exists (select 1 from cron.job where jobname = 'at-enviar-mensajes');

select cron.schedule('at-enviar-mensajes', '* * * * *', $$ select public.at_despachar_buzon() $$);


-- ══════════════════════════════════════════════════════════════════════════
-- 3. LOS REGISTROS DEL PROPIO RELOJ NO SE BORRABAN NUNCA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `cron.job_run_details` tenía 11.776 filas y 9,3 MB — la SEGUNDA tabla más
-- grande de toda la base, por delante de los destinatarios. pg_cron escribe una
-- fila por ejecución y no borra ninguna: con un trabajo por minuto son 1.440
-- filas al día, para siempre.
--
-- Junto con `net._http_response` (9,5 MB) sumaban 19 MB de los 37 MB de la
-- base: más de la mitad del disco era registro de que las cosas pasaron.
--
-- Siete días es lo que hace falta para investigar un fallo. Lo de antes no se
-- mira nunca.

create or replace function public.at_limpiar_registros_viejos()
returns void
language plpgsql
security definer
set search_path to 'public', 'cron'
as $$
begin
  -- El contador del freno: ventanas de hace más de una hora ya no cuentan.
  delete from public.at_rate_limit where ventana < now() - interval '1 hour';

  -- La bitácora del reloj. Se guarda una semana.
  delete from cron.job_run_details where end_time < now() - interval '7 days';
end $$;

comment on function public.at_limpiar_registros_viejos() is
  'Purga el contador del freno y la bitácora de pg_cron. Lo llama el cron at-limpiar-registros.';

revoke execute on function public.at_limpiar_registros_viejos() from public, anon, authenticated;

select cron.unschedule('at-limpiar-rate-limit')
where exists (select 1 from cron.job where jobname = 'at-limpiar-rate-limit');

select cron.unschedule('at-limpiar-registros')
where exists (select 1 from cron.job where jobname = 'at-limpiar-registros');

select cron.schedule(
  'at-limpiar-registros', '*/10 * * * *',
  $$ select public.at_limpiar_registros_viejos() $$
);


-- ══════════════════════════════════════════════════════════════════════════
-- LO QUE ESTE ARCHIVO NO ARREGLA, Y ES LO MÁS GRANDE
-- ══════════════════════════════════════════════════════════════════════════
--
-- El TIEMPO REAL de Supabase es el 95,5 % del trabajo que hace esta base ahora
-- mismo, con la aplicación prácticamente vacía. Medido: sondea el WAL 1,9 veces
-- por segundo, día y noche, haya alguien conectado o no, y lleva 802.929
-- sondeos y 4.341 segundos de CPU acumulados. Para eso mantiene además 7 de las
-- 23 conexiones y 2 ranuras de réplica.
--
-- A cambio de: UNA suscripción viva, sobre dos tablas que en toda su historia
-- han visto 236 cambios de posición y 244 notificaciones.
--
-- No se toca desde una migración porque apagarlo se NOTA en la pantalla: el
-- mapa dejaría de mover el mensajero al instante y la campana tardaría en
-- sonar. Las dos pantallas ya recargan solas por su cuenta (`setInterval` en
-- mapa/page.tsx y en NotificationsContext.tsx), así que no se pierde ningún
-- dato — se pierde inmediatez. Esa es una decisión de producto, de Henry.
--
-- El día que se decida, es una línea:
--   alter publication supabase_realtime drop table public.at_courier_positions;
--   alter publication supabase_realtime drop table public.at_notifications;
