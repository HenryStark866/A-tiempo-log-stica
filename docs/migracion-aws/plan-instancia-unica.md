# Plan — backend de YAM en UNA instancia de AWS (opción con créditos)

> **Estado: CREADA en AWS el 2026-10-19** (instancia `i-0ad88ff03708de9ba`, IP fija `34.199.160.189`, 24 recursos). Falta el DNS de `api` y probar con la web.
> Decisión de Henry (2026-10-18): Supabase Cloud queda descartado; el backend se
> arma en AWS desde el esquema local, **sin los datos de producción**. Pidió una
> opción gratuita y responsable; esta es la más cercana que encontré (no es
> gratis: la cubren los créditos de la cuenta durante ~4 meses).
> Código: `infra/aws/3-instancia/` (Terraform + paquete de la instancia).

## Qué es

Una sola máquina EC2 (`t4g.medium`, 2 vCPU, 4 GB, ARM) con Docker que corre la
pila abierta —Postgres, GoTrue, PostgREST, Realtime y Storage— detrás de Caddy
(TLS automático con Let's Encrypt). Son las mismas imágenes y versiones que
levantó `supabase start` en el staging local, contra las que pasan los 83 tests
de BD. El frontend solo cambia dos variables: `NEXT_PUBLIC_SUPABASE_URL`
(→ `https://api.atiempologistica.com`) y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

La web (Next.js) **sigue en Vercel**; este plan es solo el backend.

## Costo mensual (us-east-1, on-demand)

Precios consultados el 2026-10-18 a la **AWS Price List API** (la calculadora
web usa los mismos datos; no se pudo operar su interfaz desde aquí).

| Concepto | Cálculo | USD/mes |
|---|---|---|
| EC2 `t4g.medium` | 0,0336 × 730 h | 24,53 |
| EBS gp3, 50 GB (20 raíz + 30 datos) | 0,08 × 50 | 4,00 |
| IPv4 pública (la IP fija) | 0,005 × 730 h | 3,65 |
| Snapshots diarios, 7 retenidos | 0,05/GB-mes, incrementales; estimado | ~1,00 |
| S3 (dumps 35 días + archivos) | 0,023/GB-mes; estimado | ~0,50 |
| Métrica personalizada del respaldo | 0,30 | 0,30 |
| Alarmas (4) | dentro de las 10 gratuitas | 0 |
| Transferencia de salida | primeros 100 GB/mes gratis | 0 |
| **Total aproximado** | | **≈ 34** |

Con los **137,66 USD de créditos** que tiene la cuenta (plan `PAID`, verificado
con `aws freetier get-account-plan-state`) alcanza para **~4 meses**, si los
créditos no vencen antes: **la fecha de vencimiento no está en la CLI; hay que
mirarla en Billing → Credits** (las fuentes web dicen entre 6 y 12 meses).
Pasados los créditos son ~34 USD/mes a tarifa normal.

Riesgos de costo: `unlimited` en CPU cobra el exceso (0,05 USD por vCPU-hora)
si se sostiene por encima de la base; hay alarma. El aviso de presupuesto de
20 USD ya existe (`yam-mensual`).

Comparación con las otras opciones (cifras de la API, otra sesión): A completa
518,73 · B reducida 213,22 USD/mes.

## Respaldos y recuperación — lo que SÍ y lo que NO

| | |
|---|---|
| Snapshot diario del disco (DLM, 02:00 Medellín, 7 días) | Restaura toda la máquina de datos de un día |
| `pg_dump` **cada 6 horas** a S3 (21:00, 03:00, 09:00 y 15:00 Medellín) + archivos subidos | Restaura la base por separado; pérdida máxima de **6 h**; 35 días de dumps |
| S3 con versionado, cifrado, sin acceso público; la instancia **no puede borrar** respaldos | Un compromiso de la máquina no destruye el respaldo |
| Alarma `yam-respaldo-no-se-hizo` | Avisa si pasan 18 horas sin un respaldo completo (el fallo silencioso clásico) |
| Alarma de sistema con recuperación automática | Si cae el hardware, EC2 la reinicia en otro host (~5 min) |

**No hay:** alta disponibilidad (si la máquina cae, el servicio cae hasta que se
recupere), recuperación al minuto (el punto de recuperación es de **hasta 6 h**),
ni protección ante la caída de toda la región. **Hay que probar la
restauración** antes de producción y repetirla cada mes: un respaldo que nunca
se restauró es una suposición.

## Seguridad

- Solo 80 y 443 abiertos. **Sin SSH**: se entra por Session Manager (SSM), sin llaves.
- IMDSv2 obligatorio; discos cifrados; secretos generados en la máquina y
  guardados en SSM Parameter Store (`/yam/instancia/*`), nunca en Terraform ni
  en el repo. Una máquina reconstruida recupera las mismas llaves.
- Rol mínimo: escribir/leer en el bucket de respaldos, sus propios parámetros y
  una métrica. Nada más.
- **Menos protección que la pila grande:** no hay WAF ni límite de peticiones
  por IP (solo el freno de la migración 0063 y GoTrue). Si hace falta, un
  límite en Caddy o Cloudflare delante.

## Lo que se pierde al construir sin datos de producción (decidido por Henry)

17 cuentas con sus contraseñas, 9 comercios, 6 guías, 12 facturas, 1 remesa,
2.803 destinatarios y 70 archivos: **todo se rehace**. Además el esquema local
está incompleto frente a producción (143 de 150 funciones, 22 de 23 triggers,
falta el bucket `evidencias`) y 3 funciones (`at_evento_al_crear_pedido`, `at_franja_de_recogida`, `at_valida_hora_recogida`) que estaban como stubs vacíos y ahora están **reconstruidas** del repo (no son las originales; ver `staging-stubs/LEEME.md`). La encuesta de satisfacción (3 funciones) está reconstruida como diseño nuevo, y el frontend sigue llamando a 2 funciones que no existen en la base nueva: eliminar comercio y eliminar usuario (no se reconstruyen a propósito).

## Resultado de la prueba local (paso 0, hecho el 2026-10-18)

Se levantó la pila completa en Docker, desde cero, con los mismos archivos y el
mismo orden que usará la instancia (`infra/aws/3-instancia/prueba-local/`).
**Resultado: `test:db` 83 de 83 a través de Caddy y prueba de humo 8 de 8**
(registro, login, perfil por trigger, RLS, RPC, subir/leer/borrar archivo y
Realtime con ida y vuelta). Además un `pg_dump` de 895 KB se restauró en una
base nueva con las mismas 33 tablas, 143 funciones, 17 zonas y 5 buckets.

La prueba **encontró 4 fallos reales**, ya corregidos en el repo, que habrían
roto el primer arranque en AWS:

1. Los roles de servicio (`supabase_auth_admin`, `authenticator`,
   `supabase_storage_admin`) no tenían contraseña → GoTrue no arrancaba.
2. Realtime necesita su esquema `_realtime`, que nadie creaba.
3. Realtime v2.143.4 exige la variable `METRICS_JWT_SECRET`.
4. **CORS**: sin Kong, el login desde la web habría sido bloqueado por el
   navegador (GoTrue no contestaba el preflight, Storage daba 404). Ahora lo
   resuelve Caddy, solo para `atiempologistica.com`, `www` y la dirección de
   Vercel, sin cabeceras duplicadas.

Las 6 imágenes publican arm64 (la instancia es Graviton); la prueba corrió en x86.

**Lo que esta prueba NO cubre** (solo se ve en AWS): TLS real con Let's Encrypt,
SSM, systemd/timer del respaldo, subida a S3, DLM, montaje del disco EBS, el
user-data, el plugin de compose (versión fijada sin verificar) y el rendimiento
en una t4g.medium. Tampoco hay prueba de carga.

## Resultado de la prueba del frontend real (2026-10-19)

Se levantó la pila local con `prueba-local`, se lanzó la app Next.js en el puerto
3100 apuntada a `http://localhost:8080` (con el gateway de WhatsApp, Sentry y Polar
anulados para que nada saliera a servicios reales) y se recorrió **en el navegador**:

| Recorrido | Resultado |
|---|---|
| Registro de un cliente e-commerce | ✅ Se crea la cuenta, el perfil (`cliente`, activo) y su comercio |
| Login | ✅ Sesión emitida por GoTrue a través de Caddy; entra a Inicio como «Cliente e-commerce» |
| Pedido nuevo | ✅ Guía ATL-100001, zona asignada sola, tarifa de zona (13.000), QR y **hito «Creada» con el nombre de quien la creó** (la reconstrucción del trigger se ve bien en la pantalla) |
| Encuesta de satisfacción | ✅ Aparece (con la cuenta envejecida 10 días), se responde, se guarda con su comercio y se oculta 90 días |
| Subir un archivo | ✅ El logo queda en la carpeta del comercio del bucket `at-brand-logos`, la URL se guarda en su ficha y se lee sin sesión |
| CORS desde otro origen | ✅ El navegador (en `localhost:3100`) habla con la API sin bloqueo |

**Hallazgos**
- El cliente e-commerce queda **activo al registrarse**, sin aprobación (corrige lo dicho en la decisión 1).
- Con `autoconfirm`, la pantalla dice «Revisa tu correo… y entra de inmediato» pero **no llega ningún correo**: es engañoso. La persona puede ingresar ya.
- Tarifa del pedido de prueba: 13.000, de la zona asignada; coincide con el diseño (la tarifa de zona pisa el valor).

**Lo que esta prueba NO cubrió:** los buckets privados y sus URLs firmadas (documentos de
mensajeros, comprobantes de pago, evidencias de entrega; el bucket `evidencias` ni existe),
Realtime dentro de la interfaz, los flujos de mensajero, CEDI, facturación y recaudo, el
rastreo público, las funciones de eliminar (no existen), el rendimiento y todo lo propio de AWS.
## Estado real en AWS (2026-10-19)

Henry autorizó el `apply` con una condición: **gastar solo los créditos**. Se aplicó el plan
guardado (**24 recursos creados, 0 cambiados, 0 destruidos**) y se verificó en la máquina:

| Dato | Valor |
|---|---|
| Instancia | `i-0ad88ff03708de9ba`, `t4g.medium`, `us-east-1a`, entrada por Session Manager (sin SSH) |
| IP fija | `34.199.160.189` |
| Bucket de respaldos | `atl-yam-respaldos-126356678380` (paquete en `bootstrap/instancia.tgz`) |
| Pila | 6 contenedores arriba (db, auth, storage, rest, realtime, caddy); GoTrue v2.197.0 responde |
| Base | 33 tablas, 146 funciones (= staging), 5 buckets, 0 usuarios; esquema aplicado |
| Memoria | 3,8 GB totales, ~2,6 GB libres; swap de 2 GB activo; disco de datos de 30 GB montado en `/data` |
| Respaldo | corrido a mano una vez: dump de 898 KB en S3 y métrica `RespaldoExitoso` publicada. **La restauración todavía no se ha probado** |
| Snapshots | política `diario-02h-medellin`, activa, 7 retenidos |
| Alarmas | de la instancia en `OK`; presupuestos `yam-mensual` (20 USD) y **`yam-solo-creditos`** (avisa al pasar de 1 USD reales o prever 3) |
| DNS y certificado | ✅ **Hecho el 2026-10-19**: Henry inició sesión en GoDaddy y se creó el registro `A` de `api` → `34.199.160.189` (TTL 30 min; el resto de la zona intacto). Caddy sacó el certificado y `https://api.atiempologistica.com/auth/v1/health` responde 200 |
| Prueba contra la API real | ✅ 10/10 por HTTPS con una cuenta temporal (ya borrada): health, CORS permitido para `atiempologistica.com` y negado a un origen ajeno, registro, login, perfil por RLS, RPC, anónimo sin acceso, Realtime por `wss`. (La comprobación de Storage solo miró que respondiera; no cuenta como verificada) |

**Cómo se cumple «solo los créditos».** AWS no permite un tope duro de gasto. La garantía es una
alarma temprana: `yam-solo-creditos` mide el costo ya descontados los créditos, así que marca ~0
mientras alcancen y avisa por correo en cuanto se cobre dinero real (créditos al crear: 137,66 USD;
con ≈34 USD/mes duran ~4 meses). Los datos de facturación de AWS tardan hasta un día en actualizarse.
Si Henry prefiere que la máquina **se detenga sola** al pasar el umbral (en vez de solo avisar),
es posible con una acción de Budgets, pero el servicio quedaría caído hasta que alguien lo encienda.

**Falta, en este orden:** (1) con el visto bueno de Henry, poner `NEXT_PUBLIC_SUPABASE_URL`
(`https://api.atiempologistica.com`) y la clave anon en Vercel y redesplegar; (2) crear el primer admin,
repoblar zonas y tarifas; (3) probar la restauración de un dump en una base vacía; (4) los 5 registros
de correo de la fase 2 en GoDaddy, la salida del sandbox de SES y el usuario SMTP.
## Cambio en Vercel — EJECUTADO el 2026-10-19

**Resultado.** Henry autorizó el cambio y se hizo: `NEXT_PUBLIC_SUPABASE_URL` → `https://api.atiempologistica.com` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` → la clave pública de la instancia; **no** se copió la clave de servicio nueva.
`vercel redeploy` del despliegue `dpl_6GVNzK2nNYqjB7M9H1a9nbDGMBE3` (commit `cb0996b7`) creó el despliegue
`atiempo-logistica-98n7lvtpn` y quedó en `www.atiempologistica.com`. Verificado: `/api/salud` pasó de 503 a `ok: true`, la
política de seguridad del navegador ya permite `api.atiempologistica.com` y su `wss`, y en el navegador real (sin errores en
consola) se probaron registro, login e Inicio con una cuenta temporal ya borrada (la base quedó en 0 usuarios y 0 comercios).

**Desviación respecto a lo propuesto:** `vercel env update … production` cambió la variable **en los tres entornos**
(Production, Preview y Development), porque son una sola entrada compartida; no solo en Production. Es coherente (los tres
apuntan a la API nueva, que está viva; antes apuntaban al Supabase pausado). Los Preview siguen sin poder usar la API porque
su origen (`*.vercel.app` distinto del principal) no está en la lista de CORS.

**Rollback disponible:** `vercel rollback` al despliegue `atiempo-logistica-8zfmc2o3a` (el anterior). Vuelve exactamente a como
estaba, es decir, al Supabase pausado (roto).

(Lo que sigue es la propuesta original, que se conserva como referencia.)


**Proyecto:** `atiempo-logistica` (`prj_l3NrwEWskK0FsZR7IAUEvlAyJFBn`), equipo `henry-stark-s-projects`,
producción en `https://www.atiempologistica.com` (versión desplegada hoy: `cb0996b7`; `/api/salud` da 503
porque su base, el Supabase viejo, está pausada).

