-- A TIEMPO LOGÍSTICA — pg_cron y pg_net disponibles en la base.
--
-- Se instalaron para que un cron llamara sola a la función enviar-mensajes
-- cada minuto. Ese camino quedó aparcado: ningún proveedor manda el primer
-- mensaje gratis —ni Twilio ni la Cloud API de Meta, donde la ventana de
-- servicio sin costo solo se abre si el cliente escribe primero— y el envío
-- pasó a hacerse a mano por WhatsApp (ver 0040).
--
-- Las extensiones se quedan puestas: no cuestan nada, no tocan nada de lo que
-- ya existe en esta base compartida, y el día que haya presupuesto para un
-- proveedor basta con programar el trabajo. La receta está en la cabecera de
-- supabase/functions/enviar-mensajes/index.ts.

create extension if not exists pg_cron;
create extension if not exists pg_net;
