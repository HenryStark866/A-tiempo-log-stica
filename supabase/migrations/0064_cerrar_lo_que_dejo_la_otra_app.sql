-- A TIEMPO LOGÍSTICA — se cierra lo que dejó la app que compartía este proyecto.
--
-- Este Supabase era compartido con TaxiYa. TaxiYa se mudó, pero sus objetos se
-- quedaron aquí, y con el proyecto ya dedicado a A Tiempo dejaron de ser
-- "cosas de otro" para pasar a ser superficie de ataque nuestra.
--
-- Lo que se encontró, de mayor a menor gravedad:
--
--  1. registrar_usuario() se podía llamar SIN CUENTA. Es SECURITY DEFINER e
--     inserta directo en auth.users con email_confirmed_at ya puesto, o sea que
--     salta la verificación de correo entera. auth.users es el MISMO para las
--     dos apps: cualquiera en internet podía crear cuentas ya confirmadas en la
--     autenticación de A Tiempo, sin recibir un solo correo. De anónimo a
--     sesión iniciada, gratis y sin límite.
--
--  2. Otras siete funciones suyas, todas SECURITY DEFINER, también abiertas a
--     anónimos: mi_empresa, mi_rol, tarifa_cdh_vigente, registrar_auditoria_
--     servicio, proteger_cargo_cdh, validar_participacion_socios y
--     preparar_alerta_movilidad.
--
--  3. Su trigger on_auth_user_created seguía vivo sobre auth.users, así que se
--     disparaba con CADA registro de A Tiempo. De las 21 filas de su tabla
--     profiles, 17 eran usuarios nuestros: llevábamos meses copiando datos de
--     nuestra gente a la tabla de otra aplicación sin que nadie lo pidiera.
--
-- Se revocan permisos y se quita el trigger. NO se borra ninguna tabla ni
-- ningún dato: ahí hay datos personales de conductores y usuarios de la otra
-- operación, y borrarlos es una decisión de negocio —y de retención legal— que
-- no se toma de pasada en una migración. Todo esto se deshace con un grant.
--
-- Se comprobó antes de tocar nada que el código de A Tiempo no llama a ninguna
-- de estas funciones ni lee ninguna de estas tablas.

-- ── 1. Ninguna función ajena queda invocable desde la API ────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not like 'at\_%'
      -- Las funciones que trae una extensión (pg_net, pgcrypto…) no son de
      -- nadie y quitarles permisos rompería a quien sí las usa.
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.firma);
  end loop;
end $$;

-- ── 2. Ninguna tabla ajena queda accesible desde la API ──────────────────
-- RLS ya las protegía, pero varias tienen políticas que dependen de mi_rol(),
-- una función de la otra app: si mañana alguien la cambia sin saber que esto
-- está aquí, la política cambia con ella. Quitar el permiso de tabla las deja
-- fuera del alcance de PostgREST de una vez, sin depender de nada.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','v','m','p')
      and c.relname not like 'at\_%'
      and not exists (
        select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'revoke all on table public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

-- ── 3. Que un registro nuestro deje de escribir en su tabla ──────────────
-- Se hace en un bloque con captura de error porque auth.users pertenece a
-- supabase_auth_admin: si no tenemos permiso para tocarla, la migración debe
-- avisar en los logs, no caerse y dejar a medias los dos pasos de arriba, que
-- son los que de verdad cierran la puerta.
do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  raise notice 'Trigger on_auth_user_created retirado de auth.users';
exception when insufficient_privilege then
  raise warning 'No se pudo retirar on_auth_user_created de auth.users: hace falta hacerlo desde el panel de Supabase';
end $$;
