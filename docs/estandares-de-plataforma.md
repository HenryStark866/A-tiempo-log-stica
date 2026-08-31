# Estándares de plataforma

Diez frentes, y para cada uno: **la regla**, **dónde se hace cumplir sola** y
**qué se aceptó a sabiendas**.

> **Para quien llegue nuevo —persona o agente—: esto no es una lista de
> deseos.** Cada regla de aquí tiene un guardián: un test, un paso de CI, una
> política de la base o un comentario en el sitio donde se rompería. Una regla
> sin guardián se incumple en tres semanas y nadie se entera; si añades una,
> añade con qué se comprueba, o no la añadas.
>
> Y al revés: **si vas a saltarte una, escribe aquí por qué.** El apartado
> «aceptado a sabiendas» de cada frente vale tanto como la regla. Lo que no se
> puede es dejarlo a medias y sin decirlo.

Reparto con el resto de la documentación:

| Dónde | Qué |
| --- | --- |
| `CLAUDE.md` | dónde está cada cosa en el repo |
| **este archivo** | **cómo tiene que estar hecha** |
| la bóveda (`C:\Users\tabor\CLAUDE_CDH`) | por qué se decidió así, y qué pasó cada día |

---

## 1. Frontend comprimido y sin mapas de origen

**La regla.** El paquete que llega al navegador va minificado y comprimido, y
**nunca** lleva mapas de origen ni el comentario que apunta a ellos.

Un `.map` publicado es el código fuente entero servido en abierto. En esta app
eso enseña los nombres de las RPC, la forma de cada tabla y el orden en que se
comprueban los roles: el plano de la casa para quien quiera buscarle la vuelta
a RLS. No hace falta para depurar — los errores llegan a `/api/telemetria` con
el SHA del commit, y con ese SHA se reconstruye el mapa en local.

**Dónde se hace cumplir.**

- `next.config.ts` → `productionBrowserSourceMaps: false` y `compress: true`,
  escritos aunque sean el valor por omisión: un ajuste que solo existe por
  omisión se pierde en silencio al subir de versión.
- `scripts/verificar-paquete.mjs` → mira el **build de verdad**, no la
  configuración. Falla si aparece un `.map` o un `sourceMappingURL`.
- CI lo corre en cada cambio (`npm run paquete`, tras el build).

**El peso también se vigila.** El mismo script mide lo que descarga cualquiera
abra la pantalla que abra —la intersección de trozos de las 60 páginas— y avisa
si se pasa de 450 kB sin comprimir. **Hoy: 344 kB** (≈103 kB por el cable).
Es un aviso, no un fallo: engordar puede estar justificado, pasar sin enterarse
no.

**Aceptado a sabiendas.** El techo de peso solo avisa. Un fallo duro obligaría
a subirlo con prisa en medio de otra cosa, y así se acaba subiendo sin mirar.

---

## 2. Base de datos con RLS

**La regla.** **RLS es la única capa de autorización de esta app** (ADR-0001):
más de cincuenta archivos hablan con Supabase directo desde el navegador, con
la llave anónima, que es pública por diseño. Una política mal escrita no es un
fallo de permisos: es acceso abierto a los datos de diez comercios.

De ahí, tres reglas que no se negocian:

1. **Toda tabla `at_` nace con RLS activo.** Sin excepción.
2. **Una tabla con RLS y sin políticas está cerrada del todo**, y eso solo vale
   si es a propósito. Tiene que llevar su `comment on table` diciendo por qué,
   y estar en la lista blanca del test.
3. **Las funciones `security definer` comprueban el rol por dentro** y se
   revocan de `public`, `anon` y `authenticated` salvo que sean públicas de
   verdad. Una función nueva nace con `execute` para todo el mundo.

**Dónde se hace cumplir.**

- `tests/db/rls-cobertura.test.ts` → recorre el catálogo entero: ninguna tabla
  sin RLS, y las únicas sin políticas son las cinco de la lista blanca. Si
  mañana aparece una sexta, falla y obliga a decidir. Se apoya en
  `at_inventario_de_rls()` (migración 0108).
- `tests/db/rls.test.ts` → lo que ve de verdad un cliente con su sesión.
- `comment on table` de las cinco cerradas (migración 0106): el porqué viaja
  con la tabla, no en un documento que nadie relee.
