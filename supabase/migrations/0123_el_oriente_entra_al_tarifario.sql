-- ═══════════════════════════════════════════════════════════════════════════
-- EL ORIENTE ENTRA AL TARIFARIO: RIONEGRO Y ORIENTE CERCANO, A $25.000
--
-- Las dos estaban en el limbo que descubrió la 0122: ofrecidas en el
-- desplegable de ciudad (CIUDADES_OPERADAS, src/lib/zones.ts) y fuera de toda
-- sub-zona. Un pedido a Rionegro se creaba sin zona y se facturaba por el
-- respaldo del comercio o en cero, sin romper ninguna pantalla.
--
-- Con Barbosa la 0122 resolvió el caso geográfico —está en el Valle y su sitio
-- era evidente—. Estas dos no: quedan FUERA del Valle de Aburrá, así que su
-- precio no se deduce de un mapa, se decide. Decidido: $25.000 planos cada
-- una, tarifa comercial de A Tiempo Logística.
--
-- ── Por qué DOS zonas y no una ────────────────────────────────────────────
-- Porque el selector ofrece las dos por separado y cada una tiene que casar
-- con la suya. Comparten precio hoy; tenerlas separadas permite moverles el
-- precio por separado mañana sin volver a tocar el esquema. Si algún día se
-- unifican, se desactiva una y se amplía la cobertura de la otra.
--
-- ── Lo que esto cambia fuera del SQL ──────────────────────────────────────
-- La matriz de /sedes pasa de 10×10 a 12×12: de 100 celdas a 144. Y el mensaje
-- de la app que decía «solo realizamos entregas en el Área Metropolitana del
-- Valle de Aburrá» deja de ser cierto — se actualiza en el mismo commit.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_facility uuid;
  v_zona record;
  v_id uuid;
begin
  -- El mismo CEDI del resto de sub-zonas. Una zona sin facility es una zona
  -- que el comercio no ve: at_mi_tarifario y at_tarifario_matriz filtran por él.
  select facility_id into v_facility from public.at_zones where code = 'SUR-INM';

  if v_facility is null then
    raise exception 'No se encontró el CEDI de las sub-zonas. Revisa at_zones.';
  end if;

  for v_zona in
    select * from (values
      ('EXT-RIO', 'Rionegro',        25000, 11, 'Rionegro'),
      ('EXT-ORI', 'Oriente Cercano', 25000, 12, 'Oriente Cercano')
    ) as t(code, name, delivery_rate, sort_order, coverage)
  loop
    insert into public.at_zones
      (code, name, description, coverage, delivery_rate, sort_order, facility_id, active)
    values
      (v_zona.code, v_zona.name,
       'Fuera del Valle de Aburrá. Tarifa plana decidida comercialmente, no deducida de la geografía.',
       v_zona.coverage, v_zona.delivery_rate::numeric, v_zona.sort_order::int, v_facility, true)
    on conflict (code) where code is not null do update
      set name          = excluded.name,
          coverage      = excluded.coverage,
          delivery_rate = excluded.delivery_rate,
          sort_order    = excluded.sort_order,
          active        = true
    returning id into v_id;

    -- Lo que se le paga al mensajero. Se hereda el valor de las demás ($4.000)
    -- para no decidir dos cosas a la vez, PERO ESTO HAY QUE REVISARLO: ir a
    -- Rionegro no es ir a Envigado, y $4.000 por ese viaje probablemente no
    -- salga a cuenta para quien lo hace. Es una conversación con la operación,
    -- no algo que decida una migración.
    insert into public.at_zone_costs (zone_id, courier_fee)
    values (v_id, 4000)
    on conflict (zone_id) do nothing;
  end loop;
end $$;

-- ── La matriz origen × destino ────────────────────────────────────────────
-- at_sembrar_tarifario rellena solo las celdas que faltan: la diagonal al
-- precio mínimo del CEDI y el resto a la tarifa del destino. `on conflict do
-- nothing`, así que no pisa nada ajustado a mano.
do $$
declare v_f record;
begin
  for v_f in select id from public.at_facilities loop
    perform public.at_sembrar_tarifario(v_f.id);
  end loop;
end $$;

-- ── Lo que ya existe y apuntaba a ningún lado ─────────────────────────────
-- Comercios, sedes y destinatarios del oriente que estaban sin zona. Las
-- GUÍAS no se tocan: el precio se congela al crear y nadie recibe una factura
-- distinta de la que se le dijo.
update public.at_clients
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where zone_id is null
   and public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

update public.at_client_sites
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where zone_id is null
   and public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

update public.at_recipients
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where zone_id is null
   and public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

-- ── Que no se quede a medias sin avisar ───────────────────────────────────
do $$
declare v_faltan int;
begin
  select 2 - count(*) into v_faltan
  from public.at_zones where code in ('EXT-RIO','EXT-ORI') and active;

  if v_faltan <> 0 then
    raise exception 'Faltan % zonas del oriente. Revisa at_zones.', v_faltan;
  end if;

  -- Y que la matriz tenga sus celdas: 12 zonas activas => 144 pares.
  if (select count(*) from public.at_zone_pair_rates r
        join public.at_zones o on o.id = r.origin_zone_id
       where o.code is not null) < 144 then
    raise warning 'La matriz no llegó a 144 celdas. Revisa at_sembrar_tarifario.';
  end if;
end $$;

-- ── Cómo se comprueba ─────────────────────────────────────────────────────
--   select code, name, delivery_rate, active from public.at_zones
--    where code in ('EXT-RIO','EXT-ORI');
--   select public.at_zone_for_city('Rionegro');        -- devuelve la zona nueva
--   select public.at_zone_for_city('Oriente Cercano'); -- devuelve la otra