**Variables hoy (solo 3, todas cifradas):**

| Variable | Entornos | Qué hacer |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | **Production** → `https://api.atiempologistica.com` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | **Production** → la clave anon de la instancia (pública por diseño) |
| `SUPABASE_SERVICE_ROLE_KEY` | solo Production | **No copiar la nueva** (ver abajo); dejar la vieja inerte o borrarla |

La clave de servicio (que se salta RLS) solo la usa `src/app/api/polar/webhook/route.ts`, y en Vercel **no hay
variables de Polar**, así que esa ruta no funciona hoy de todos modos. Mover la llave más poderosa a un tercero
sin necesitarla no tiene sentido: se copia solo el día que se active Polar.

**El código no necesita cambios:** la política de seguridad de contenido del middleware se deriva de
`NEXT_PUBLIC_SUPABASE_URL` (incluido el `wss` de Realtime) y `next.config.ts` no fija ninguna URL de Supabase.

**Orden (el cambio solo se nota en el paso 3):**
1. Cambiar las dos variables `NEXT_PUBLIC_*` **solo en Production**. No afecta al sitio vivo: cada despliegue lleva
   su propia copia de las variables.
2. Los valores sensibles viajan por la entrada estándar de la CLI desde la instancia (SSM); **nunca se imprimen**.
3. `vercel redeploy` del despliegue de producción actual (mismo commit `cb0996b7`, ahora con las variables nuevas).
   Ese es el momento del cambio.
