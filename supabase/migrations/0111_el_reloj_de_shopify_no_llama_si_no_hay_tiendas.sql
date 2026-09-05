-- A TIEMPO LOGÍSTICA — el reloj de Shopify deja de llamar a la nada.
--
-- Mismo patrón que la 0109 con el buzón de mensajes, y encontrado midiendo lo
-- mismo: `at-shopify` corre cada quince minutos y llamaba SIEMPRE a la edge
-- function. En los últimos siete días: **672 ejecuciones con CERO tiendas
-- conectadas.** 96 al día, casi 3.000 al mes.
--
-- Cada una levanta una edge function que se conecta a la base, consulta
-- at_shopify_connections, no encuentra nada y se va. No es que fallara —
-- respondía 200 y todo correcto—, es que no había nada que hacer.
--
-- Ahora se pregunta antes, con una consulta que toca una tabla de cero filas.
-- El día que un comercio conecte su tienda, el reloj arranca solo: no hay nada
-- que acordarse de encender.
--
-- El filtro `active` es el MISMO que usa la edge function por dentro para
-- recorrer las tiendas. Tiene que serlo: si aquí dejáramos pasar una tienda que
-- allá se ignora, volveríamos a llamar en balde cada cuarto de hora.

create or replace function public.at_sincronizar_shopify()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
begin
  if not exists (select 1 from public.at_shopify_connections where active) then
    return;
  end if;

  perform net.http_post(
    url     := 'https://uhbtivaepyhwfdvtpfjq.supabase.co/functions/v1/shopify-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- La llave anónima: pública por diseño. Lo que protege esta puerta es la
      -- cabecera de abajo, que se comprueba contra el vault (migración 0103).
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

comment on function public.at_sincronizar_shopify() is
  'Llama a shopify-sync SOLO si hay alguna tienda conectada. Lo usa el cron at-shopify.';

revoke execute on function public.at_sincronizar_shopify() from public, anon, authenticated;

select cron.unschedule('at-shopify')
where exists (select 1 from cron.job where jobname = 'at-shopify');

select cron.schedule('at-shopify', '*/15 * * * *', $$ select public.at_sincronizar_shopify() $$);