- El *linter* de Supabase (`get_advisors`) tras **cada** cambio de esquema.

**Estado hoy: 33 tablas, 0 sin RLS, 5 sin políticas y las cinco a propósito.**

**Aceptado a sabiendas.**

- **106 funciones `security definer` ejecutables por `authenticated`.** Es el
  diseño, no un descuido: la lógica del negocio vive en Postgres y cada función
  comprueba el rol por dentro. Lo que hay que vigilar es que la comprobación
  esté, no que la función exista.
- **7 ejecutables por `anon`**, y las siete tienen que serlo: el rastreo por
  número y por token, los datos de pago, el registro de eventos de seguridad,
  el buscador de comercios del registro, las marcas de la portada y el semáforo
  `at_salud()`. Seis de las siete llevan freno (`at_limitar`, migración 0063);
  la excepción es `at_landing_brands`, que devuelve 24 nombres de comercios que
  pidieron salir en la portada y es `stable` — ponerle freno la volvería
  `volatile` y metería una escritura en cada carga de la portada a cambio de
  nada.
- **15 tablas con varias políticas permisivas para el mismo rol y acción.**
  Postgres las evalúa como un `OR`; fundirlas en una sola ahorraría un poco.
  No se hace: «el dueño administra sus sedes» y «ops administra sedes» se leen
  y se auditan por separado, y las tablas afectadas tienen entre 2 y 125 filas.
  **Revisar si alguna pasa de ~50.000 filas.**
- **`pg_net` instalado en el esquema `public`.** Lo instala Supabase y sus doce
  funciones viven en `net`. Moverlo rompería las llamadas de los crons a
  `net.http_post` a cambio de callar un aviso.
- **Protección de contraseñas filtradas: encendida el 2026-08-31** (Auth →
  Providers → Email). Es un interruptor del panel y no se puede poner por
  migración, así que su guardián es el *linter*: si el aviso
  `auth_leaked_password_protection` vuelve a aparecer, alguien la apagó.

---

## 3. Control de versiones

**La regla.**

- Rama única de verdad: `main`. Lo que está en `main` es lo que está publicado.
- **Commits en español, en indicativo, contando el efecto para quien usa la
  app**: «el CEDI recibe el lote de un escaneo», no «refactor de EscanerQR».
- **Autor siempre Henry**, aunque `gh` esté autenticado con otra cuenta:
  ```bash
  git -c user.name="Henry Taborda" -c user.email="henrytaborda57@gmail.com" commit -m "..."
  ```
- **Una migración aplicada no se edita jamás.** Se corrige con una nueva, con
  el siguiente número libre. Antes de numerar, mirar la carpeta: ya hubo una
  colisión (`0101`).
- **Nada de secretos en el repo.** `.env.local` está en `.gitignore` y los
  secretos viven en Vercel y en Supabase.

**Dónde se hace cumplir.** CI corre en cada `push` y cada PR;
`.github/pull_request_template.md` lleva la lista de comprobación.

**Aceptado a sabiendas.**

- **`main` no está protegida.** Henry empuja directo, y eso es coherente con
  trabajar solo. El precio: un commit puede estar sirviendo a los mensajeros
  mientras CI todavía compila. Se compensa por el otro extremo, con
  `post-despliegue.yml`. El día que se quiera cerrar del todo:
  ```bash
  gh api -X PUT repos/HenryStark866/A-tiempo-log-stica/branches/main/protection --input proteccion.json
  ```
  y a partir de ahí se trabaja por PR. **Es una decisión de Henry, no de un
  archivo.**
- **Sin etiquetas de versión.** La versión publicada es el SHA del commit
  (`next.config.ts` → `generateBuildId`), que no hay que acordarse de subir.
- **Tres ramas viejas en el remoto** (`mapa-3d`, `verificar-mapa`,
  `feat/ajustes-interfaz-y-roles`). Borrarlas es cosa de Henry.

---

## 4. APIs

**La regla.** Hay dos superficies y no se confunden:

| Superficie | Quién autoriza | Cuándo se usa |
| --- | --- | --- |
| **PostgREST/RPC**, desde el navegador | RLS y el rol dentro de la función | por omisión, para casi todo |
| **`/api/*` de Next**, en el servidor | el código de la ruta | cuando hace falta un **secreto** que no puede salir al navegador |

