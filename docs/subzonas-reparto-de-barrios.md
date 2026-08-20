# Reparto de barrios entre las 10 sub-zonas — para revisar

Generado el 2026-08-19 junto con `supabase/migrations/0089_diez_subzonas_con_codigo_y_tarifa.sql`.

**Esto es un borrador.** Los códigos, los nombres y las tarifas son tuyos. El
reparto de barrios lo inferí de la geografía del Valle de Aburrá y del nombre de
cada sub-zona: **el corte entre «plano» y «lomas» es una conjetura mía**, no un
dato de la operación. Corrígelo aquí y lo llevo a la migración.

## Lo que sí está verificado

Los 249 sectores que hoy están repartidos en las 5 zonas se reparten entre las
10 nuevas **sin perder ninguno, sin duplicar ninguno y sin inventar ninguno**.
Eso da la propiedad que importa: toda dirección que hoy resuelve a una zona,
mañana resuelve a una sub-zona. Cambia el precio, nunca la cobertura.

Un barrio perdido no daría error: la guía se quedaría sin zona y se facturaría
en $0 (`at_cobro_de_guia`, migración 0062). De ahí la verificación.

## Las 10 sub-zonas

| Código | Nombre | Tarifa | Viene de |
| --- | --- | ---: | --- |
| `SUR-INM` | Sur Inmediato Plano | $11.500 | Zona 1 · el corredor del río al sur: cascos urbanos de Itagüí, Sabaneta, Envigado y La Estrella |
| `SUR-LOM` | Sur Lomas y Altura | $12.500 | Zona 1 · las laderas de Envigado y Sabaneta |
| `MED-SO` | Medellín Sur-Occidente | $12.500 | Zona 2 · Laureles-Estadio, La América, Belén bajo y Guayabal |
| `MED-SL` | Medellín Sur Lomas | $14.000 | Zona 2 · El Poblado y las lomas de Belén |
| `MED-CO` | Medellín Centro-Occidente | $13.500 | Zona 3 · La Candelaria y San Javier |
| `MED-COR` | Medellín Centro-Oriente | $14.500 | Zona 3 · Buenos Aires, Villa Hermosa y Boston: la ladera oriental |
| `MED-NP` | Medellín Norte Plano | $15.500 | Zona 3 · Castilla, Robledo, Aranjuez bajo, Doce de Octubre y el casco urbano de Bello |
| `MED-NL` | Medellín Norte Lomas | $16.500 | Zona 3 · Popular, Santa Cruz, Manrique y las laderas del noroccidente |
| `EXT-NOR` | Norte Extendido | $21.000 | Zona 4 · sin cambios |
| `EXT-SUR` | Sur Extendido | $15.000 | Zona 5 · sin cambios |

Dos tarifas cambian respecto a hoy: **Norte Extendido baja de $22.000 a
$21.000** y **Sur Extendido sube de $14.000 a $15.000**. El resto de las
sub-zonas hereda o afina el precio de la zona de la que sale.

## El reparto, sub-zona por sub-zona

### `SUR-INM` · Sur Inmediato Plano — $11.500

_Zona 1 · el corredor del río al sur: cascos urbanos de Itagüí, Sabaneta, Envigado y La Estrella_

`Envigado` · `Sabaneta` · `Itagüí` · `Itagui` · `La Estrella` · `El Dorado` · `La Paz` · `Las Vegas` · `Otraparte` · `San Marcos` · `Mayorca` · `Ditaires` · `San Pío` · `Calatrava` · `La Tablaza` · `Ancón Sur` · `Suramérica` · `Pontevedra` · `Uribe Ángel` · `Alcalá` · `La Magnolia`

### `SUR-LOM` · Sur Lomas y Altura — $12.500

_Zona 1 · las laderas de Envigado y Sabaneta_

`Zúñiga` · `El Esmeraldal` · `Loma del Barro` · `Las Brisas` · `Las Lomitas` · `El Carmelo`

### `MED-SO` · Medellín Sur-Occidente — $12.500

_Zona 2 · Laureles-Estadio, La América, Belén bajo y Guayabal_

`Laureles` · `Estadio` · `Suramericana` · `Los Conquistadores` · `Bolivariana` · `Las Acacias` · `La Castellana` · `Lorena` · `El Velódromo` · `El Nogal` · `Carlos E. Restrepo` · `Naranjal` · `San Joaquín` · `Cuarta Brigada` · `Florida Nueva` · `La América` · `Santa Lucía` · `La Floresta` · `Ferrini` · `Calasanz` · `Los Pinos` · `Simón Bolívar` · `Santa Mónica` · `El Danubio` · `Campo Alegre` · `Barrio Cristóbal` · `La Pilarica` · `Belén` · `Rosales` · `Las Playas` · `Diego Echavarría` · `La Mota` · `La Hondonada` · `El Rincón` · `Fátima` · `Granada` · `San Bernardo` · `Las Violetas` · `Las Mercedes` · `Guayabal` · `Campo Amor` · `Cristo Rey` · `La Trinidad` · `Tenche` · `Shellmar` · `La Colina` · `La Aguacatala` · `Santafé` · `Barrio Colombia`

