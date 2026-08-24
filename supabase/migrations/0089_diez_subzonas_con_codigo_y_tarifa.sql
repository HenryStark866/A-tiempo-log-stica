-- ═══════════════════════════════════════════════════════════════════════════
-- DIEZ SUB-ZONAS EN VEZ DE CINCO — y un código para nombrarlas
--
-- La zonificación tenía 5 zonas y una tarifa por zona. Pasa a 10 sub-zonas que
-- separan el plano de la ladera: subir una loma cuesta tiempo y combustible, y
-- cobrarlo igual que el corredor del río es cobrar mal en las dos direcciones.
--
-- ── Lo que esta migración NO hace, y por qué ──────────────────────────────
--
-- NO borra las 5 zonas viejas. Un `delete from at_zones` se lleva por delante:
--   · at_zone_pair_rates (ON DELETE CASCADE, migración 0051) — la matriz de
--     tarifas origen×destino ajustada a mano desde /sedes;
--   · at_zone_costs (ON DELETE CASCADE, 0009) — lo que se le paga al mensajero;
--   · at_clients.zone_id, at_guides.zone_id, at_recipients.zone_id,
--     at_profiles.zone_id, at_client_sites.zone_id (todos ON DELETE SET NULL).
--
-- Y una guía sin zona no falla: se factura en CERO. La cadena es
-- at_guides.zone_id NULL → el trigger at_guides_set_shipping_fee no dispara →
-- shipping_fee queda NULL → at_cobro_de_guia devuelve coalesce(NULL,0) = 0
-- (migración 0062, línea 41). Sin error, sin aviso, sin cobro.
--
-- Así que las viejas se DESACTIVAN. Siguen ahí para que las guías históricas
-- apunten a una zona real y los informes por zona no queden inservibles.
--
-- ── El reparto de barrios ─────────────────────────────────────────────────
--
-- Los 249 sectores de las 5 zonas viejas se reparten entre las 10 nuevas: ni
-- uno se pierde, ni uno se duplica, ni uno se inventa. Verificado antes de
-- escribir esto. La consecuencia es la propiedad que importa: toda dirección
-- que hoy resuelve a una zona, mañana resuelve a una sub-zona. Lo único que
-- cambia es el precio, nunca la cobertura.
--
-- El corte «plano vs. lomas» es geografía inferida, no dato de la operación.
-- Está para revisarse: ver docs/subzonas-reparto-de-barrios.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El código técnico ──────────────────────────────────────────────────
-- El CEDI agrupa paquetes en ruta hablando de «MED-SO», no de «Medellín
-- Sur-Occidente». El nombre es para el comercio; el código, para la operación.
alter table public.at_zones
  add column if not exists code text;

comment on column public.at_zones.code is
  'Código corto y estable de la sub-zona (MED-SO, SUR-LOM…). Es lo que dice el operario al agrupar en ruta; el nombre es para el comercio. Único entre las zonas que lo tienen.';

-- Índice parcial: las zonas viejas se quedan sin código y no deben chocar
-- entre sí por ser todas NULL.
create unique index if not exists at_zones_code_key
  on public.at_zones (code) where code is not null;

-- ── 2. Las 10 sub-zonas ───────────────────────────────────────────────────
-- Nacen en el mismo CEDI que las actuales: at_zones.facility_id es obligatorio
-- de facto —at_mi_tarifario y at_tarifario_matriz filtran por él (0051)—, así
-- que una zona sin facility es una zona que el comercio no ve.
do $$
declare
  v_facility uuid;
  v_zona record;
  v_id uuid;
