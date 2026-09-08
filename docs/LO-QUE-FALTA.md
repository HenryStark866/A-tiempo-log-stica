# Lo que falta, y por qué me toca a mí

Estado al cierre del 2026-08-16. Cerrado del todo el 2026-08-24 desde `C:\dev`.

## 1 y 2 · Hechos: commits, push, y las tres migraciones en Supabase

Lo que el cierre del 16 de agosto dejó pendiente por un `.git` de solo
lectura en aquel entorno ya está resuelto — `C:\dev` no tiene ese problema.
Commiteado, pusheado a `origin/main` y desplegado en producción (Vercel
despliega solo al hacer push).

Las migraciones `0090` (precio del CSV), `0091` (documentos del mensajero
nuevo) y `0092` (rótulo: «Atendido por» + código de seguimiento en texto) ya
están aplicadas en el proyecto `uhbtivaepyhwfdvtpfjq` de Supabase — el
compartido con TaxiYa. Se corrieron desde el SQL Editor del dashboard, con
sesión iniciada por Henry, y se verificaron en vivo después de aplicarlas:
`at_parse_money('89900,00')` devuelve `89900.00`, no `8990000`; las tres
funciones (`at_parse_money`, `at_register_courier_doc`, `at_label_data`)
existen en `pg_proc`.

No hay `service_role key` ni CLI de Supabase enlazado en este entorno — por
eso se aplicaron a mano por el editor SQL en vez de con `supabase db push`.
Si en algún momento se enlaza el CLI, reaplicar estas tres migraciones es
inofensivo: todas usan `create or replace` / `if not exists`, están escritas
para poder correr dos veces sin romper nada.

## 3 · Subir el archivo real que falló hoy

Es **la única prueba que cierra el incidente**. Que entre completo.

Si vuelve a fallar, ahora sí queda registro: busca `[yam]` en los Runtime Logs
de Vercel. Los tres puntos de fallo de la importación reportan telemetría.

> **Por qué no lo hago yo:** no tengo el archivo ni acceso a la cuenta del
> comercio.

---

## Después, sin prisa

| Qué | Por qué importa | Bloqueado en |
| --- | --- | --- |
| El dominio `atiempologistica.com` | `docs/paso-a-paso-dominio.md`, desde el paso 2. Falta la IP de Vercel en `terraform.tfvars` | Panel de Vercel + tu registrador |
| **Staging** (`npx supabase start` + `db reset`) | Enciende los **43 tests de base** que están escritos y esperando. Y dirá si las 78 migraciones aplican desde cero | Docker |
| `AT_CRON_SECRET` en Supabase | Los pedidos de Shopify **no entran solos**: la función responde 401 | Panel de Supabase |
| Decidir lo de la evidencia de entrega | Hoy solo se exige en contraentrega; el README promete que siempre | Decisión tuya |
| Subir la organización de Supabase a Pro | En Free no hay respaldos diarios y el proyecto se pausa | Tu tarjeta |

---

## Lo que quedó hecho y verificado

**El incidente de hoy.** La importación de la base de compradores fallaba porque
el payload llevaba todas las columnas sin mapear del archivo en un campo que
`at_recipients` no tiene. Un export de e-commerce trae 50-70 columnas y el mapeo
usa seis. Arreglado, con lotes por peso del JSON, el bucle de productos ya no se
traga los errores, y una importación a medias dice cuántas entraron.

**63 tests unitarios pasando**, verificados ejecutándolos. Zonas y tarifas, hora
de Medellín, formato de dinero, ordenamiento de ruta, marca, y 13 nuevos de
importación — uno de ellos fija que el payload no vuelva a crecer con columnas
que no se mapean.

**43 tests contra la base**, escritos leyendo el SQL real de las migraciones:
RLS por rol, máquina de estados, cobro, recaudo contraentrega y catálogo. Se
saltan solos hasta que haya staging.

**Observabilidad sin dependencias**: errores del navegador y avisos de CSP a los
Runtime Logs de Vercel. Habría cazado el mapa gris el primer día.

**CI** en GitHub Actions. **Dos pilas de Terraform** para AWS. El repo **fuera
de OneDrive**, que causaba los candados de git. Y **25 notas de memoria** en la
bóveda de Obsidian.

Tres bugs reales encontrados y corregidos: el payload de la importación, el
precio multiplicado por cien, y un regex con caracteres invisibles en
`normalizarBusqueda`. Más dos discrepancias entre el README y el código que
nadie había visto — están en `docs/traspaso-claude-code-2026-08-16.md`.