### `MED-SL` · Medellín Sur Lomas — $14.000

_Zona 2 · El Poblado y las lomas de Belén_

`El Poblado` · `Provenza` · `Manila` · `Astorga` · `Patio Bonito` · `Castropol` · `Lalinde` · `Las Lomas` · `El Tesoro` · `Los Naranjos` · `Los Balsos` · `San Lucas` · `Alejandría` · `Villa Carlota` · `Santa María de los Ángeles` · `La Florida` · `Los González` · `Loma de los Bernal` · `Altavista` · `Aguas Frías` · `Miravalle`

### `MED-CO` · Medellín Centro-Occidente — $13.500

_Zona 3 · La Candelaria y San Javier_

`Centro` · `La Candelaria` · `Prado Centro` · `Jesús Nazareno` · `El Chagualo` · `Estación Villa` · `San Benito` · `Guayaquil` · `Corazón de Jesús` · `Calle Nueva` · `Perpetuo Socorro` · `Barrio Colón` · `Villa Nueva` · `San Diego` · `Bomboná` · `San Javier` · `El Salado` · `Veinte de Julio` · `Belencito` · `Betania` · `El Corazón` · `Juan XXIII` · `Antonio Nariño` · `Santa Rosa de Lima` · `Metropolitano` · `La Pradera` · `Nuevos Conquistadores` · `Las Independencias` · `El Socorro` · `Eduardo Santos`

### `MED-COR` · Medellín Centro-Oriente — $14.500

_Zona 3 · Buenos Aires, Villa Hermosa y Boston: la ladera oriental_

`Boston` · `Buenos Aires` · `Juan Pablo II` · `Caycedo` · `Los Ángeles` · `Gerona` · `El Salvador` · `Loreto` · `Asomadera` · `Cataluña` · `Miraflores` · `Alejandro Echavarría` · `Villa Hermosa` · `La Mansión` · `San Miguel` · `Llanaditas` · `Los Mangos` · `Enciso` · `Sucre` · `El Pinal` · `Trece de Noviembre` · `La Ladera` · `Villatina` · `Las Estancias` · `Villa Turbay` · `La Sierra` · `Villa Lilliam`

### `MED-NP` · Medellín Norte Plano — $15.500

_Zona 3 · Castilla, Robledo, Aranjuez bajo, Doce de Octubre y el casco urbano de Bello_

`Castilla` · `Toscana` · `Florencia` · `Tejelo` · `Boyacá` · `Héctor Abad Gómez` · `Belalcázar` · `Girardot` · `Tricentenario` · `Alfonso López` · `Francisco Antonio Zea` · `Caribe` · `Doce de Octubre` · `12 de Octubre` · `Pedregal` · `Santander` · `San Martín de Porres` · `Kennedy` · `Aranjuez` · `Berlín` · `San Isidro` · `Palermo` · `Bermejal` · `Moravia` · `Sevilla` · `San Pedro` · `Las Esmeraldas` · `La Piñuela` · `Brasilia` · `Miranda` · `Campo Valdés` · `Campovaldés` · `Robledo` · `Villa Flora` · `Córdoba` · `López de Mesa` · `Aures` · `Cucaracho` · `Fuente Clara` · `Santa Margarita` · `Olaya Herrera` · `Pajarito` · `Monteclaro` · `Nueva Villa de Aburrá` · `Bosques de San Pablo` · `El Diamante` · `Bello` · `Niquía` · `Madera` · `Cabañas` · `París` · `Zamora` · `Playa Rica` · `Santa Ana`

### `MED-NL` · Medellín Norte Lomas — $16.500

_Zona 3 · Popular, Santa Cruz, Manrique y las laderas del noroccidente_

`Popular` · `Santo Domingo Savio` · `Granizal` · `Moscú` · `Villa Guadalupe` · `Aldea Pablo VI` · `Santa Cruz` · `La Isla` · `El Playón` · `Villa del Socorro` · `La Frontera` · `La Francia` · `Andalucía` · `Manrique` · `La Salle` · `Las Granjas` · `Santa Inés` · `El Raizal` · `El Pomar` · `Versalles` · `La Cruz` · `María Cano` · `Carambolas` · `San José La Cima` · `Mirador del Doce` · `Picacho` · `El Progreso` · `La Esperanza` · `La Cumbre`

### `EXT-NOR` · Norte Extendido — $21.000

_Zona 4 · sin cambios_

