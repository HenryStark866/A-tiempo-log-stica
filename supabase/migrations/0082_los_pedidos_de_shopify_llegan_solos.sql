-- A TIEMPO LOGÍSTICA — los pedidos de Shopify entran solos, cada 15 minutos.
--
-- La pantalla de Mi comercio dice «se sincroniza sola» desde que se escribió, y
-- no era cierto: había un botón que alguien tenía que acordarse de apretar. Peor
-- todavía ahora que los asesores son quienes gestionan los domicilios, porque
-- ese botón vive en Mi comercio — una pantalla que el asesor no tiene en su
-- menú, llamando a una función que además le respondía 403 por no ser el dueño.
--
-- El resultado era que una venta hecha en Shopify a las 9 de la mañana podía
-- quedarse sin despachar hasta que el dueño entrara por la tarde.

-- ── Avisar a quien tiene que despachar ────────────────────────────────────
-- Sin esto los pedidos «llegan solos» pero nadie se entera de que llegaron,
-- que para el caso es lo mismo que no haberlos traído.
--
-- Se avisa al dueño Y a sus asesores activos: el dueño porque es su negocio, y
-- los asesores porque son quienes van a mover esos paquetes.
create or replace function public.at_avisar_pedidos_de_shopify(
  p_client_id uuid,
  p_creadas   int
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(p_creadas, 0) <= 0 then return; end if;

  insert into public.at_notifications (user_id, title, body, link)
  select p.id,
         case when p_creadas = 1
              then 'Llegó un pedido de tu tienda'
              else 'Llegaron ' || p_creadas || ' pedidos de tu tienda' end,
         case when p_creadas = 1
              then 'Entró solo desde Shopify y ya está listo para incluir en una recogida.'
              else 'Entraron solos desde Shopify y ya están listos para incluir en una recogida.' end,
         '/pedidos'
  from public.at_profiles p
  where p.client_id = p_client_id
    and p.role in ('cliente','asesor')
    and p.active;
end $$;

comment on function public.at_avisar_pedidos_de_shopify(uuid, int) is
  'Avisa al dueño y a sus asesores que entraron pedidos nuevos desde Shopify.';

-- Solo la llama la edge function con la clave de servicio. Que nadie la use
-- desde el navegador para inventarle avisos a otro comercio.
revoke execute on function public.at_avisar_pedidos_de_shopify(uuid, int) from public, anon, authenticated;

-- ── El secreto del reloj ──────────────────────────────────────────────────
-- Se genera aquí y NO se escribe en este archivo: el repositorio no debe
-- llevar secretos. Queda en Vault, que es lo único que lo lee.
--
-- La cabecera Authorization va con la llave ANÓNIMA, que es pública y ya viaja
-- en el bundle del navegador: solo sirve para pasar el verify_jwt de la puerta
-- de Supabase. Quien autoriza de verdad es x-at-cron contra este secreto, que
-- la función compara con su propia variable de entorno AT_CRON_SECRET.
--
-- Si esa variable no está puesta en el panel, la función RECHAZA la puerta del
-- cron. Vale más que la sincronización automática no arranque a dejar abierto
-- un endpoint que le sincroniza la tienda a cualquiera.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'at_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'at_cron_secret',
      'Cabecera x-at-cron con la que el reloj se identifica ante las edge functions.'
    );
  end if;
end $$;

-- ── Cada 15 minutos ───────────────────────────────────────────────────────
-- Por qué 15 y no 5: son 96 llamadas al día por tienda contra las de Shopify,
-- que tiene tope de peticiones. Y por qué no cada hora: un pedido que se queda
-- una hora quieto es una entrega que se corre al día siguiente.
select cron.unschedule('at-shopify')
where exists (select 1 from cron.job where jobname = 'at-shopify');

select cron.schedule(
  'at-shopify',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://uhbtivaepyhwfdvtpfjq.supabase.co/functions/v1/shopify-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYnRpdmFlcHlod2ZkdnRwZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODU0MTMsImV4cCI6MjA4OTg2MTQxM30.YaJzau2pASUSLmL7OVwqqTnp5M9Q6s3lQsXCbGw_W5M',
      'x-at-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'at_cron_secret')
    ),
    body    := '{}'::jsonb,
    -- Generoso a propósito: recorre TODAS las tiendas conectadas en una sola
    -- llamada, y cada una habla con un servidor de Shopify que puede tardar.
    timeout_milliseconds := 120000
  );
  $cron$
);