---

# Cierre del 2026-08-24 (tarde)

Lo de arriba sigue vigente. Esto es lo que se cerró y lo que quedó abierto en la
sesión de la tarde, cuando *collar accesorios* pasó a ser el primer cliente real
en producción.

## Lo que quedó funcionando

**El flujo completo, probado de punta a punta** contra la base real y deshecho
con savepoints — sin dejar un solo pedido de prueba. Los siete pasos: la asesora
crea el pedido (zona MED-CO, $13.500), pide la recogida, el CEDI asigna
mensajero, el mensajero recoge, el CEDI recibe y zonifica, sale a ruta y
entrega. Al final: $80.000 por girar, $13.500 de flete y 6 eventos de
trazabilidad.

**Cada quien ve solo lo suyo**, verificado suplantando usuarios reales contra el
RLS (no leyendo el código): el asesor ve los pedidos de su comercio y CERO
facturas, medios de cobro y liquidaciones; un comercio no ve ni un dato de otro;
el admin lo ve todo.

**Bugs encontrados y corregidos**, todos en producción:

| Qué estaba roto | Desde cuándo |
| --- | --- |
| Editar ítems de factura llamaba a dos funciones que no existían (migración 0055 nunca aplicada) | siempre |
| Un asesor aprobado por el admin nacía sin comercio, y sin comercio no ve nada | le pasó a 2 personas |
| Un pedido sin zona se facturaba en CERO, sin error ni aviso | siempre, por cualquier vía que no fuera la pantalla |
| `at_comercios_sin_zona` exponía nombre, dirección y teléfono de todos los comercios a `anon` | desde la 0056 |
| El CEDI podía dar recogidas por recibidas sin tocar una guía (0033 nunca aplicada) | siempre |
| Ningún comercio nacía con sede principal | siempre |

## Lo que falta, y en qué está bloqueado

| Qué | Por qué importa | Bloqueado en |
| --- | --- | --- |
| **Medio de cobro de *collar accesorios*** | **Sin número de cuenta no hay a dónde girarles el contraentrega.** Es lo más urgente de la lista | Que ellos lo registren en Mi perfil → Mi comercio |
| `OPENWA_API_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_NAME` en Vercel | Sin ellas el botón «Enviar» del código avisa de que el puente no está configurado | Falta una URL **pública** del gateway (túnel o VPS). `localhost` no sirve desde Vercel |
| Probar el envío automático | El pedido **ATL-100163** está creado, con su código encolado al 3196070176, esperando | Que el gateway OpenWA esté encendido |
| Logo de *collar accesorios* | El rótulo sale sin marca. El sistema ya lo soporta | No tengo el archivo, y el bucket solo acepta escrituras con sesión del propio comercio |
| Tres sedes sin dirección | Se crearon con los datos que el comercio tenía, y esos tres no la tienen registrada | Que cada comercio complete sus datos |

## Las tarifas: zanjado el 2026-08-27

La migración **0089** cambió de cinco zonas a diez subzonas, y no fue solo un
cambio de nombres: **movió precios hasta ±$1.500 por envío**. El Poblado pasó
de $12.500 a $14.000; el Centro, de $15.000 a $13.500; Popular y Manrique, de
$15.000 a $16.500; Copacabana, de $22.000 a $21.000.

Estuvo un tiempo marcado como duda porque el comentario de la propia migración
admitía que las subzonas eran «geografía inferida, no dato de la operación», y
nadie había confirmado cuál lista se cobraba de verdad.

**Henry lo confirmó: la buena es la actual, con los precios actuales.** Las diez
subzonas activas son las que cobra la operación. No hay nada que revertir.

Las cinco viejas siguen en la tabla, desactivadas y con el `sort_order`
desplazado 90 posiciones. Se quedan como historial; no estorban porque
`active = false` las saca de todo. Si alguien las ve y le extraña, es esto.

## Higiene del proceso

Las migraciones **0090, 0091 y 0092 están en la base pero NO en
`supabase_migrations`**: se aplicaron desde el editor SQL en vez de por
`apply_migration`, así que sus funciones existen y funcionan —verificadas una a
una— pero el historial no las registra. Quien audite el historial va a creer que
faltan. Conviene aplicar siempre por `apply_migration` para que el registro no
mienta.
