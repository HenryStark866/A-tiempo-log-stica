-- ═══════════════════════════════════════════════════════════════════════════
-- EL RELOJ QUE VACÍA EL BUZÓN DE MENSAJES
--
-- `at_confirm_pickup` ya encolaba el código de entrega en `at_message_outbox`
-- al marcar el paquete como recogido. Lo que faltaba era alguien que vaciara
-- esa cola: sin esto los mensajes se acumulan y no sale ninguno.
--
-- La migración 0038 dejó pg_cron y pg_net instalados y el trabajo SIN
-- programar, a propósito y con razón: ni Twilio ni la Cloud API de Meta mandan
-- el primer mensaje gratis —la ventana sin costo solo se abre si el cliente
-- escribe primero—, así que el envío se hacía a mano.
--
-- Esa razón ya no aplica. El puente propio usa una sesión de WhatsApp de
-- verdad: escribe primero, sin plantilla aprobada y sin coste por mensaje.
--
-- Cada minuto y no cada quince: el código tiene que llegarle al destinatario
-- ANTES de que el mensajero toque su puerta, y entre que se recoge el paquete
-- y se entrega puede haber poco trecho.
--
-- La cabecera `x-at-cron` no es decoración: desde hoy la función responde 401
-- a quien no la traiga. Sin ella, con `verify_jwt`, bastaba la llave anónima
-- —la que viaja en el navegador de cualquiera— para forzar el vaciado en bucle.
-- El secreto sale del vault, igual que en el cron de Shopify.
--
-- OJO: hace falta que `AT_CRON_SECRET` esté puesto en los secrets de Edge
-- Functions con el MISMO valor que el vault. Si falta, esto responde 401 cada
-- minuto — que es justo lo que llevaba pasándole al cron de Shopify.
-- ═══════════════════════════════════════════════════════════════════════════

select cron.unschedule('at-enviar-mensajes')
where exists (select 1 from cron.job where jobname = 'at-enviar-mensajes');

select cron.schedule(
  'at-enviar-mensajes',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://uhbtivaepyhwfdvtpfjq.supabase.co/functions/v1/enviar-mensajes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
