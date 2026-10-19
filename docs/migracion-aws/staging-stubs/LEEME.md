# Reconstrucciones y parches de la pila nueva (2026-10-18)

`supabase start` sobre `supabase/migrations/` falla porque producción tiene objetos
que ninguna migración crea (se hicieron desde el panel / SQL editor). Estos
archivos NO van a `supabase/migrations/`: son lo que se aplica **además** de las
migraciones para que la base nueva arranque. El proyecto de producción está pausado
y no se puede leer, así que lo que sigue se reconstruyó de la evidencia del repo.

Uso: copiar `supabase/` (config.toml + migrations) a una carpeta de trabajo, añadir
estos `.sql` a su `migrations/` y correr `npx supabase start` desde ahí. La pila de
la instancia única los recibe en `instancia.tgz`.

| Archivo | Qué hace |
| --- | --- |
| `0000_staging_stubs.sql` | 3 funciones **reconstruidas** + 2 tablas de encuestas **vacías** (stubs). Va antes de la 0100, que les hace REVOKE/GRANT |
| `01085_staging_realtime.sql` | `at_notifications` en la publicación `supabase_realtime` (la 0110 la quita) |
| `01086_staging_trigger_evento_pedido.sql` | El trigger que llama a `at_evento_al_crear_pedido()` |
| `01087_staging_encuesta.sql` | **Diseño nuevo** de la encuesta de satisfacción: columnas, claves foráneas y 3 funciones |

## Las 3 funciones: qué es dato y qué es suposición

### `at_valida_hora_recogida(time)` — reconstruida

| Dato (confirmado en el repo) | Dónde |
| --- | --- |
| La firma es `(time)` | `0100`, líneas 55 y 60 |
| La llama `at_request_pickup` con `PERFORM`, así que no devuelve nada que se use | `0099`, línea 64 |
| Acepta `NULL` («sin preferencia») | `docs/hora-de-recogida.md` |
| La regla: 08:00 a 17:00 inclusive, turnos de 15 min, sin segundos | CHECK `at_pickups_hora_en_franja`, `0088` |
| Solo recibe la hora, no la fecha: **no puede** decidir si «ya pasó» (eso es del trigger `at_valida_momento_recogida`) | por la firma |

| Suposición | |
| --- | --- |
| El texto del mensaje («La hora de recogida debe estar entre las 8:00 a. m. y las 5:00 p. m., en turnos de 15 minutos.») y el código `check_violation` | Los mensajes de la 0088 son otros; este no aparece en el repo |
| Que se ejecute como `stable`, sin `security definer` | Es una validación pura |

### `at_franja_de_recogida()` — reconstruida

| Dato | Dónde |
| --- | --- |
| La firma es `()` y tiene `GRANT` a `authenticated` (es un auxiliar con sesión, como `at_estoy_activo`) | `0100`, líneas 54 y 59 |
| La franja y el paso | Los mismos valores del CHECK de la 0088 |

| Suposición | |
| --- | --- |
| **La forma del resultado** (`hora_inicio`, `hora_fin`, `paso_minutos`) y que `at_valida_hora_recogida` la consuma | Nada del repo la llama. La pantalla tiene su propia copia (`HORA_MIN`, `HORA_MAX`, `PASO_MINUTOS`) |

### `at_evento_al_crear_pedido()` + trigger — reconstruidos

| Dato | Dónde |
| --- | --- |
| Es función de trigger y escribe el hito «creado» del pedido | Comentario en `src/app/(plataforma)/pedidos/[id]/page.tsx`, ~línea 512 |
| La tabla es `at_guide_events (guide_id, status, note, actor_id)` y la pantalla pinta `GUIDE_STATUS_LABELS[status]` | `0001`, línea 112; la misma pantalla |
| Ninguna RPC inserta ese hito, así que el trigger no duplica nada | Búsqueda en todas las migraciones |
| Tiene que ser `security definer` (quien crea la guía no puede escribir en `at_guide_events`) y `AFTER INSERT` (la clave foránea exige que la guía ya exista) | Esquema y RLS |
| Producción tiene **un trigger más** (23) que las migraciones (22); con este, el staging da 23 | `retrato.sql` |

| Suposición | |
| --- | --- |
| El **nombre** del trigger (`at_guides_evento_al_crear`): el real se desconoce | |
| La nota vacía; el actor = `auth.uid()` o, sin sesión, `created_by`; el estado del hito = el estado inicial de la guía | Ninguna evidencia fuerte; es lo que hacen las otras inserciones en `at_guide_events` |
| Que el trigger que falta en producción sea realmente este: el conteo coincide, pero no es una prueba | |