begin
  select coalesce(
           (select facility_id from public.at_zones where facility_id is not null
             order by sort_order limit 1),
           (select id from public.at_facilities where is_default limit 1)
         ) into v_facility;

  if v_facility is null then
    raise exception 'No hay CEDI al que colgar las sub-zonas. Revisa at_facilities.';
  end if;

  for v_zona in
    select * from (values
    ('SUR-INM', 'Sur Inmediato Plano', 11500, 1,
     'Envigado, Sabaneta, Itagüí, Itagui, La Estrella, El Dorado, La Paz, Las Vegas, Otraparte, San Marcos, Mayorca, Ditaires, San Pío, Calatrava, La Tablaza, Ancón Sur, Suramérica, Pontevedra, Uribe Ángel, Alcalá, La Magnolia'),
    ('SUR-LOM', 'Sur Lomas y Altura', 12500, 2,
     'Zúñiga, El Esmeraldal, Loma del Barro, Las Brisas, Las Lomitas, El Carmelo'),
    ('MED-SO', 'Medellín Sur-Occidente', 12500, 3,
     'Laureles, Estadio, Suramericana, Los Conquistadores, Bolivariana, Las Acacias, La Castellana, Lorena, El Velódromo, El Nogal, Carlos E. Restrepo, Naranjal, San Joaquín, Cuarta Brigada, Florida Nueva, La América, Santa Lucía, La Floresta, Ferrini, Calasanz, Los Pinos, Simón Bolívar, Santa Mónica, El Danubio, Campo Alegre, Barrio Cristóbal, La Pilarica, Belén, Rosales, Las Playas, Diego Echavarría, La Mota, La Hondonada, El Rincón, Fátima, Granada, San Bernardo, Las Violetas, Las Mercedes, Guayabal, Campo Amor, Cristo Rey, La Trinidad, Tenche, Shellmar, La Colina, La Aguacatala, Santafé, Barrio Colombia'),
    ('MED-SL', 'Medellín Sur Lomas', 14000, 4,
     'El Poblado, Provenza, Manila, Astorga, Patio Bonito, Castropol, Lalinde, Las Lomas, El Tesoro, Los Naranjos, Los Balsos, San Lucas, Alejandría, Villa Carlota, Santa María de los Ángeles, La Florida, Los González, Loma de los Bernal, Altavista, Aguas Frías, Miravalle'),
    ('MED-CO', 'Medellín Centro-Occidente', 13500, 5,
     'Centro, La Candelaria, Prado Centro, Jesús Nazareno, El Chagualo, Estación Villa, San Benito, Guayaquil, Corazón de Jesús, Calle Nueva, Perpetuo Socorro, Barrio Colón, Villa Nueva, San Diego, Bomboná, San Javier, El Salado, Veinte de Julio, Belencito, Betania, El Corazón, Juan XXIII, Antonio Nariño, Santa Rosa de Lima, Metropolitano, La Pradera, Nuevos Conquistadores, Las Independencias, El Socorro, Eduardo Santos'),
    ('MED-COR', 'Medellín Centro-Oriente', 14500, 6,
     'Boston, Buenos Aires, Juan Pablo II, Caycedo, Los Ángeles, Gerona, El Salvador, Loreto, Asomadera, Cataluña, Miraflores, Alejandro Echavarría, Villa Hermosa, La Mansión, San Miguel, Llanaditas, Los Mangos, Enciso, Sucre, El Pinal, Trece de Noviembre, La Ladera, Villatina, Las Estancias, Villa Turbay, La Sierra, Villa Lilliam'),
    ('MED-NP', 'Medellín Norte Plano', 15500, 7,
     'Castilla, Toscana, Florencia, Tejelo, Boyacá, Héctor Abad Gómez, Belalcázar, Girardot, Tricentenario, Alfonso López, Francisco Antonio Zea, Caribe, Doce de Octubre, 12 de Octubre, Pedregal, Santander, San Martín de Porres, Kennedy, Aranjuez, Berlín, San Isidro, Palermo, Bermejal, Moravia, Sevilla, San Pedro, Las Esmeraldas, La Piñuela, Brasilia, Miranda, Campo Valdés, Campovaldés, Robledo, Villa Flora, Córdoba, López de Mesa, Aures, Cucaracho, Fuente Clara, Santa Margarita, Olaya Herrera, Pajarito, Monteclaro, Nueva Villa de Aburrá, Bosques de San Pablo, El Diamante, Bello, Niquía, Madera, Cabañas, París, Zamora, Playa Rica, Santa Ana'),
    ('MED-NL', 'Medellín Norte Lomas', 16500, 8,
     'Popular, Santo Domingo Savio, Granizal, Moscú, Villa Guadalupe, Aldea Pablo VI, Santa Cruz, La Isla, El Playón, Villa del Socorro, La Frontera, La Francia, Andalucía, Manrique, La Salle, Las Granjas, Santa Inés, El Raizal, El Pomar, Versalles, La Cruz, María Cano, Carambolas, San José La Cima, Mirador del Doce, Picacho, El Progreso, La Esperanza, La Cumbre'),
    ('EXT-NOR', 'Norte Extendido', 21000, 9,
     'Copacabana, Girardota, Machado, Cabuyal, Vegas de San José, San Andrés'),
    ('EXT-SUR', 'Sur Extendido', 15000, 10,
     'Caldas, San Antonio de Prado, La Miel, Salinas, Primavera, Mandalay')
    ) as t(code, name, delivery_rate, sort_order, coverage)
  loop
    insert into public.at_zones
      (code, name, description, coverage, delivery_rate, sort_order, facility_id, active)
    values
      (v_zona.code, v_zona.name,
       'Sub-zona ' || v_zona.code || '. Reparto de barrios pendiente de revisión operativa.',
       v_zona.coverage, v_zona.delivery_rate::numeric, v_zona.sort_order::int, v_facility, true)
    on conflict (code) where code is not null do update
      set name          = excluded.name,
          coverage      = excluded.coverage,
          delivery_rate = excluded.delivery_rate,
          sort_order    = excluded.sort_order,
          active        = true
    returning id into v_id;

    -- Lo que se le paga al mensajero por entregar ahí. Se hereda el valor
    -- actual (4.000) para no cambiar dos cosas a la vez: la loma probablemente
    -- merece más, pero eso es una decisión de la operación, no de esta
    -- migración.
    insert into public.at_zone_costs (zone_id, courier_fee)
    values (v_id, 4000)
    on conflict (zone_id) do nothing;
  end loop;
