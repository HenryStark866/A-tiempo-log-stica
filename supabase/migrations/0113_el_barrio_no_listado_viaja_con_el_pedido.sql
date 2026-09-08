-- ═══════════════════════════════════════════════════════════════════════════
-- EL BARRIO QUE NO ESTÁ EN NINGUNA ZONA VIAJA CON EL PEDIDO
--
-- El cotizador del comercio resuelve el precio buscando el barrio dentro de
-- `at_zones.coverage`. Cuando el comprador vive en un sector que no está en esa
-- lista —«Zúñiga Alto», una urbanización nueva, una vereda—, la búsqueda no
-- devuelve nada y hasta hoy la pantalla solo sabía decir «sin resultados». El
-- comercio escribía el pedido igual y el barrio se perdía: nadie en el CEDI se
-- enteraba de que ese destino existe.
--
-- Esta columna lo guarda. Es un dato del PEDIDO, no del catálogo: aquí no se
-- crea ninguna zona ni se toca `at_zones`. Es exactamente lo que el comercio
-- escribió, tal cual, pegado a esa guía y a ninguna otra.
--
-- Para qué sirve de verdad: al cabo de unas semanas, agrupar por este campo
-- dice qué sectores está pidiendo la gente y no tenemos zonificados. Eso es lo
-- que justifica ampliar una cobertura, y hoy no hay forma de saberlo.
--
--   select recipient_neighborhood, recipient_city, count(*)
--     from public.at_guides
--    where recipient_neighborhood is not null
--    group by 1, 2
--    order by 3 desc;
--
-- ── ⚠ LO QUE ESTA MIGRACIÓN NO ARREGLA ────────────────────────────────────
--
-- Guardar el barrio NO le pone precio al domicilio. La cadena sigue siendo la
-- que describe la 0095: si `zone_id` queda NULL, el trigger
-- at_guides_set_shipping_fee no encuentra zona, `shipping_fee` queda NULL y
-- at_cobro_de_guia devuelve coalesce(NULL, 0) = 0. El pedido se entrega y NO SE
-- COBRA. Sin error y sin aviso.
--
-- El trigger at_guides_asigna_zona (0095) tapa la mayoría de los casos: si la
-- ciudad o la dirección permiten deducir la zona, la pone. Lo que cae por este
-- hueco es el pedido cuyo municipio tampoco se reconoce — y son justo los que
-- van a llegar por el camino del barrio no listado.
--
-- Así que mientras no exista una tarifa de respaldo del lado de la base, esta
-- columna es un registro para el CEDI, no una cotización. La pantalla, por eso,
-- no le promete un precio al comercio: dice que el CEDI lo confirma.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_guides
  add column if not exists recipient_neighborhood text;

comment on column public.at_guides.recipient_neighborhood is
  'Barrio o sector escrito a mano por el comercio cuando el destino no cayó en ninguna zona. Dato del pedido, no del catálogo: no crea ni modifica at_zones. Solo se llena por el camino de «barrio no listado»; NULL en todo pedido zonificado con normalidad.';

-- Un barrio es un nombre corto. El límite frena que alguien pegue aquí media
-- dirección —o un párrafo— y acabe convertido en un campo de notas paralelo,
-- que es lo que ya pasó una vez con `notes` y arregló la 0042.
alter table public.at_guides
  drop constraint if exists at_guides_neighborhood_check;
alter table public.at_guides
  add constraint at_guides_neighborhood_check
  check (
    recipient_neighborhood is null
    or char_length(btrim(recipient_neighborhood)) between 2 and 80
  );

-- Índice parcial: solo indexa las filas que sí traen barrio, que van a ser una
-- minoría pequeña. La consulta que justifica todo esto —qué sectores nos están
-- pidiendo y no cubrimos— es la única que lo usa.
create index if not exists at_guides_neighborhood_idx
  on public.at_guides (recipient_neighborhood)
  where recipient_neighborhood is not null;
