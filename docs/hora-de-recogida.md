# La hora de recogida — qué cambió y dónde vive

Fecha del cambio: **2026-08-19**. Toca la pantalla de Recogidas, `src/lib/tiempo.ts`
y la base. Este archivo existe para que el próximo que abra `recogidas/page.tsx`
no tenga que reconstruir el porqué desde el diff.

---

## El problema, en el orden en que apareció

**Primero, la molestia.** El campo «Hora deseada» era un `<input type="time">`
con `min`, `max` y `step={900}`. El navegador validaba a media escritura y
respondía con su propia burbuja —«El valor debe ser 08:00 o posterior»—, en el
idioma del sistema operativo y encima del campo. Nadie escribe una hora de un
tirón, así que el regaño salía casi siempre.

**Después, el agujero.** Una prueba en el formulario dejó agendar una recogida
para **hoy a las 10:15 a. m.** cuando ya eran más de las 5 de la tarde. El input
sabía de franja horaria pero no de reloj: `min`/`max` no distinguen entre una
hora que existe y una hora que todavía se puede atender.

**Y debajo, lo de siempre.** Todo lo anterior es del lado del navegador. El
reloj lo pone el aparato del cliente, la RPC se puede llamar sin pasar por la
pantalla, y —esto fue el hallazgo— la política RLS `"cliente solicita recogida
propia"` (migración `0010`) permite un `INSERT` directo sobre `at_pickups`. Una
validación que viviera solo dentro de `at_request_pickup` habría estado
adornando la puerta principal con la lateral abierta.

---

## Lo que hay ahora

### 1. Un desplegable, no un campo de escritura

`SelectHora`, en `src/app/(plataforma)/recogidas/page.tsx`. Ofrece los turnos de
15 minutos de la franja y nada más. No hay nada que validar, porque no se puede
elegir una hora que la operación no atienda; y de paso la interfaz dice la
verdad: **se agenda por turnos, no al minuto**.

La hora sigue siendo opcional —la RPC acepta `null`—, así que la primera opción
es «Sin preferencia».

### 2. La lista depende del reloj

`yaPaso(fecha, hora, ahora)` es el **único** criterio de «ya pasó» de la
pantalla. De él salen cuatro cosas, y por eso es una sola función: los turnos
que se ofrecen, el aviso de jornada cerrada, la limpieza del campo cuando la
hora elegida se queda vieja, y la comprobación al enviar. Con la cuenta copiada
cuatro veces, basta corregir tres para que la cuarta siga dejando pasar lo que
las otras bloquean.

Compara cadenas y no `Date`: `"2026-08-19"` y `"08:15"` están rellenas con ceros
y ordenan igual que los números que representan.

Detalles que no son obvios en el diff:

- **El reloj corre mientras el formulario está abierto** (`ahora`, refrescado
  cada 30 s y solo con un formulario abierto). Si alguien abre a las 4:58 y
  envía a las 5:03, la lista que tiene delante ya no es cierta.
- **La hora elegida se limpia sola** cuando deja de valer. Si no, el `<select>`
  se vería vacío pero el estado seguiría enviando la hora vieja.
- **Al enviar se vuelve a preguntar la hora** con un `new Date()` fresco, no con
  el estado `ahora`, que puede llevar 30 s de retraso.

### 3. La base no se fía de nada de lo anterior

Migración `0088_la_hora_de_recogida_la_valida_la_base.sql`. Dos piezas, y ninguna
vive dentro de las RPC: van en la tabla, que es por donde pasan todos los
caminos.

| Pieza | Qué sostiene | Cuándo |
| --- | --- | --- |
| `CHECK at_pickups_hora_en_franja` | Hora entre 08:00 y 17:00, múltiplo de 15, sin segundos | Siempre — no depende del reloj |
| `at_valida_momento_recogida()` + 2 triggers | Que el momento no haya pasado | Solo `cliente` y `asesor` |

