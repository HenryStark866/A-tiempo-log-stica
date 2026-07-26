-- A TIEMPO LOGÍSTICA — que toda dirección del Área Metropolitana tenga zona.
--
-- SÍNTOMA: al crear una guía a Medellín no se aplicaba tarifa. Sin zona no hay
-- delivery_rate, y la pantalla queda sin precio.
--
-- CAUSA: la cobertura listaba 5 sectores de Medellín (El Poblado, Guayabal,
-- Belén, Laureles, La América) y la ciudad misma no estaba en ninguna zona. Una
-- dirección del centro, de Campo Valdés o de Santa Mónica no coincidía con nada
-- y se quedaba sin zona. Comprobado con direcciones reales de un archivo del
-- cliente: 4 de 6 direcciones de Medellín devolvían null.
--
-- SE ARREGLAN DOS COSAS:
--   1. La cobertura ahora lista los barrios reales de las 16 comunas.
--   2. at_zone_for_city elige el sector MÁS ESPECÍFICO, y solo si ninguno
--      coincide cae al respaldo por ciudad.

-- ── 1. Respaldo por ciudad ─────────────────────────────────────────────
-- Va aparte de `coverage` a propósito. Si "Medellín" fuera un sector más,
-- competiría con los barrios: una dirección de Belén casaría con "medellin"
-- (8 letras) antes que con "belen" (5) y se cobraría la tarifa equivocada.
-- Como respaldo, solo entra cuando ningún barrio coincidió.
alter table public.at_zones
  add column if not exists city_fallback text;

comment on column public.at_zones.city_fallback is
  'Ciudades que esta zona cubre como último recurso, cuando la dirección no menciona ningún sector conocido.';

-- ── 2. Cobertura real del Área Metropolitana ───────────────────────────
update public.at_zones set coverage =
  'Envigado, Sabaneta, Itagüí, Itagui, La Estrella, El Dorado, La Paz, Zúñiga, Las Vegas, El Esmeraldal, Otraparte, San Marcos, Loma del Barro, Mayorca, Ditaires, San Pío, Calatrava, Las Brisas, La Tablaza, Ancón Sur, Suramérica, Las Lomitas, El Carmelo, Pontevedra, Uribe Ángel, Alcalá, La Magnolia'
where sort_order = 1;

update public.at_zones set coverage =
  -- El Poblado
  'El Poblado, Provenza, Manila, Astorga, Patio Bonito, Castropol, Lalinde, Las Lomas, El Tesoro, Los Naranjos, Los Balsos, San Lucas, Alejandría, Villa Carlota, Santa María de los Ángeles, La Aguacatala, Santafé, La Florida, Los González, Barrio Colombia, '
  -- Laureles - Estadio
  'Laureles, Estadio, Suramericana, Los Conquistadores, Bolivariana, Las Acacias, La Castellana, Lorena, El Velódromo, El Nogal, Carlos E. Restrepo, Naranjal, San Joaquín, Cuarta Brigada, Florida Nueva, '
  -- La América
  'La América, Santa Lucía, La Floresta, Ferrini, Calasanz, Los Pinos, Simón Bolívar, Santa Mónica, El Danubio, Campo Alegre, Barrio Cristóbal, La Pilarica, '
  -- Belén
  'Belén, Rosales, Las Playas, Diego Echavarría, La Mota, La Hondonada, El Rincón, Loma de los Bernal, Fátima, Granada, San Bernardo, Las Violetas, Las Mercedes, Miravalle, Altavista, Aguas Frías, '
  -- Guayabal
  'Guayabal, Campo Amor, Cristo Rey, La Trinidad, Tenche, Shellmar, La Colina'
where sort_order = 2;

