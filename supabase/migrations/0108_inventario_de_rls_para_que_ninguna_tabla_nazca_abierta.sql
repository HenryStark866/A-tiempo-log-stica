-- A TIEMPO LOGÍSTICA — el inventario contra el que se comprueba RLS entero.
--
-- ── Para qué ──────────────────────────────────────────────────────────────
-- RLS es la única capa de autorización de esta app (ADR-0001). Una tabla nueva
-- a la que se le olvida `enable row level security` no da error, no rompe
-- ninguna pantalla y funciona perfectamente — para todo el mundo, incluida la
-- gente de otro comercio. Es el fallo más caro que puede tener esta base y el
-- que menos se nota.
--
-- `tests/db/rls-cobertura.test.ts` lo comprueba tabla por tabla, y necesita
-- poder preguntarle al catálogo de Postgres. Desde supabase-js no se puede
-- consultar pg_class directamente, así que hace falta esta función.
--
-- ── Por qué solo service_role ─────────────────────────────────────────────
-- Esto es el plano de la seguridad de la base: qué tablas hay y cuál está más
-- desprotegida. No se lo damos ni a `authenticated`. Los tests corren con la
-- llave de servicio contra un staging, que es el único sitio donde tiene
-- sentido preguntarlo.

create or replace function public.at_inventario_de_rls()
returns table (tabla text, rls boolean, politicas int)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    (select count(*)::int from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'            -- tablas de verdad; las vistas no llevan RLS
    and c.relname like 'at\_%'     -- el prefijo de esta app: la base es compartida
  order by c.relname
$$;

comment on function public.at_inventario_de_rls() is
  'Qué tablas at_ hay, si tienen RLS y cuántas políticas. Lo consume tests/db/rls-cobertura.test.ts.';

revoke execute on function public.at_inventario_de_rls() from public, anon, authenticated;
grant execute on function public.at_inventario_de_rls() to service_role;