4. Verificar: `/api/version` y `/api/salud` (debe dar `ok`), registro y login en `www.atiempologistica.com`.

**Qué cambia para la gente:** las cuentas viejas no existen en la base nueva (vacía): todos tienen que registrarse de
nuevo; las sesiones viejas dejan de valer. El 503 de hoy ya impedía entrar.

**Volver atrás (en segundos, sin perder datos):**
- Si el despliegue nuevo falla: `vercel rollback <URL del despliegue anterior>` (Instant Rollback). Cada despliegue
  conserva sus variables, así que vuelve exactamente como estaba, sin tocar variables.
- Restaurar las variables (solo si hace falta): URL vieja `https://uhbtivaepyhwfdvtpfjq.supabase.co` y la clave anon
  vieja, que está en el `.env.local` del repo. La clave de servicio vieja no se puede recuperar, pero tampoco se usa.
- Ojo: volver atrás deja el sitio apuntando al Supabase pausado, o sea roto. No hay otro respaldo del backend viejo.

**Avisos:** (a) el proyecto `taxiya` de este mismo equipo usa el Supabase pausado compartido: su producción también
está caída y este plan no lo toca; (b) la máquina tiene una variable de entorno `VERCEL_TOKEN` inválida: la CLI solo
funciona quitándola en el proceso, y el conector de Vercel no ve este proyecto.
## Dominio nuevo de YAM: `yam.cdhmaker.com` (pedido de Henry, 2026-10-19)