update public.at_zones set coverage =
  -- La Candelaria / Centro. "Prado Centro" y no "Prado" a secas, para no
  -- robarle las direcciones a San Antonio de Prado (Zona 5).
  'Centro, La Candelaria, Prado Centro, Jesús Nazareno, El Chagualo, Estación Villa, San Benito, Guayaquil, Corazón de Jesús, Calle Nueva, Perpetuo Socorro, Barrio Colón, Boston, Villa Nueva, San Diego, Bomboná, '
  -- Aranjuez
  'Aranjuez, Berlín, San Isidro, Palermo, Bermejal, Moravia, Sevilla, San Pedro, Las Esmeraldas, La Piñuela, Brasilia, Miranda, Campo Valdés, Campovaldés, '
  -- Manrique
  'Manrique, La Salle, Las Granjas, Santa Inés, El Raizal, El Pomar, Versalles, La Cruz, María Cano, Carambolas, San José La Cima, '
  -- Castilla
  'Castilla, Toscana, Florencia, Tejelo, Boyacá, Héctor Abad Gómez, Belalcázar, Girardot, Tricentenario, Alfonso López, Francisco Antonio Zea, Caribe, '
  -- Doce de Octubre
  'Doce de Octubre, 12 de Octubre, Mirador del Doce, Pedregal, Santander, San Martín de Porres, Kennedy, Picacho, El Progreso, La Esperanza, '
  -- Robledo
  'Robledo, Villa Flora, Córdoba, López de Mesa, Aures, Cucaracho, Fuente Clara, Santa Margarita, Olaya Herrera, Pajarito, Monteclaro, Nueva Villa de Aburrá, Bosques de San Pablo, El Diamante, '
  -- Popular y Santa Cruz
  'Popular, Santo Domingo Savio, Granizal, Moscú, Villa Guadalupe, Aldea Pablo VI, Santa Cruz, La Isla, El Playón, Villa del Socorro, La Frontera, La Francia, Andalucía, '
  -- Villa Hermosa
  'Villa Hermosa, La Mansión, San Miguel, Llanaditas, Los Mangos, Enciso, Sucre, El Pinal, Trece de Noviembre, La Ladera, Villatina, Las Estancias, Villa Turbay, La Sierra, Villa Lilliam, '
  -- Buenos Aires
  'Buenos Aires, Juan Pablo II, Caycedo, Los Ángeles, Gerona, El Salvador, Loreto, Asomadera, Cataluña, Miraflores, Alejandro Echavarría, '
  -- San Javier
  'San Javier, El Salado, Veinte de Julio, Belencito, Betania, El Corazón, Juan XXIII, Antonio Nariño, Santa Rosa de Lima, Metropolitano, La Pradera, Nuevos Conquistadores, Las Independencias, El Socorro, Eduardo Santos, '
  -- Bello
  'Bello, Niquía, Madera, Cabañas, París, Zamora, La Cumbre, Playa Rica, Santa Ana'
where sort_order = 3;

update public.at_zones set coverage =
  'Copacabana, Girardota, Machado, Cabuyal, Vegas de San José, San Andrés'
where sort_order = 4;

update public.at_zones set coverage =
  'Caldas, San Antonio de Prado, La Miel, Salinas, Primavera, Mandalay'
where sort_order = 5;

-- Medellín entera cae a Centro Norte cuando no se reconoce el barrio. Es la
-- tarifa central alta: si el barrio resulta ser del sur, la guía se corrige a
-- la baja; al revés se estaría regalando el domicilio.
update public.at_zones set city_fallback = 'Medellín, Medellin'
where sort_order = 3;

-- ── 3. Resolución en dos pasos, del sector más específico al respaldo ──
create or replace function public.at_zone_for_city(p_text text)
returns uuid
language sql stable security definer set search_path = public
as $$
  with texto as (select public.at_norm(coalesce(p_text,'')) as t),
  -- Paso 1: barrios. Gana el sector más largo, o sea el más específico:
  -- "san antonio de prado" le gana a "prado", y "girardota" a "girardot".
  sector as (
    select z.id, length(trim(m.sector)) as precision, z.sort_order
    from public.at_zones z
    cross join unnest(string_to_array(coalesce(z.coverage,''), ',')) as m(sector)
    cross join texto
    where z.active
      and length(trim(m.sector)) > 0
      and texto.t like '%' || public.at_norm(trim(m.sector)) || '%'
    order by precision desc, z.sort_order
    limit 1
  ),
  -- Paso 2: solo si ningún barrio coincidió, la ciudad.
  ciudad as (
    select z.id, z.sort_order
    from public.at_zones z
    cross join unnest(string_to_array(coalesce(z.city_fallback,''), ',')) as m(city)
    cross join texto
    where z.active
      and length(trim(m.city)) > 0
      and texto.t like '%' || public.at_norm(trim(m.city)) || '%'
      and not exists (select 1 from sector)
    order by z.sort_order
    limit 1
  )
  select id from sector
  union all
  select id from ciudad
  limit 1
$$;

revoke execute on function public.at_zone_for_city(text) from public, anon;
grant execute on function public.at_zone_for_city(text) to authenticated;

-- ── 4. Recalcular lo que quedó sin zona con la cobertura vieja ─────────
update public.at_recipients
set zone_id = public.at_zone_for_city(city || ' ' || address)
where zone_id is null
  and public.at_zone_for_city(city || ' ' || address) is not null;

-- Las guías ya facturadas o liquidadas NO se tocan: cambiarles la zona
-- alteraría un valor que el cliente ya vio cobrado.
update public.at_guides
set zone_id = public.at_zone_for_city(recipient_city || ' ' || recipient_address)
where zone_id is null
  and invoice_id is null
  and settlement_id is null
  and public.at_zone_for_city(recipient_city || ' ' || recipient_address) is not null;