Si una pantalla puede hacerlo con una RPC, lo hace con una RPC. Una ruta de
Next solo se justifica cuando hay una llave de por medio (la del puente de
WhatsApp, la de Polar) o cuando quien llama es una máquina.

**Toda ruta `/api` cumple cuatro cosas:**

1. **Una sola forma de respuesta** — `src/lib/api/respuesta.ts`:
   `{ ok: true, ...datos }` o `{ ok: false, motivo }`. `motivo` en español y
   listo para enseñar en pantalla tal cual.
2. **Sin caché** — el helper pone `private, no-store` siempre. Estas
   respuestas llevan datos de una sesión concreta.
3. **Con freno** — `src/lib/api/freno.ts` (ver frente 7).
4. **Dice quién puede llamarla** en su comentario de cabecera, y lo comprueba.

**El cliente de Supabase que se usa dice quién es el que llama:**

| Archivo | Corre como | Cuándo |
| --- | --- | --- |
| `supabase/client.ts` | la persona, con RLS | en el navegador |
| `supabase/server.ts` | la persona, con RLS | RSC y acciones de servidor |
| `supabase/servicio.ts` | **se salta RLS entera** | **solo** cuando no hay persona detrás (webhooks) |

**Equivocarse aquí no da error, da cero filas.** El webhook de Polar usaba el
cliente de sesión: llegaba sin cookie, corría como `anon`, RLS bloqueaba el
`update`, y la ruta escribía «factura marcada como pagada» en el log mientras
la factura seguía pendiente. El comercio pagaba y la plataforma no se enteraba.
Por eso toda escritura con el cliente de servicio comprueba con `.select()` que
**de verdad cambió algo**.

**Aceptado a sabiendas.** `/api/whatsapp/enviar` devuelve **200 con
`ok: false`** cuando el puente no responde. No es un fallo de la aplicación:
la pantalla lo distingue y ofrece el envío manual.

---

## 5. Hosting

| Pieza | Dónde vive | Cuenta |
| --- | --- | --- |
| Front y rutas `/api` | Vercel, proyecto `atiempo-logistica` | scope `henry-stark-s-projects` |
| Base, Auth, Storage, *edge functions*, crons | Supabase `uhbtivaepyhwfdvtpfjq`, región **us-west-2** | compartido con TaxiYa (prefijo `at_`) |
| Puente de WhatsApp (OpenWA) | **todavía en ningún sitio** | ver «Lo que falta» |
| Dominio | `atiempologistica.com` | |

**La región no es un detalle.** La base está en Oregón y Vercel despliega por
omisión en Washington. Cada pantalla hace varias idas y vueltas a la base, así
que **la función tiene que estar cerca de la base, no del usuario**: el ahorro
se multiplica por consulta. `vercel.json` fija `sfo1` (San Francisco), que es
lo más cerca que llega Vercel de `us-west-2`.

> ⚠️ **Dos proyectos de Supabase ACTIVOS en la misma organización.** Este es
> `uhbtivaepyhwfdvtpfjq`; el otro (`pdxlmjlooeqlvvgbosbu`) es de IncubApp.
> **Confirmar el ref antes de cada `apply_migration` o `execute_sql`**: una
> migración en el proyecto equivocado toca los datos de otro negocio.

**Aceptado a sabiendas.** Base compartida con TaxiYa, separada por el prefijo
`at_` y por RLS. Fue una decisión de coste (US$10/mes por proyecto dedicado) y
está tomada a conciencia.

---

## 6. Despliegue

**La regla.** Push a `main` → Vercel publica. La versión publicada es el SHA
corto del commit, el mismo en el paquete del navegador y en el servidor: por
eso la app se entera sola de que hay una versión nueva y por eso se puede
comprobar desde fuera qué está publicado.

**Antes de cada despliegue**, en local:

```bash
npm run verificar
```

(tipos + lint + tests + build + revisión del paquete: lo mismo que CI, en el
mismo orden.)

**Dónde se hace cumplir.**