end $$;

-- ── 3. El respaldo por ciudad ─────────────────────────────────────────────
-- Una dirección que dice «Medellín» y ningún barrio reconocible tiene que caer
-- en algún lado. Antes caía en Zona 3 ($15.000) con este criterio, textual de
-- la migración 0018: «si el barrio resulta ser del sur, la guía se corrige a la
-- baja; al revés se estaría regalando el domicilio».
--
-- Se mantiene el criterio y casi la cifra: MED-NP, $15.500. Va en UNA sola
-- sub-zona a propósito — si estuviera en varias, el desempate lo ganaría el
-- sort_order más bajo, o sea la más barata, y sería justo regalar el domicilio.
update public.at_zones set city_fallback = null where city_fallback is not null;
update public.at_zones set city_fallback = 'Medellín, Medellin' where code = 'MED-NP';

-- ── 4. Se jubilan las cinco viejas ────────────────────────────────────────
-- Desactivar y no borrar. at_zone_for_city, at_mi_tarifario y at_cedi_board
-- filtran por `active`, así que dejan de resolver y de mostrarse; pero las
-- guías, facturas y liquidaciones que las referencian siguen enteras.
update public.at_zones
   set active = false,
       sort_order = 90 + sort_order
 where code is null and active;

-- ── 5. La matriz origen×destino ───────────────────────────────────────────
-- at_sembrar_tarifario rellena las celdas que falten: la diagonal (origen =
-- destino) al precio mínimo del CEDI, y el resto a la tarifa del destino.
-- `on conflict do nothing`, así que no pisa nada ajustado a mano.
do $$
declare v_f record;
begin
  for v_f in select id from public.at_facilities loop
    perform public.at_sembrar_tarifario(v_f.id);
  end loop;
end $$;

-- ── 6. Re-zonificar lo que ya existe ──────────────────────────────────────
-- Con las viejas inactivas, at_zone_for_city solo puede devolver sub-zonas
-- nuevas. Si esto no se corriera, todo lo existente quedaría apuntando a zonas
-- inactivas y los precios nuevos no aplicarían a nada.
--
-- Se re-zonifica TODO, guías incluidas: los pedidos que hay hoy son de prueba.
-- (Para una base con operación real, aquí iría el `and invoice_id is null and
-- settlement_id is null` de la migración 0018.)
update public.at_clients
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

update public.at_client_sites
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

update public.at_recipients
   set zone_id = public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,''))
 where public.at_zone_for_city(coalesce(city,'') || ' ' || coalesce(address,'')) is not null;

-- Esta dispara at_guides_set_shipping_fee (BEFORE UPDATE OF zone_id, 0051) y
-- recalcula el precio congelado — salvo en las guías ya entregadas, devueltas o
-- canceladas, que el propio trigger protege.
update public.at_guides
   set zone_id = public.at_zone_for_city(coalesce(recipient_city,'') || ' ' || coalesce(recipient_address,''))
 where public.at_zone_for_city(coalesce(recipient_city,'') || ' ' || coalesce(recipient_address,'')) is not null;

-- El mensajero conserva su zona habitual si sigue teniendo sentido; si su zona
-- se jubiló, se queda sin ella y el CEDI se la vuelve a asignar. Es preferible
-- a adivinar: de esa zona salen el ★ y el orden del selector en /rutas.
update public.at_profiles p
   set zone_id = null
  from public.at_zones z
 where z.id = p.zone_id and not z.active;

-- ── 7. El tablero del CEDI aprende a decir el código ──────────────────────
-- Mismo cuerpo que dejó la migración 0047, con zone_code añadido. Se repite
-- entero y no se «parchea» porque create or replace reemplaza la función
-- completa: lo que no se reescriba, se pierde.
create or replace function public.at_cedi_board()
returns json
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_role public.at_role := public.at_my_role();
  v_facility uuid := public.at_my_facility();
