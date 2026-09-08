-- ═══════════════════════════════════════════════════════════════════════════
-- LAS TARIFAS DESDE EL CEDI SABANETA PASAN A MILES CERRADOS
--
-- Actualización comercial de la estructura de precios base. Dos cosas cambian
-- a la vez, y las dos son solo VALORES:
--
--   · los precios reflejan el costo operativo real de salir desde Sabaneta;
--   · todos quedan en miles cerrados, para que el comercio pueda repetir la
--     cifra de memoria y el mensajero no tenga que dar $500 de vueltas.
--
-- No se toca ni un nombre, ni un código, ni un barrio, ni la lógica de precio.
-- El reparto de sectores de la migración 0089 queda exactamente igual: una
-- dirección que hoy resuelve a MED-SO mañana sigue resolviendo a MED-SO, solo
-- que cuesta $13.000 en vez de $12.500.
--
-- ── El mapeo ──────────────────────────────────────────────────────────────
--
--   SUR-INM   Sur Inmediato Plano        11.500 → 11.000
--   SUR-LOM   Sur Lomas y Altura         12.500 → 11.000
--   MED-SO    Medellín Sur-Occidente     12.500 → 13.000
--   MED-SL    Medellín Sur Lomas         14.000 → 13.000
--   MED-CO    Medellín Centro-Occidente  13.500 → 14.000
--   MED-COR   Medellín Centro-Oriente    14.500 → 14.000
--   EXT-SUR   Sur Extendido              15.000 → 15.000  (sin cambio)
--   MED-NP    Medellín Norte Plano       15.500 → 16.000
--   MED-NL    Medellín Norte Lomas       16.500 → 18.000
--   EXT-NOR   Norte Extendido            21.000 → 21.000  (sin cambio)
--
-- El escalón que más se mueve es MED-NL (+$1.500): subir a Popular, Santa Cruz
-- o Manrique es la ladera más cara de la operación y venía cobrándose casi
-- igual que el plano del norte. Ahora hay $2.000 entre plano y loma.
--
-- Se filtra por `code`, no por nombre ni por facility_id: el índice único
-- parcial `at_zones_code_key` (0089) garantiza que estos diez códigos existen
-- una sola vez en toda la base, y son justo los del CEDI de Sabaneta. Las
-- zonas de los CEDIs afiliados nacen sin código (at_generar_zonas_por_defecto,
-- 0051), así que esta migración no las alcanza: cada ciudad pone su precio.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La tarifa base de cada sub-zona ────────────────────────────────────
update public.at_zones z
   set delivery_rate = n.tarifa::numeric
  from (values
    ('SUR-INM', 11000),
    ('SUR-LOM', 11000),
    ('MED-SO',  13000),
    ('MED-SL',  13000),
    ('MED-CO',  14000),
    ('MED-COR', 14000),
    ('EXT-SUR', 15000),
    ('MED-NP',  16000),
    ('MED-NL',  18000),
    ('EXT-NOR', 21000)
  ) as n(code, tarifa)
 where z.code = n.code;

-- Si alguno de los diez códigos no apareciera, el tarifario quedaría a medias
-- —unas zonas al precio nuevo y otras al viejo— y nadie se enteraría hasta la
-- primera factura. Mejor que la migración no pase.
do $$
declare v_faltan int;
begin
  select 10 - count(*) into v_faltan
  from public.at_zones
  where code in ('SUR-INM','SUR-LOM','MED-SO','MED-SL','MED-CO',
                 'MED-COR','MED-NP','MED-NL','EXT-NOR','EXT-SUR');

  if v_faltan <> 0 then
    raise exception 'Faltan % sub-zonas de las diez del tarifario. Revisa at_zones.code.', v_faltan;
  end if;
end $$;

-- ── 2. La matriz origen × destino ─────────────────────────────────────────
-- Aquí está el precio que de verdad se cobra: at_precio_domicilio (0072) mira
-- PRIMERO at_zone_pair_rates y solo cae a at_zones.delivery_rate si el par no
-- existe. Un comercio con zona asignada —o sea, casi todos— no habría visto un
-- peso de diferencia con el paso 1 solo.
--
-- Se re-alinean únicamente las celdas SEMBRADAS, las que tienen updated_by
-- null. Las que alguien ajustó a mano desde /sedes son una decisión de la
-- operación sobre un cruce concreto (Norte Extendido → Sur Extendido, que la
-- regla de siembra cobra como si saliera del CEDI) y esta migración no tiene
-- por qué saber más que quien las puso.
--
-- La regla de reparto es la misma de la 0051, con los números nuevos:
--   · origen = destino  → la tarifa más barata del CEDI (ahora $11.000)
--   · origen ≠ destino  → la tarifa del destino
do $$
declare
  v_facility uuid;
  v_min numeric(12,2);
  v_alineadas int;
  v_a_mano int;
begin
  select facility_id into v_facility
  from public.at_zones where code = 'SUR-INM';

  select min(delivery_rate) into v_min
  from public.at_zones where facility_id = v_facility and active;

  update public.at_zone_pair_rates r
     set delivery_rate = case when r.origin_zone_id = r.dest_zone_id
                              then v_min else d.delivery_rate end,
         updated_at = now()
    from public.at_zones o, public.at_zones d
   where o.id = r.origin_zone_id
     and d.id = r.dest_zone_id
     and o.facility_id = v_facility
     and r.updated_by is null
     and r.delivery_rate is distinct from (case when r.origin_zone_id = r.dest_zone_id
                                                then v_min else d.delivery_rate end);
  get diagnostics v_alineadas = row_count;

  select count(*) into v_a_mano
  from public.at_zone_pair_rates r
  join public.at_zones o on o.id = r.origin_zone_id
  where o.facility_id = v_facility and r.updated_by is not null;

  raise notice 'Tarifario de Sabaneta: % celdas re-alineadas, % respetadas por venir de un ajuste a mano.',
    v_alineadas, v_a_mano;
end $$;

-- Por si faltara alguna celda del cruce (una zona activada después): la siembra
-- solo inserta lo que no existe, no pisa nada.
do $$
declare v_f record;
begin
  for v_f in select id from public.at_facilities loop
    perform public.at_sembrar_tarifario(v_f.id);
  end loop;
end $$;

-- ── Lo que esta migración deliberadamente NO hace ─────────────────────────
-- No recalcula las guías ya creadas. at_guides.shipping_fee es un precio
-- CONGELADO en el momento de zonificar (at_set_guide_shipping_fee, 0072): a un
-- comercio no se le puede cambiar el valor de un envío que ya despachó, y menos
-- si ya está en una factura o en una liquidación. El precio nuevo aplica desde
-- el siguiente pedido.
--
-- Tampoco toca at_zone_costs: lo que se le paga al mensajero sigue en $4.000
-- por entrega. Que el domicilio a la loma del norte suba $1.500 es una decisión
-- de precio al comercio; cuánto de eso llega al mensajero es otra conversación,
-- y merece su propia migración.
