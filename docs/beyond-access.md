# Beyond Access — somos aliados

Desde octubre de 2026, A Tiempo Logística hace parte de **Beyond Access**, la
iniciativa apoyada por la Interledger Foundation que reúne a fintechs,
entidades, academia y comunidades en Colombia alrededor de una pregunta: por
qué el acceso financiero no se convirtió en adopción.

Este documento es para quien tenga que escribir, publicar o pintar algo con esa
marca —en la app, en redes o en una presentación—, para que no haya dos
versiones del mismo texto rodando por ahí.

## La única regla dura

**El nombre de la iniciativa no se altera.** Se escribe «Beyond Access»: sin
traducir, sin abreviar a «BA», sin partir en dos líneas. Todo lo demás —el tono,
el orden de las frases, la longitud— se puede adaptar a nuestra voz.

## Dónde está escrito en el repo

Los tres textos, el hashtag, las tintas y las rutas de los archivos viven en un
solo sitio: [`src/lib/aliados.ts`](../src/lib/aliados.ts). No se copian a mano
en una pantalla; se importan. Si la iniciativa cambia un texto, se cambia ahí y
cambia en todas partes.

Quien lo pinta es [`src/components/BeyondAccess.tsx`](../src/components/BeyondAccess.tsx),
con dos piezas:

| Pieza | Dónde sale | Qué muestra |
| --- | --- | --- |
| `SelloBeyondAccess` | el pie de las pantallas públicas (`PieMarca`) | el sello y la frase corta |
| `BloqueBeyondAccess` | la pantalla de inicio, antes del pie | el logotipo, el párrafo de prensa y el compromiso |

Hoy eso se traduce en la pantalla de inicio (`/`) y en el rastreo público
(`/rastreo`), que son las dos que llevan `PieMarca`.

## Los textos

**Corto — para el pie del sitio**

> Hacemos parte de Beyond Access, la iniciativa que trabaja para que el acceso
> financiero se convierta en apropiación real en Colombia.

**Para redes**

> Firmamos el compromiso de Beyond Access: participar, compartir, diseñar para
> la gente, construir puentes y dar visibilidad. Porque el acceso fue solo la
> semilla. #BeyondAccess

**Boilerplate — para prensa o presentaciones**

> Beyond Access es una iniciativa apoyada por la Interledger Foundation que
> reúne a fintechs, entidades, academia y comunidades en Colombia alrededor de
> una pregunta: por qué el acceso financiero no se convirtió en adopción. A
> través de encuentros, investigación y un hackathon de pagos abiertos, la
> iniciativa trabaja para que tener una cuenta se convierta en usarla, confiar
> en ella y hacerla propia.

## Los archivos

Están en `public/aliados/beyond-access/`, tal como nos los entregaron. No se
recolorean con filtros CSS: cada fondo tiene su archivo.

| Archivo | Para qué |
| --- | --- |
| `sello.svg` | el sello a color, con el círculo granadilla incluido. Sirve sobre cualquier fondo |
| `sello-tinta.svg` | el sello en tinta `#1C1015`, sin fondo. Para tema claro |
| `sello-negativo.svg` | crema y granadilla, sin fondo. Para tema oscuro |
| `logo-tinta.svg` | el logotipo horizontal con el nombre, en tinta. Solo donde sobre ancho |
| `logo-negativo.svg` | el mismo logotipo para fondo oscuro |

## Las tintas

Cada una lleva nombre de fruta. En la app **solo se usa granadilla**, y solo
dentro del bloque de Beyond Access: el acento de YAM sigue siendo el naranja
`#ff812c`, y dos acentos en la misma pantalla no son una paleta, son un ruido.

| Fruta | Código |
| --- | --- |
| Lulo | `#7FA613` |
| Granadilla | `#E8A317` |
| Guayaba | `#E8666D` |
| Mandarina | `#E85D04` |
| Pitahaya | `#E62E6B` |
| Mora | `#7C3AED` |
| Semilla | `#1C1015` |
| Guanábana | `#F3E7CE` |

## Lo que falta

- **La URL de la iniciativa.** `BEYOND_ACCESS.sitio` está en `null` a propósito:
  llega en el correo con el paquete completo de logos. Cuando llegue, se pone
  ahí y el sello del pie puede volverse enlace.
- **Etiquetarlos al publicar.** Dijeron que amplifican lo que les etiqueten.
- **Cupos de 2026.** Si queremos co-crear una actividad o pilotear tecnología en
  los encuentros, se responde a ese mismo correo: los cupos se asignan primero
  entre los aliados.