- `.github/workflows/ci.yml` — tipos, lint, tests, `npm audit`, build, paquete.
- `.github/workflows/post-despliegue.yml` — cuando Vercel dice que terminó,
  pregunta a la app **publicada**: que `/api/salud` responda y que
  `/api/version` diga **este** commit y no el anterior.

Ese segundo es el que tapa el agujero de verdad: **un despliegue que Vercel da
por bueno puede estar respondiendo 500 en todas las rutas.** Ya pasó — el
middleware reventaba al arrancar por una variable que faltaba en las vistas
previas, y costó media tarde encontrarlo.

**Cambiar una variable de entorno en Vercel exige volver a desplegar.** No se
recarga sola.

**Aceptado a sabiendas.** El despliegue no espera a CI (ver frente 3).
`post-despliegue.yml` avisa después, no impide antes.

---

## 7. Seguridad y límite de peticiones

**La regla: el freno va donde pasa el tráfico.** Y en esta app el tráfico
mayoritario **no pasa por nuestro servidor** — el navegador habla directo con
Supabase. Por eso el freno de verdad está en Postgres.

**Dos frenos, cada uno en su sitio:**

| | `at_limitar` (migración 0063) | `src/lib/api/freno.ts` |
| --- | --- | --- |
| Dónde | Postgres | el proceso de la función de Vercel |
| Qué cubre | **todo**, incluido lo que no pasa por Next | solo las rutas `/api` |
| Reparto | compartido de verdad | **por instancia**: repartido entre N instancias, el tope real es N veces |
| Para qué | enumeración de guías, raspado, inundar la base | proteger el **log** y la sesión de WhatsApp |

Que el segundo sea por instancia es una limitación real y está dicha en su
cabecera. Se eligió igual porque un contador en la base metería un viaje a
Oregón en cada reporte de error — o sea, castigar la ruta que existe para
enterarse de que algo va mal.

**Topes de hoy:** telemetría 60/min por IP · WhatsApp 12/min por persona ·
Polar 6/min por persona · salud 60/min por IP.

**El resto de la superficie:**

- **Cabeceras** en `next.config.ts` (estáticas) y `src/middleware.ts` (las que
  necesitan *nonce*). CSP estricta con `nonce` por petición y `strict-dynamic`,
  HSTS con `preload`, `frame-ancestors 'none'`, `Referrer-Policy` estricto
  —los tokens de rastreo y pago viajan en la URL—, y `Permissions-Policy` que
  abre cámara y ubicación **solo** al propio origen (las necesitan el escáner
  del CEDI y el mensajero).
- **La CSP avisa cuando bloquea** (`report-uri` → `/api/telemetria`). Se puso
  porque el mapa se quedó gris en producción y el único aviso salía en una
  consola que nadie mira.
- **`npm audit` en CI, en dos pasos.** `critical` **para la línea**; `high` se
  imprime pero no bloquea. Un check en rojo desde el primer día no es un check:
  es ruido que se aprende a ignorar, y el día del fallo de verdad tampoco se
  mira.
- **Secretos**: en Vercel y en Supabase. Nunca en el repo ni en la bóveda. El
  secreto del reloj vive **solo** en el vault y se comprueba preguntándole a la
  base (`at_cron_secreto_valido`, migración 0103) — la copia duplicada tuvo el
  cron de Shopify en 401 durante meses.
- **Antes de tocar seguridad, correr `/security-review`** sobre el diff.

**Aceptado a sabiendas.**

- **Cuatro avisos `high` de `npm audit` que no se van a arreglar hoy**
  (`sharp`, `postcss`, `nanoid`, vía `next`). Se quitan **solo** subiendo a
  Next 16, que es un cambio mayor. Se revisó uno por uno antes de decidir:
  - `sharp` (CVE-2026-33327/33328/35590/35591, libvips): explota procesando una
    imagen que manda un atacante. **Esta app no usa `next/image` en ningún
    sitio** — `sharp` está en el árbol pero nunca procesa nada.
  - `postcss` y `nanoid`: **solo en tiempo de compilación**, sobre nuestro
    propio CSS. Nada de fuera pasa por ahí.

  **Revisar cuando se planifique subir a Next 16**, o antes si alguna pantalla
  empieza a usar `next/image`, que es lo que cambiaría la primera conclusión.

---

## 8. Caché

