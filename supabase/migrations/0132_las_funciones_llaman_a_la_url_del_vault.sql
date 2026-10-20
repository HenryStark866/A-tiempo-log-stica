-- Producción dejó de llamar a Supabase y toma la URL de las edge functions del
-- vault (secreto `at_funciones_url`). El cambio se hizo a mano en la instancia;
-- esta migración lo trae al repo para que el esquema local sea el de producción.
-- Sin el secreto, la URL cae a la de las funciones locales.

create or replace function public.at_url_funciones()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'at_funciones_url'),
    'http://functions:9000'
  )
$function$
;

create or replace function public.at_despachar_buzon()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net'
 SET statement_timeout TO '10s'
AS $function$
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
end $function$
;

create or replace function public.at_sincronizar_shopify()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net'
AS $function$
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
end $function$
;

revoke all on function public.at_url_funciones() from public, anon, authenticated;
grant execute on function public.at_url_funciones() to service_role;
