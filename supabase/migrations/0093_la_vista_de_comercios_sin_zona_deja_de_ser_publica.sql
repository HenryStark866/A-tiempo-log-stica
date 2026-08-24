-- ═══════════════════════════════════════════════════════════════════════════
-- LA LISTA DE COMERCIOS DEJA DE SER PÚBLICA
--
-- at_comercios_sin_zona se creó en la 0056 como herramienta de diagnóstico del
-- CEDI: ver de un vistazo a qué comercio le falta zona de origen antes de que
-- eso se convierta en una factura mal cobrada. Útil, y ninguna pantalla la usa.
--
-- El problema es cómo quedó. Una vista en el esquema `public` aplica por
-- defecto los permisos de quien la creó —no los de quien la consulta— y
-- PostgREST la publica como una tabla más. Con SELECT concedido a `anon`, eso
-- significaba que cualquiera sin cuenta podía pedir
-- /rest/v1/at_comercios_sin_zona y llevarse el nombre, la dirección y el
-- teléfono de todos los comercios activos, más cuántos pedidos tiene cada uno
-- en la calle. Es información comercial de A Tiempo y de sus clientes.
--
-- Dos cambios, y ninguno le quita la utilidad:
--   · security_invoker: la vista pasa a aplicar el RLS de quien pregunta, así
--     que cada quien ve por ella exactamente lo que vería consultando
--     at_clients directamente.
--   · fuera anon: sin cuenta no se ve nada. Esta vista es para el CEDI.
--
-- ── Sobre el número de esta migración ─────────────────────────────────────
-- En Supabase quedó registrada como «0090_la_vista_de_comercios_sin_zona_deja
-- _de_ser_publica»: se aplicó sin ver que el repo ya tenía una 0090 (la del
-- precio del CSV). El contenido es este mismo; el archivo lleva el número
-- libre para que el repo quede ordenado. No hace falta volver a aplicarla.
-- ═══════════════════════════════════════════════════════════════════════════

alter view public.at_comercios_sin_zona set (security_invoker = on);

revoke all on public.at_comercios_sin_zona from anon;

comment on view public.at_comercios_sin_zona is
  'Comercios activos sin zona de origen, para que el CEDI los complete antes de que se les facture mal. Aplica el RLS de quien consulta (security_invoker) y no está abierta a anon.';