**La regla: tres escalones, y cada archivo está en uno a propósito.**

| Qué | Cabecera | Por qué |
| --- | --- | --- |
| `/_next/static/**`, `/icons/**` | `immutable`, un año | el nombre lleva el hash: si cambia el contenido, cambia la URL |
| `/sw.js`, `/manifest.webmanifest` | `max-age=0, must-revalidate` | un service worker servido de caché es una app congelada |
| **todo `/api/*`** | `private, no-store` | llevan datos de una sesión concreta |

**En el navegador manda `public/sw.js`**, y su estrategia también es por tipo:

- **Primero la caché** para `/_next/static/**` — inmutable, no hay nada que
  revalidar.
- **Primero la red, con la caché de respaldo**, para las pantallas de campo
  (`/entregas`, `/recogidas`, `/cedi`, `/pedidos/nueva`, `/inicio`,
  `/conductor`): sin señal se abren igual, que es todo el sentido.
- **Teselas de mapa** guardadas con tope (`TOPE_TESELAS`), podando por orden
  de llegada.

**La trampa que ya se pagó:** al guardar una navegación hay que comprobar
`!res.redirected`. Sin eso, una sesión vencida cachea **la pantalla de login**
bajo `/entregas`, para siempre.

**El identificador de compilación es el SHA del commit**, así que dos
compilaciones del mismo commit sirven exactamente los mismos archivos y la
caché no se invalida sola sin motivo.

---

## 9. Escalabilidad

**La regla: lo que va a doler con volumen se arregla cuando la base está
vacía.** Con 3 guías cuesta milisegundos y no bloquea a nadie; con 50.000 y la
operación encima, es una ventana de mantenimiento.

**Lo hecho.**

- **Las políticas RLS no preguntan «quién eres» fila por fila** (migración
  0105). `user_id = auth.uid()` llama a `auth.uid()` una vez **por fila**;
  `user_id = (select auth.uid())` la resuelve una sola vez. Ocho políticas
  reescritas, incluida la de `at_profiles`, que es la tabla que lee toda
  pantalla. **Ojo:** en `at_settlements` hay un subconsulta que **sí** depende
  de la fila y se dejó tal cual — envolverla enseñaría los cierres de
  mensajeros de otra sede.
- **Índices para cuando crezca** (migración 0107). Nueve, no las 32 que señala
  el *linter*. El criterio, para la próxima vez:
  - **SÍ** si la tabla crece con la operación **y** alguien filtra por esa
    columna en una pantalla de verdad.
  - **NO** en columnas de auditoría (`created_by`, `verified_by`,
    `reviewed_by`…): existen para dejar constancia, nadie abre una pantalla que
    diga «todo lo que aprobó Fulano».
  - **NO** en tablas de configuración (`at_zones` 15 filas, `at_clients` 10):
    Postgres las lee enteras más rápido.

**El aviso de «recursos agotados» del 2026-08-31, y qué era.**

Supabase avisó de que el proyecto estaba agotando varios recursos. Medido con
`pg_stat_statements` —y esto es lo que hay que volver a hacer la próxima vez,
antes de tocar nada—:

| Qué | Cuánto | Veredicto |
| --- | --- | --- |
| **Tiempo real de Supabase** | **95,5 % del trabajo de la base AHORA**, 1,9 sondeos del WAL por segundo, 24/7, haya alguien o no. 7 de 23 conexiones y 2 ranuras de réplica | **sin resolver: es decisión de producto** |
| `at_dashboard_kpis()` | 115 ms de media, recorría `at_guides` **ocho veces** para pintar una pantalla | resuelto (0109): un solo recorrido |
| `at-enviar-mensajes` | una petición HTTP cada minuto para un buzón vacío | resuelto (0109): pregunta antes. De 60 s de *timeout* a **4,8 ms** |
| `cron.job_run_details` | 11.776 filas, 9,3 MB, **la segunda tabla más grande de la base**, sin purga | resuelto (0109): se guardan 7 días |
| Disco y ranuras de réplica | 37 MB, 176 bytes retenidos | sanos, no eran el problema |
| Instancia | Micro: 1 GB de RAM (`shared_buffers` 224 MB) | es el techo real |