El CHECK va **`NOT VALID`**: las filas ya guardadas no se revisan, así que una
recogida vieja con `07:40` no tumba el despliegue. La consulta para ver qué hay
fuera de rejilla, y el `validate constraint` para cerrarlo cuando esté limpio,
están escritos en la propia migración.

Al **CEDI no se le exige**. Un operario a veces registra una recogida que está
ocurriendo delante de él, o se pone al día con la del día anterior: bloquearlo
no protege nada y sí para la operación.

Son **dos triggers y no uno** porque en la cláusula `when` de un trigger de
`INSERT` no existe `old` (ni `tg_op`). El `when` del de `UPDATE` no es una
optimización: sin él, el mensajero que marca «completada» a las 6 p. m. una
recogida programada para las 8 a. m. se comería el error de «esa hora ya pasó»,
porque su `UPDATE` también toca la fila.

---

## Dónde vive cada cosa

| Necesitas | Está en |
| --- | --- |
| La franja (08:00–17:00) y el paso de 15 min, en la pantalla | `HORA_MIN`, `HORA_MAX`, `PASO_MINUTOS` en `recogidas/page.tsx` |
| Generar los turnos y escribirlos como se hablan | `turnosDelDia`, `etiquetaDeHora` en `src/lib/tiempo.ts` |
| El reloj de pared de Medellín, con minutos | `horaEnColombia` en `src/lib/tiempo.ts` |
| La misma franja, del lado de la base | `at_pickups_hora_en_franja` (migración `0088`) |
| Que el momento no haya pasado, del lado de la base | `at_valida_momento_recogida()` (migración `0088`) |
| Los textos que ve el comercio | `MSG_JORNADA_CERRADA` y `MSG_HORA_PASADA` en `recogidas/page.tsx` |

Los dos mensajes están escritos **palabra por palabra igual** en la pantalla y
en la migración. PostgREST entrega el texto de la excepción y la pantalla lo
pinta con `setError(error.message)`: si se escriben distinto, el comercio lee
dos versiones del mismo problema según por dónde le llegue.

---

## Lo que hay que saber antes de tocarlo

**La franja está en tres sitios.** `recogidas/page.tsx`, el CHECK y el trigger.
Cambiar el horario de atención son tres cambios y una migración nueva. Es el
precio de que la regla se sostenga aunque el navegador mienta; está anotado en
el `comment on column at_pickups.scheduled_time`.

**La cola offline puede chocar.** Un comercio sin señal encola
`solicitar_recogida` con la fecha y la hora congeladas en ese momento. Cuando
vuelve la señal, `sincronizar()` reenvía **los mismos argumentos**: si para
entonces la hora ya pasó, el trigger la rechaza y la acción queda marcada como
conflicto con el mensaje «La hora seleccionada ya pasó…». No se pierde nada y la
persona lo ve en el panel de pendientes, pero desde ahí solo puede descartarla y
volver a pedirla — no hay forma de corregir la hora sobre la acción encolada.

**Antes de este cambio, ese mismo reenvío creaba la recogida en silencio** con
una hora ya pasada. O sea que el conflicto es la mejora, no la regresión; lo que
queda pendiente es que el panel de pendientes deje reeditar en vez de solo
descartar.

---

## Tests

`tests/tiempo.test.ts` cubre `horaEnColombia`, `turnosDelDia` y `etiquetaDeHora`,
incluidos los tres bordes que costarían caros:

- la medianoche como `"00:00"` y no `"24:00"` — `"24:00" > "17:00"` en
  comparación de cadenas, y a las 00:10 el formulario habría dado la jornada por
  cerrada el día entero;
- el relleno con cero, del que depende que comparar cadenas sea válido;
- el mediodía como «12:00 p. m.» y no «0:00 p. m.».

Lo de la base **no tiene test todavía**. `tests/db/` existe y se salta solo
mientras no haya staging (ver `tests/db/README.md`); el día que lo haya, el
trigger y el CHECK son candidatos de primera para un `recogidas.test.ts`.
