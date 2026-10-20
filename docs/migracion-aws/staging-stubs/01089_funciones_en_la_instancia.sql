-- Los dos relojes que llaman a edge functions (0111 y 0112) tenían escrita la
-- dirección del proyecto de Supabase Cloud, ya apagado, y su llave anónima.
-- En AWS las funciones corren en el contenedor `functions` de la misma
-- instancia (docker-compose.yml), al que la base llega por la red interna.
--
-- La dirección sale del vault (`at_funciones_url`) si existe, y si no, de la
-- red interna. Así, si las funciones se mudan, se cambia un secreto y no hay
-- que reescribir estas funciones otra vez.
--
-- Se quita la llave anónima de la cabecera: el enrutador autoalojado no valida
-- JWT y lo que protege estas llamadas es la cabecera x-at-cron (migración 0103).
-- El resto del cuerpo es idéntico a 0111 y 0112.

create or replace function public.at_url_funciones()
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'at_funciones_url'),
    'http://functions:9000'
  )
$$;

revoke execute on function public.at_url_funciones() from public, anon, authenticated;

create or replace function public.at_despachar_buzon()
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
set statement_timeout to '10s'
as $$
begin
  update public.at_message_outbox
  set status = 'fallido',
      error  = 'Caducado: se encoló hace más de 12 h y ya no sirve'
  where status = 'pendiente'
    and created_at < now() - interval '12 hours';

  if not exists (
    select 1 from public.at_message_outbox
    where status = 'pendiente'
      and attempts < 3
      and created_at >= now() - interval '12 hours'
  ) then
    return;
  end if;

  perform net.http_post(
    url     := public.at_url_funciones() || '/enviar-mensajes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

revoke execute on function public.at_despachar_buzon() from public, anon, authenticated;

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
    url     := public.at_url_funciones() || '/shopify-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;

revoke execute on function public.at_sincronizar_shopify() from public, anon, authenticated;
