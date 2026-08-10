-- Retrato del proyecto, para comparar el nuevo contra el viejo.
--
-- Se ejecuta en el editor SQL de CUALQUIERA de los dos proyectos y devuelve
-- una sola fila con todo. La reconstrucción está bien cuando el nuevo da
-- exactamente lo mismo que el viejo.
--
-- Mirar la app «a ver si se ve bien» no sirve para esto: una política de RLS
-- que no se copió no se nota hasta que un comercio ve los pedidos de otro, y
-- un trigger que faltó no se nota hasta que una factura no se genera. Eso no
-- sale en una pantalla; sale en un conteo.

select jsonb_pretty(jsonb_build_object(
  'tablas',        (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relkind='r'),
  'funciones',     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public'),
  'politicas',     (select count(*) from pg_policies where schemaname in ('public','storage')),
  'triggers',      (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                    join pg_namespace n on n.oid=c.relnamespace
                    where not t.tgisinternal and n.nspname in ('public','auth')),
  'indices',       (select count(*) from pg_indexes where schemaname='public'),
  'enums',         (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
                    where n.nspname='public' and t.typtype='e'),
  'extensiones',   (select jsonb_agg(extname order by extname) from pg_extension),
  'cron',          (select jsonb_agg(jobname order by jobname) from cron.job),
  'buckets',       (select jsonb_agg(id order by id) from storage.buckets),
  'archivos',      (select count(*) from storage.objects),
  'usuarios_auth', (select count(*) from auth.users),
  'datos', jsonb_build_object(
     'comercios',     (select count(*) from public.at_clients),
     'perfiles',      (select count(*) from public.at_profiles),
     'pedidos',       (select count(*) from public.at_guides),
     'eventos',       (select count(*) from public.at_guide_events),
     'recogidas',     (select count(*) from public.at_pickups),
     'facturas',      (select count(*) from public.at_invoices),
     'remesas',       (select count(*) from public.at_cod_remittances),
     'zonas',         (select count(*) from public.at_zones),
     'tarifas_par',   (select count(*) from public.at_zone_pair_rates),
     'productos',     (select count(*) from public.at_products),
     'destinatarios', (select count(*) from public.at_recipients))
)) as retrato;

-- ── El retrato del proyecto VIEJO, tomado el 2026-08-09 ──────────────────
--
--   tablas         28        cron           at-limpiar-rate-limit,
--   funciones     111                       at-notificar-pendientes
--   politicas      55        buckets        at-brand-logos, at-courier-docs,
--   triggers       15                       at-delivery-evidence,
--   indices        77                       at-facility-docs,
--   enums          12                       at-payment-receipts, evidencias
--   archivos       39        usuarios_auth  15
--
--   extensiones    pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql,
--                  supabase_vault, uuid-ossp
--
--   datos          comercios 9 · perfiles 15 · pedidos 28 · eventos 135 ·
--                  recogidas 14 · facturas 7 · remesas 4 · zonas 5 ·
--                  tarifas_par 25 · productos 12 · destinatarios 22
--
-- Dos diferencias son ESPERABLES y no son un fallo:
--
--   · `evidencias` no debería aparecer entre los buckets del nuevo. Es el que
--     quedó de la app de monitoreo industrial y ya no lo usa nadie; el script
--     de copia lo recrea vacío, así que si sobra, se borra desde el panel.
--   · `at_rate_limit` puede tener otro número de filas. Es el contador del
--     freno de solicitudes y se llena y se purga solo.