- **Qué es:** el dominio de la web de YAM pasa a ser `yam.cdhmaker.com`. `atiempologistica.com` y `www` **se mantienen
  como alias** (los QR ya impresos apuntan a ellos). La API sigue en `api.atiempologistica.com` (decisión pendiente si
  también se mueve, p. ej. a `api.yam.cdhmaker.com`).
- **El código no cambia:** los QR y los enlaces de correo usan `window.location.origin`. Solo un texto de
  `MarcaDelComercio.tsx` menciona `atiempologistica.com` (cosmético).
- **Hecho (2026-10-19):** (1) el backend acepta el origen nuevo en CORS y GoTrue usa `https://yam.cdhmaker.com` como Site URL, con
  los dominios anteriores en la lista permitida; (2) Terraform tiene la variable `sitio` y valida sin cambios; (3) el dominio
  está agregado al proyecto de Vercel `atiempo-logistica`.
- **Falta:** el registro DNS en **Cloudflare** (el DNS de `cdhmaker.com`): `A · yam · 76.76.21.21`, **solo DNS (sin proxy)**.
  Cuando resuelva, Vercel emite el certificado solo y se prueba `https://yam.cdhmaker.com`.
## Hoja de ruta: el sistema contable (SolV) dentro de YAM, como POS para los comercios (pedido de Henry, 2026-10-19)

