-- ══════════════════════════════════════════════════════════════════════════
-- EL BUZÓN NO SE ATASCA — Y SI SE ATASCA, NO TUMBA LA BASE
-- ══════════════════════════════════════════════════════════════════════════
--
-- El 2026-09-08, de 14:04 a ~18:50 (hora de Bogotá), la base de producción se
-- volvió inalcanzable: 504 MIDDLEWARE_INVOCATION_TIMEOUT en TODA la app, porque
-- `src/middleware.ts` llama a Supabase en cada request y la base no aceptaba
-- conexiones. Hubo que reiniciarla a mano desde el panel.
--
-- La cadena, de la punta al origen:
--
--   1. Un código de entrega del pedido ATL-100184 se encoló el 2026-09-07 a las
--      15:31 y NUNCA salió: hoy no hay ningún canal configurado —ni el puente
--      OpenWA ni Twilio— (ver docs/LO-QUE-FALTA.md). La edge function
--      `enviar-mensajes`, al no tener credenciales, responde 200 y se va ANTES
--      de llegar al barrido que archiva lo caducado. El mensaje quedó
--      `pendiente` para siempre.
--
--   2. `at_despachar_buzon()` decide si hay trabajo con
--      `status='pendiente' AND attempts<3`. Ese mensaje cumple las dos
--      condiciones indefinidamente (attempts nunca sube porque nunca hay un
--      intento real), así que la función disparaba un `net.http_post` a la edge
--      function CADA MINUTO, para siempre, sin que sirviera de nada.
--
--   3. La instancia es `t4g.nano`: 0,5 GB de RAM, `max_worker_processes = 6`,
--      CPU por créditos de ráfaga. Dos de esos seis workers son fijos (el
--      lanzador de pg_cron y el worker de pg_net); quedan cuatro para todo lo
--      demás. El goteo del punto 2, sumado a lo normal, agotó los créditos de
--      CPU; al throttlearse, `at_despachar_buzon` dejó de terminar en menos de
--      un minuto; las ejecuciones se apilaron ocupando los cuatro slots; y a
--      partir de ahí pg_cron no pudo arrancar NINGÚN trabajo
--      («job startup timeout» ×266 en 12 h) y el postmaster no pudo aceptar
--      conexiones nuevas. Base caída.
--
-- Este archivo cierra el punto 2 para que no pueda repetirse. El punto 1 se
-- arregla en la edge function (barrido de caducados ANTES del early-return por
-- falta de credenciales). El punto 3 es la instancia: `t4g.nano` es demasiado
-- pequeña para pg_cron + pg_net + PostgREST + GoTrue + Storage + la app —
-- subirla de tamaño es una decisión de coste, aparte de esto.

-- ── 1. Sacar de la cola lo que lleva días atascado ────────────────────────
-- Son códigos de entrega de paquetes que ya están en casa. Mandarlos ahora no
-- ayuda: confunde.
update public.at_message_outbox
set status = 'fallido',
    error  = 'Sin canal de envío configurado; caducado en el incidente 2026-09-08'
where status = 'pendiente'
  and created_at < now() - interval '12 hours';

-- ── 2. at_despachar_buzon se cura sola ────────────────────────────────────
-- Antes de decidir si despacha, archiva lo caducado. Aunque la edge function
-- nunca llegue a hacerlo (porque no tiene credenciales y sale antes), la cola
-- se vacía sola en 12 h como máximo, y la función vuelve a ser un no-op de
-- microsegundos.
--
-- Y un `statement_timeout` de 10 s a nivel de función: si algún día vuelve a ir
-- lenta, se corta ella sola en vez de quedarse ocupando un worker durante
-- minutos y arrastrar a los demás. Diez segundos es cien veces lo que tarda
-- cuando la base está sana.
create or replace function public.at_despachar_buzon()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
set statement_timeout to '10s'
as $$
begin
  -- Lo viejo no se manda: se archiva. Esto es lo que `enviar-mensajes` debería
  -- hacer siempre y no hace cuando le faltan credenciales.
  update public.at_message_outbox
  set status = 'fallido',
      error  = 'Caducado: se encoló hace más de 12 h y ya no sirve'
  where status = 'pendiente'
    and created_at < now() - interval '12 hours';

  -- ¿Queda algo FRESCO por despachar? El filtro de 12 h es el mismo de arriba:
  -- si aquí dejáramos pasar un mensaje que allá se archiva, volveríamos a
  -- llamar en balde cada dos minutos para siempre — que es justo el bug.
  if not exists (
    select 1 from public.at_message_outbox
    where status = 'pendiente'
      and attempts < 3
      and created_at >= now() - interval '12 hours'
  ) then
    return;
  end if;

  perform net.http_post(
    url     := 'https://uhbtivaepyhwfdvtpfjq.supabase.co/functions/v1/enviar-mensajes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- La llave anónima: pública por diseño (viaja en el navegador de
      -- cualquiera). Lo que protege esta puerta es la cabecera de abajo.
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

comment on function public.at_despachar_buzon() is
  'Archiva los mensajes caducados (>12 h) y, solo si queda algo fresco, llama a enviar-mensajes. Lo usa el cron at-enviar-mensajes. statement_timeout de 10 s para que una ejecución lenta no pueda apilar workers (incidente 2026-09-08).';

revoke execute on function public.at_despachar_buzon() from public, anon, authenticated;

-- ── 3. De cada minuto a cada dos ──────────────────────────────────────────
-- Un código de entrega sigue llegando mucho antes de que el mensajero toque la
-- puerta. Cada dos minutos deja el doble de margen en una instancia que ya
-- demostró no tener ninguno.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'at-enviar-mensajes'),
  schedule => '*/2 * * * *'
);
