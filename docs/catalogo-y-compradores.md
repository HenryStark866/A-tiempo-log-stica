# La base de compradores y el catálogo, por comercio

Cómo funciona hoy, qué se arregló el 2026-08-16 y qué falta comprobar.

## Quién puede qué

| | Dueño (`cliente`) | Asesor (`asesor`) |
| --- | --- | --- |
| Subir el archivo (CSV) | **Sí** | No |
| Ver compradores y catálogo | Sí | **Sí** |
| Crear uno a uno | Sí | **Sí** |
| Editar y desactivar | Sí | Sí |

**La carga masiva es del dueño a propósito**: reemplaza la base de golpe, y eso
no es decisión de quien trabaja para él. Lo imponen las dos capas —
`at_sync_recipients` y `at_sync_products` exigen rol `cliente`, y las pantallas
esconden el botón para que el asesor no llegue hasta el final del asistente
para toparse con un error genérico.

**Todo lo demás sí es suyo.** Las políticas de RLS (migración 0081) miran
`client_id = at_my_client()`, y `at_my_client()` devuelve el comercio de quien
sea. Se comprobó en las dos direcciones: el asesor lee y escribe, el asesor
**suspendido** no — `at_estoy_activo()` está en las políticas desde 0081.

## Lo que se arregló

### El precio se multiplicaba por cien

`at_parse_money` tomaba la coma decimal como separador de miles cuando había
cuatro o más dígitos delante:

```
'89900,00'  →  8990000     debía ser  89900
'12345,5'   →   123455     debía ser  12345.5
```

Un producto de 89.900 pesos quedaba a 8.990.000 en el catálogo. El asesor lo
veía así al despachar, y ese precio viajaba al contraentrega: **el mensajero le
cobraba cien veces de más al comprador en la puerta.**

No se había visto porque el caso más frecuente sí funcionaba. Excel en español
suele exportar `89.900,00` —con punto de miles *y* coma decimal— y esa rama
estaba bien. El fallo aparece cuando la celda tiene dos decimales pero no
separador de miles: `89900,00`. Igual de real, y silencioso: no da error,
guarda un número.

Corregido en `supabase/migrations/0090_el_precio_del_csv_no_se_multiplica_por_cien.sql`,
con una sola regla en vez de tres ramas que podían discrepar: **el último
separador es decimal si deja 1 o 2 dígitos detrás; si no, es de miles.** La
migración lleva sus propias aserciones: si alguna falla, no se aplica.

> **Revisa lo ya cargado.** La migración no toca los precios existentes a
> propósito: no hay forma de distinguir un producto mal importado de uno que de
> verdad cuesta ocho millones. Al pie del archivo hay una consulta para
> auditarlos a mano.

### El asesor sin comercio veía todo vacío

Si su cuenta no está enlazada a un comercio, `useMyClient` se salía en silencio
y las tres pantallas —destinatarios, productos y el buscador de
`/pedidos/nueva`— quedaban vacías sin error. El asesor no tenía forma de saber
que el problema no era suyo.

Ahora dice qué pasa y qué hacer: *«Tu cuenta todavía no está enlazada a un
comercio. Pídele al dueño de la tienda que te habilite desde Mi equipo.»*

## Lo que ya estaba bien y conviene no tocar

El parser de CSV (`src/lib/csv.ts`) está mejor resuelto de lo habitual:

- **Codificación.** Intenta UTF-8 estricto y cae a Windows-1252 si falla —
  Excel en español guarda en ANSI, y leerlo como UTF-8 destruye tildes y ñ.
- **Separador.** Detecta `,` `;` tab o `|` contando solo fuera de comillas.
- **Comillas.** Parser completo: `""` escapado y saltos de línea dentro de campo.
- **Teléfono por contenido.** Si ninguna cabecera casa, mira los datos y elige
  la columna que *parece* de teléfonos.
- **Columnas sin mapear.** En productos se guardan en `extra` (la tabla tiene
  esa columna). En compradores no: `at_recipients` no la tiene, y mandarlas
  igual fue lo que tumbaba la importación de un export con 50-70 columnas
  (ver más abajo).

## Lo que falta comprobar, y necesita staging

Está escrito en `tests/db/catalogo.test.ts`, saltándose solo hasta que haya base
de pruebas:

1. **Que una segunda carga no duplique.** Busca por SKU, y sin SKU por nombre
   normalizado. Subir el mismo archivo dos veces debe actualizar.
2. **Que un precio ilegible no borre el bueno.** El update conserva el precio
   anterior si el nuevo no es mayor que cero.
3. **Que un comercio no pise el catálogo de otro.**