**Visión:** el sistema contable/financiero vivirá **dentro de YAM** y deberá servir para que los **comercios lo usen como
sistema POS** (punto de venta). **No hay nada construido todavía.** Lo que se sabe hoy: SolV (repo `HenryStark866/SolV`) es una
app web con Supabase y un plan de sistema financiero con Interledger/Rafiki; YAM ya tiene comercios, productos, destinatarios,
pedidos, facturación y recaudo.

**Preguntas abiertas antes de diseñar** (no se asumieron respuestas): qué hace el POS (ventas en mostrador, inventario, caja,
facturación electrónica DIAN, cuentas por cobrar); si funciona **sin conexión**; qué medios de pago acepta; si SolV se
reescribe sobre la base de YAM o se integra tal cual; y si habrá datos contables de otros comercios (aislamiento por comercio, RLS).

**Impacto en la infraestructura:** la instancia única (4 GB, sin alta disponibilidad, respaldo cada 6 h) está dimensionada para
logística, no para un POS con ventas continuas y dinero real. Un POS pide mayor disponibilidad y recuperación más fina; es lo que
justificaría revisar la Fase 2 (base gestionada) o añadir WAL continuo.
## Pasos, con puerta entre cada uno

| # | Paso | Puerta (qué debe cumplirse para seguir) |
|---|---|---|
| 0 | ✅ **HECHO (2026-10-18)** — Probar el compose en local con Docker, sin AWS (ver arriba) | 83/83 y humo 8/8. Frontend real probado en navegador el 2026-10-19 (ver abajo) |
| 1 | ✅ **Decisiones de Henry (2026-10-18)** — ver «Decisiones tomadas» abajo | Las 5 respondidas |
| 2 | `terraform plan` en `3-instancia/` con tus valores y revisarlo entero | Ya corrido en solo lectura (2026-10-18): **23 a crear, 0 a cambiar, 0 a destruir**; debe seguir igual con tus valores |
| 3 | ✅ **HECHO (2026-10-19)** — Sí explícito de Henry con la cifra delante → `terraform apply` | `terraform output` completo |
| 4 | ✅ **HECHO (2026-10-19)** — Subir el paquete: `bootstrap/instancia.tgz` al bucket (compose, Caddyfile, scripts, migraciones + stubs) | La instancia lo recoge sola (hasta 60 min) |
| 5 | Registro A `api` en **GoDaddy** hacia la IP fija (los NS siguen allá; sin esto Let's Encrypt no puede emitir el certificado) | `curl -I https://api.atiempologistica.com/auth/v1/health` → 200 |
| 6 | Leer la clave anon (`aws ssm start-session` → `/opt/yam/.env`) y ponerla en Vercel junto con la URL; redesplegar | Registro y login funcionan |
| 7 | **Prueba de restauración**: restaurar el último dump en una base vacía y comparar con `scripts/retrato.sql` | Retrato igual |
| 8 | Crear el primer admin, repoblar zonas/tarifas y reescribir los 3 stubs | Hecho antes de operar con dinero |

## Vuelta atrás

`terraform destroy` está bloqueado a propósito para el disco de datos y el
bucket (`prevent_destroy`): hay que quitar esa línea a mano. La web sigue en
Vercel; para volver basta devolver las dos variables. Sin Supabase Cloud no hay
a dónde volver para los datos, por eso el respaldo importa.

## Decisiones tomadas por Henry (2026-10-18)

| # | Tema | Decisión | Qué implica en el código/operación |
|---|---|---|---|
| 1 | Correo de confirmación | **Dos fases.** Salir con autoconfirmar; arreglar SES en paralelo y luego pasar a confirmación real | `bootstrap.sh` arranca con `mailer_autoconfirm=true`. **Corrección tras probar el frontend (2026-10-19):** el cliente e-commerce **no** queda pendiente: nace activo, con rol `cliente` y su comercio creado, sin que nadie lo apruebe. Solo los demás roles (mensajero, personal ATL, asesor, CEDI) están pensados para pasar por aprobación (no probado). Además, la pantalla de registro dice «Revisa tu correo y entra» aunque la cuenta ya está confirmada. **Henry reconfirmó (2026-10-19) salir con autoconfirmar sabiendo esto:** acepta que el registro de cliente e-commerce quede abierto y activo hasta que SES funcione. Para la fase 2: cargar `smtp_*` en SSM, poner `mailer_autoconfirm=false` y repetir el bootstrap |
| 2 | Tamaño | **`t4g.medium`** (4 GB) + 2 GB de swap; medir la memoria la primera semana y subir a `t4g.large` si aprieta | Swap creado en `user_data.sh.tpl`. Sigue sin haber alarma de memoria (haría falta el agente de CloudWatch) |
| 3 | Créditos | **Asumir 6 meses** de vigencia y **re-verificar al tercer mes** (~2027-01-18) en Billing → Credits | Runway ≈ 4 meses al gasto previsto. Quedan 3 tareas de 20 USD (EC2, Bedrock, Aurora/RDS) que podrían sumar crédito; no se harán solo por eso |
| 4 | DNS | **Registros puntuales en GoDaddy**; los NS no se mueven | Ver la lista de abajo. La zona de Route 53 queda como respaldo, no manda |
| 5 | Riesgo de pérdida | **`pg_dump` cada 6 horas** | Pérdida máxima de 6 h. Sigue sin cubrir la caída de toda la región (el S3 está en la misma) ni la recuperación al minuto (WAL continuo queda como segunda etapa) |

### Registros en GoDaddy (el `A` de `api` ya está creado, 2026-10-19; quedan 5 del correo, no 7)

| Tipo | Nombre | Valor |
|---|---|---|
| A | `api` | *(la IP fija: sale de `terraform output ip_publica`)* |
| CNAME | `7tucgu4rdjhy66oe4f4znqxe5v4vzbtg._domainkey` | `7tucgu4rdjhy66oe4f4znqxe5v4vzbtg.dkim.amazonses.com` |
| CNAME | `abutx3m3z3ap3vh6g4sarat6ewnme4ae._domainkey` | `abutx3m3z3ap3vh6g4sarat6ewnme4ae.dkim.amazonses.com` |
| CNAME | `h6c3ik3vfgd2kqy6r6incxoi4naknehn._domainkey` | `h6c3ik3vfgd2kqy6r6incxoi4naknehn.dkim.amazonses.com` |
| MX | `correo` | `10 feedback-smtp.us-east-1.amazonses.com` |
| TXT | `correo` | `v=spf1 include:amazonses.com ~all` |
| ~~TXT~~ | ~~`_dmarc`~~ | **No crear:** GoDaddy ya tiene uno por defecto (`p=quarantine`, más estricto que el nuestro). Corrección: la lista original contaba 7 filas y yo había dicho 8 |

El `A` de `api` es lo único necesario para salir (sin él Let's Encrypt no emite
el certificado). Los otros cinco son la fase 2 del correo: sin ellos SES no
verifica el dominio. En el momento de verificar, SES sigue en sandbox: hay que
pedir además la salida a producción (revisión de AWS).

### Lo que sigue pendiente

- ~~Reescribir los 3 stubs de funciones~~ **Hecho (2026-10-18)**: reconstruidas a partir del repo, con 17 tests nuevos (`test:db` 100/100). Es una reconstrucción, no lo original: ver `staging-stubs/LEEME.md` para lo confirmado y lo supuesto.
- La **encuesta de satisfacción** (3 funciones y 2 tablas) quedó reconstruida como **diseño nuevo** sobre pistas del repo (`01087_staging_encuesta.sql`, 17 tests): el umbral de 7 días y los plazos de 30 y 90 días son decisiones mías.
- **Faltan 2 funciones que el frontend sí llama**: eliminar comercio y eliminar usuario desde administración. **No se reconstruyen a propósito** (la de comercio borraba pedidos, facturas y recaudo en cascada a mano); fallan cerrado, y el interruptor `active` del comercio desactiva sin borrar.
- ~~Verificar la versión fijada del plugin de compose (2.29.7)~~ **Verificada (2026-10-19)**: la release v2.29.7 existe (20-sep-2024, estable) y publica `docker-compose-linux-aarch64` y su `.sha256`, que es lo que descarga el user-data.
- **El sí explícito de Henry para el `apply`**, con la cifra (≈ 34 USD/mes) delante.