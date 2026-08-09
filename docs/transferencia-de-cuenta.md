# Mover A Tiempo a la cuenta definitiva de Supabase

Ruta elegida: **transferir el proyecto**, no rehacerlo.

## Por qué transferir y no migrar

Rehacer el proyecto en una cuenta nueva significa mover a mano el esquema, los
datos, los 15 usuarios **con sus contraseñas**, los 39 archivos de
almacenamiento, las dos edge functions, las tareas cron y las variables de
Vercel. Cada uno de esos pasos es una oportunidad de que algo se quede atrás, y
el que más duele es el de las contraseñas: si se pierden, los 9 comercios tienen
que restablecerla el mismo día del cambio.

La transferencia mueve la **propiedad** del proyecto, no su contenido. El
proyecto sigue siendo el mismo: mismo ref `uhbtivaepyhwfdvtpfjq`, misma URL,
mismas llaves, mismos usuarios, mismos archivos.

Lo que eso implica en la práctica:

- **No hay que tocar Vercel.** `NEXT_PUBLIC_SUPABASE_URL` y la llave anónima no
  cambian.
- **Nadie restablece su contraseña.** Ni los comercios ni los mensajeros.
- **No hay ventana de caída.** La app sigue respondiendo durante la operación.
- **No hay que copiar archivos.** Las cédulas, los comprobantes de pago y las
  evidencias de entrega se quedan donde están.

## Antes de empezar

1. **Resuelve las facturas pendientes de la organización actual.** El panel ya
   avisa: *«paga tus facturas para evitar interrupciones en el servicio»*. Dos
   razones, y la segunda es la grave:
   - Supabase normalmente no deja transferir un proyecto con facturas abiertas.
   - Si el proyecto se suspende por mora a mitad de la operación, el problema
     deja de ser una molestia y pasa a ser riesgo de pérdida de datos.

2. **Crea la cuenta y la organización nuevas**, y asegúrate de quedar como
   *Owner* y de tener método de pago configurado ahí. Supabase exige que el
   destino pueda sostener el plan del proyecto.

3. Ten el correo de la cuenta nueva a mano: la transferencia se confirma desde
   ella.

## Los pasos

1. En el proyecto actual: **Project Settings → General → Transfer project**.
2. Elige la organización nueva como destino.
3. Confirma. Supabase pide aceptar desde el lado que recibe.
4. Comprueba que el proyecto aparece bajo la organización nueva y que el ref
   sigue siendo `uhbtivaepyhwfdvtpfjq`.

## Cómo saber que quedó bien

Este es el retrato del proyecto tomado **antes** de mover nada. Después de la
transferencia tiene que dar exactamente lo mismo; si algún número baja, algo se
quedó por el camino y hay que parar y mirar.

| Qué | Cuánto |
| --- | --- |
| Tablas | 28 |
| Funciones | 111 |
| Políticas RLS | 55 |
| Triggers | 15 |
| Índices | 77 |
| Enums | 12 |
| Extensiones | pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp |
| Tareas cron | at-limpiar-rate-limit, at-notificar-pendientes |
| Buckets | at-brand-logos, at-courier-docs, at-delivery-evidence, at-facility-docs, at-payment-receipts, evidencias |
| Archivos | 39 |
| Usuarios de auth | 15 |

Y los datos del negocio:

| Qué | Cuánto |
| --- | --- |
| Comercios | 9 |
| Perfiles | 15 |
| Pedidos | 28 |
| Recogidas | 14 |
| Facturas | 7 |
| Remesas de recaudo | 4 |
| Zonas | 5 |
| Tarifas por par de zonas | 25 |
| Productos | 12 |
| Destinatarios | 22 |

Prueba en vivo, que es la que de verdad importa:

```bash
curl -s https://atiempo-logistica.vercel.app/api/version
curl -s -o /dev/null -w '%{http_code}\n' https://atiempo-logistica.vercel.app/rastreo/ATL-100008
```

## Dos cosas que la transferencia NO arrastra

Son ajustes de la cuenta, no del proyecto, y hay que rehacerlos a mano:

1. **Las plantillas de correo.** Si ya pegaste la de
   `correos/confirmar-cuenta.html`, verifica que siga puesta después de mover.
2. **Los ajustes de Auth** que quedaron pendientes: protección contra
   contraseñas filtradas y límite de registros.

También sigue pendiente borrar el bucket vacío `evidencias` (Storage), que quedó
de la app de monitoreo industrial.

## Una consecuencia para el trabajo conmigo

Mi conexión con Supabase está autorizada contra la cuenta **actual**. Al pasar el
proyecto a una cuenta nueva es probable que pierda el acceso y deje de poder
aplicar migraciones o consultar la base.

Para devolvérmelo hay que volver a conectar el MCP de Supabase con la cuenta
nueva. Mientras tanto puedo seguir trabajando en el código, pero no en la base
de datos — conviene saberlo antes y no descubrirlo en mitad de un cambio.