begin
  if v_role not in ('admin','coordinador','operario','admin_cedi') then
    raise exception 'No autorizado';
  end if;

  return json_build_object(
    'zonas', coalesce((
      select json_agg(z2 order by z2.sort_order)
      from (
        select z.id as zone_id, z.name as zone_name, z.code as zone_code, z.sort_order,
               count(g.id) as pendientes,
               json_agg(json_build_object(
                 'id', g.id, 'guide_number', g.guide_number,
                 'recipient_name', g.recipient_name,
                 'recipient_address', g.recipient_address,
                 'recipient_city', g.recipient_city,
                 'is_cod', g.is_cod, 'cod_amount', g.cod_amount,
                 'business_name', c.business_name
               ) order by g.recipient_address) as guias
        from public.at_guides g
        join public.at_zones z   on z.id = g.zone_id
        join public.at_clients c on c.id = g.client_id
        where g.status in ('en_cedi','reprogramada')
          and (v_facility is null or g.facility_id = v_facility)
        group by z.id, z.name, z.code, z.sort_order
      ) z2
    ), '[]'::json),

    'sin_zona', coalesce((
      select json_agg(json_build_object(
               'id', g.id, 'guide_number', g.guide_number,
               'recipient_name', g.recipient_name,
               'recipient_address', g.recipient_address,
               'recipient_city', g.recipient_city,
               'business_name', c.business_name
             ) order by g.created_at)
      from public.at_guides g
      join public.at_clients c on c.id = g.client_id
      where g.status in ('en_cedi','reprogramada') and g.zone_id is null
        and (v_facility is null or g.facility_id = v_facility)
    ), '[]'::json),

    'mensajeros', coalesce((
      select json_agg(json_build_object(
               'id', p.id, 'full_name', p.full_name,
               'courier_type', p.courier_type,
               'zone_id', p.zone_id, 'zone_name', z.name, 'zone_code', z.code,
               'max_capacity', p.max_capacity,
               'carga_actual', (
                 select count(*) from public.at_guides g
                 where g.courier_id = p.id and g.status in ('zonificada','en_ruta')
               )
             ) order by p.full_name)
      from public.at_profiles p
      left join public.at_zones z on z.id = p.zone_id
      where p.role = 'mensajero' and p.active and p.verified_at is not null
        and (v_facility is null or p.facility_id = v_facility)
    ), '[]'::json)
  );
end $function$;

-- ── 8. El tarifario del comercio también lleva el código ──────────────────
-- Mismo cuerpo de la migración 0051 con `code` añadido. Ojo a lo que NO se
-- arregla aquí: at_precio_domicilio se llama con dos argumentos, así que el
-- tarifario que ve un comercio multi-sede ignora la sede y usa la zona del
-- comercio, mientras que el precio que se congela en la guía sí mira la sede
-- (0072). Es una discrepancia previa; tocarla es otro cambio.
create or replace function public.at_mi_tarifario()
returns json
language sql stable security definer set search_path = public
as $function$
  select coalesce(json_agg(t order by t.sort_order), '[]'::json)
  from (
    select z.id, z.code, z.name, z.coverage, z.sort_order,
           public.at_precio_domicilio(public.at_my_client(), z.id) as delivery_rate,
           z.id = (select c.zone_id from public.at_clients c where c.id = public.at_my_client()) as es_mi_zona
    from public.at_zones z
    where z.active
      and z.facility_id = coalesce(
        (select c.facility_id from public.at_clients c where c.id = public.at_my_client()),
        (select f.id from public.at_facilities f where f.is_default limit 1))
  ) t
$function$;

revoke execute on function public.at_mi_tarifario() from public, anon;
grant execute on function public.at_mi_tarifario() to authenticated;

-- ── 9. La matriz de tarifas, con el código en la cabecera ─────────────────
-- Mismo cuerpo de la 0051 con `code` añadido. Con 10 sub-zonas la tabla pasa de
-- 25 a 100 celdas: una cabecera que diga «MED-SO» cabe donde no cabe «Medellín
-- Sur-Occidente», y es además como el CEDI llama a la zona.
create or replace function public.at_tarifario_matriz(p_facility_id uuid default null)
returns json
language sql stable security definer set search_path = public
as $function$
  select json_build_object(
    'zonas', coalesce((
      select json_agg(json_build_object('id', z.id, 'code', z.code, 'name', z.name, 'sort_order', z.sort_order)
             order by z.sort_order)
      from public.at_zones z
      where z.active and z.facility_id = coalesce(
        p_facility_id, public.at_my_facility(),
        (select id from public.at_facilities where is_default limit 1))
    ), '[]'::json),
    'tarifas', coalesce((
      select json_agg(json_build_object(
        'origin_zone_id', r.origin_zone_id,
        'dest_zone_id', r.dest_zone_id,
        'delivery_rate', r.delivery_rate))
      from public.at_zone_pair_rates r
      join public.at_zones o on o.id = r.origin_zone_id
      where o.facility_id = coalesce(
        p_facility_id, public.at_my_facility(),
        (select id from public.at_facilities where is_default limit 1))
    ), '[]'::json)
  )
  where public.at_is_ops()
$function$;

revoke execute on function public.at_tarifario_matriz(uuid) from public, anon;
grant execute on function public.at_tarifario_matriz(uuid) to authenticated;