`Copacabana` · `Girardota` · `Machado` · `Cabuyal` · `Vegas de San José` · `San Andrés`

### `EXT-SUR` · Sur Extendido — $15.000

_Zona 5 · sin cambios_

`Caldas` · `San Antonio de Prado` · `La Miel` · `Salinas` · `Primavera` · `Mandalay`


## Lo que ya corregiste

**Robledo (comuna 7) → `MED-NP`, $15.500.** Yo lo había puesto en
`MED-CO` ($13.500) razonando que está al occidente del río, a la altura del
centro. Me equivoqué: la zonificación oficial de Medellín mete la comuna 7 en la
**Zona Noroccidental**, junto con Castilla y Doce de Octubre, que es el criterio
con el que trabaja el CEDI. Entra entera y sin partir en «bajo» y «alto»: un
solo precio para toda la comuna, y agrupa en la misma ruta que Castilla.

Arrastró 13 sectores: Villa Flora, Córdoba, López de Mesa, Aures, Cucaracho,
Fuente Clara, Santa Margarita, Olaya Herrera, Pajarito, Monteclaro, Nueva Villa
de Aburrá, Bosques de San Pablo y El Diamante.

**Norte Extendido a $21.000**, no a los $19.000 de la especificación inicial.

## Lo que hay que mirar con lupa

**El corte plano/lomas.** Es lo único que inventé. Sobre todo:

- `SUR-LOM` se queda con apenas 6 sectores (Zúñiga, El Esmeraldal, Loma del
  Barro, Las Brisas, Las Lomitas, El Carmelo). Si la operación considera que
  media Envigado alta es loma, faltan barrios ahí.
- Puse **La Aguacatala, Santafé y Barrio Colombia en `MED-SO`** y no en
  `MED-SL`: son El Poblado sobre el papel, pero están al nivel del río. Si el
  criterio es administrativo y no geográfico, van a `MED-SL` (+$1.500).
- Puse **La Candelaria/Centro en `MED-CO`** ($13.500) y no en `MED-COR`
  ($14.500). El Centro está en la margen oriental, pero es lo más fácil de
  alcanzar del valle. Si el criterio es la margen del río, se mueve.
- **Comuna 13 alta** (Nuevos Conquistadores, Las Independencias, El Socorro…)
  quedó en `MED-CO` porque no hay una sub-zona «centro-occidente lomas». Son
  las laderas más difíciles de la ciudad y hoy se cobran como el Centro.
- **Villa Hermosa alta** (Villatina, La Sierra, Villa Turbay, Llanaditas) quedó
  en `MED-COR` por lo mismo.

**Barrios que no están en ninguna lista, ni antes ni ahora.** Barbosa, Rionegro
y «Oriente Cercano» aparecen en `CIUDADES_OPERADAS` (`src/lib/zones.ts`) pero
en ninguna cobertura: una dirección allí sale como «Zona por confirmar» y se
queda sin tarifa. Ya era así antes de este cambio; decidir si Barbosa entra en
`EXT-NOR` es una decisión de negocio, no la tomo yo.

**El respaldo por ciudad.** Una dirección que dice «Medellín» sin barrio
reconocible cae en `MED-NP` ($15.500). Es el mismo criterio de la migración
0018 —tirar hacia arriba para no regalar el domicilio— y casi la misma cifra
que antes ($15.000). Va en una sola sub-zona: si estuviera en varias, ganaría la
de `sort_order` más bajo, que es la más barata.

**Lo que le pagas al mensajero no cambió.** Las 10 sub-zonas nacen con los
mismos $4.000 de `at_zone_costs` que tenían las 5. Subir la loma probablemente
merece más, pero eso es tuyo y no lo mezclo con este cambio.

## Los seis solapamientos, y por qué no son un problema

El algoritmo elige el sector **más largo** que aparezca en la dirección, así que
un nombre contenido en otro se resuelve solo:

| Gana | Sobre | Caso |
| --- | --- | --- |
| `Suramericana` (MED-SO) | `Suramérica` (SUR-INM) | Laureles vs. Itagüí |
| `Belencito` (MED-CO) | `Belén` (MED-SO) | Comuna 13 vs. Belén |
| `Villa del Socorro` (MED-NL) | `El Socorro` (MED-CO) | Santa Cruz vs. comuna 13 |
| `Santa María de los Ángeles` (MED-SL) | `Los Ángeles` (MED-COR) | Poblado vs. Buenos Aires |
| `Asomadera` (MED-COR) | `Madera` (MED-NP) | Buenos Aires vs. Bello |
| `Girardota` (EXT-NOR) | `Girardot` (MED-NP) | ya documentado en 0018 |

Cinco de los seis ya existían entre las zonas viejas. `tests/zonas.test.ts`
defiende justamente los casos `Prado`/`Girardot`.