Los tests que fijan esto están en `tests/db/recogidas-y-eventos.test.ts`; marcan
cada expectativa como dato o suposición. Verificado por mutación: con las funciones
vacías y sin el trigger fallan 10 de sus 17 tests.

## La encuesta de satisfacción (3 funciones y 2 tablas) — diseño nuevo, no recuperación

Aquí hay **mucho más diseño que en las otras tres**: el repo da la forma de las
llamadas y unas reglas de negocio sueltas, pero no las columnas ni los plazos.
Todo está en `01087_staging_encuesta.sql`, con cada decisión marcada DATO o DISEÑO.

| Dato (confirmado en el repo) | Dónde |
| --- | --- |
| `at_encuesta_pendiente()` sin argumentos, devuelve un objeto con la clave `mostrar` | `EncuestaSatisfaccion.tsx` |
| `at_responder_encuesta(p_recomienda, p_facilidad, p_comentario, p_version)`; recomendación 0–10 obligatoria, facilidad 1–5 y comentario opcionales | el mismo componente |
| `at_posponer_encuesta(p_dias)`, llamada con 30 | el mismo componente |
| No aparece los primeros días; quien la cierra no la ve en un mes; quien responde, en tres | comentario del componente |
| La tabla de respuestas tiene `user_id` y `client_id`; la política «cada quien ve lo suyo, ops ve todo» compara `user_id` con `auth.uid()` | `0105`, `0107` |
| La tabla de aplazamientos guarda a quién y hasta cuándo, y **no tiene políticas** (se escribe desde la función) | `0106` |

| Diseño mío (producción pudo hacerlo distinto) | |
| --- | --- |
| «Los primeros días» = **7 días** desde que se creó la cuenta | el repo no dice cuántos |
| «Un mes» = 30 días (el componente lo manda) y «tres meses» = **90 días** | |
| Los **nombres y tipos** de las columnas: `recomienda`, `facilidad`, `comentario`, `version` (salen de los nombres de los parámetros) y `snoozed_until` | el repo solo confirma `user_id` y `client_id` |
| Claves foráneas con `SET NULL` (la respuesta queda anónima si se borra la persona o el comercio) y `CASCADE` en el aplazamiento | |
| No se muestra ni se acepta respuesta de cuentas `pendiente` o inactivas | |
| El comentario se recorta, vale `NULL` si queda vacío y tiene un tope de 2.000 caracteres; la versión se recorta a 64 | |
| `posponer` acota los días entre 1 y 365 | |
| Los textos de error y el código `check_violation` | |
| Permiso solo para `authenticated` | igual que los auxiliares de la `0100` |

Los tests están en `tests/db/encuesta.test.ts` (17), con cada expectativa marcada.
Verificado por mutación: con las funciones rotas fallan 9.

## Lo que sigue faltando: las 2 funciones de eliminar (NO se reconstruyen)

| Función | La llama | Por qué no |
| --- | --- | --- |
| `at_admin_eliminar_comercio(p_id, p_confirmacion, p_motivo)` | `clientes/page.tsx` | **Riesgo alto.** Pedidos, facturas y remesas tienen una clave foránea que *impide* borrar el comercio, así que la original los borraba a mano en un orden y con un alcance que el repo no muestra (cierres, pagos, archivos de los buckets, dónde dejaba el motivo). Un error borra de más y no hay deshacer. Además toca facturas: conviene confirmar con contabilidad qué se puede borrar |
| `at_admin_eliminar_usuario(p_id, p_motivo)` | `usuarios/page.tsx` | **Riesgo medio.** Borra la cuenta de acceso (`auth.users`); hay tres claves foráneas `NO ACTION` (`verified_by`, `reviewed_by`, `connected_by`) que la original debía resolver; y un error de permisos dejaría borrar usuarios a quien no debe o dejar el sistema sin admin |

**Mientras no existan, fallan cerrado:** el botón muestra el error de «función no
encontrada» y no se borra nada. Alternativa que ya existe: el interruptor `active`
del formulario del comercio, que desactiva sin borrar.
## Retrato del staging con esto aplicado

tablas 33 = 33 · índices 100 = 100 · enums 12 = 12 · cron 5 = 5 · **triggers 23 = 23**;
funciones 146 contra 150, políticas 63 contra 62, bucket `evidencias` ausente.