**Lo que sigue pendiente y es lo gordo:** el tiempo real cuesta lo mismo a las
3 de la mañana sin nadie conectado que en hora punta, y lo paga por **una**
suscripción sobre dos tablas que en toda su historia han visto 236 cambios de
posición y 244 notificaciones. Las dos pantallas que lo usan (`/mapa` y la
campana) **ya recargan solas** con `setInterval`, así que apagarlo no pierde
ningún dato: pierde inmediatez. Por eso no se apaga desde una migración.

**Los límites que hay que tener presentes.**

- Los **crons de `pg_cron`** son de un solo hilo por trabajo. `at-enviar-mensajes`
  corre cada minuto y despacha lotes de 50; si un envío tarda más de un minuto,
  el siguiente espera.
- El **realtime** de Supabase tiene tope de conexiones simultáneas en el plan
  gratis. Cada pestaña abierta cuenta.
- Los **índices marcados «sin usar»** no se borran: «sin usar» hoy significa
  «la operación todavía no tiene volumen».

---

## 10. Monitoreo

**La regla: algo tiene que preguntar solo.** Los tres fallos del 2026-08-27
tenían todos la misma forma — llevaban semanas corriendo sin quejarse, no
rompían ninguna pantalla, y por eso nadie reclamó y nadie se enteró.

**Las tres capas.**

1. **`/api/salud`** — el semáforo. **200 si va, 503 si no**, para que `curl -f`
   baste. Sin sesión enseña solo el estado y la versión; el detalle (cola
   atrasada, crons fallidos) lo decide `at_salud()` según quién pregunte, y
   solo lo ve el staff. Se pone en rojo si hay mensajes pendientes de hace más
   de 15 minutos o si algún cron falló en la última hora.
2. **`.github/workflows/vigilancia.yml`** — pregunta cada 15 minutos y avisa
   fallando (GitHub manda correo). Su límite, dicho claro: GitHub **no**
   garantiza la puntualidad de los `schedule` y los desactiva a los 60 días sin
   actividad. Sirve para enterarse en menos de una hora, no en menos de un
   minuto.
3. **`/api/telemetria`** — donde aterrizan los errores del navegador y los
   avisos de CSP. Van a los Runtime Logs de Vercel; se buscan por `[yam]`.
   `src/lib/observabilidad.ts` es el **único** punto de salida: el día que se
   quiera Sentry, se enchufa ahí sin tocar ninguna pantalla.

**Lo que nunca sale en un log.** Ni tokens, ni la URL entera (los de rastreo y
pago van en la URL: por eso se registra `pathname` y no `href`), ni datos de
personas. `at_salud()` devuelve cuentas agregadas y nada más.

**Aceptado a sabiendas.** Sin Sentry. La telemetría propia costó cero
dependencias, cero cuentas nuevas y cero kilobytes en el teléfono del
mensajero, y resuelve el problema de hoy: dejar de estar ciegos.

---

## Lo que falta (y no depende del código)

| Qué | Quién | Por qué importa |
| --- | --- | --- |
| **Las cuatro variables de Polar en Vercel** (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID`, `NEXT_PUBLIC_APP_URL`) | Henry | **el cobro por Polar no funciona sin ellas**: hoy Production solo tiene las dos de Supabase y la llave de servicio. El checkout responde 500 y el webhook también |
| Puente de WhatsApp con URL pública | bloqueado | Oracle no da capacidad ARM y el paso a Pay As You Go pide 100 USD |
| 8 de 10 comercios sin medio de cobro | negocio | sin cuenta no hay a dónde girarles el contraentrega |
| Cero operarios dados de alta | negocio | |

---

## La rutina, en corto

**Antes de tocar nada:** leer `CLAUDE.md` (dónde está cada cosa) y la bóveda
(por qué es como es).

**Al cambiar el esquema:** migración nueva y numerada · `get_advisors` de
seguridad **y** de rendimiento · lo que se acepte a sabiendas, escrito aquí.

**Al tocar `/api`:** `respuesta.ts` para la forma, `freno.ts` para el tope, y
el cliente de Supabase que corresponda a **quién llama**.

**Antes de empujar:** `npm run verificar`.

**Al terminar la sesión:** actualizar la bóveda y añadir la línea del día a la
bitácora.
