# Migración a AWS — por dónde vamos

> Este archivo es **el estado vivo** del plan de `plan-maestro.md`. Se actualiza
> al cerrar cada paso. Un `[x]` significa **verificado**, no «escrito» ni
> «intentado». Si un paso se hizo a medias, va `[~]` con una línea de qué falta.
>
> **Al terminar una sesión de trabajo sobre esto:** marcar lo que cambió aquí y
> añadir la línea del día a la bitácora de la bóveda (`40 Bitácora/`).

**Fase actual: 0 — Red de seguridad**
**Última actualización: 2026-10-18 — Docker instalado; 0.1 ya no está bloqueado: el staging arranca pero falla en la migración 0100 (falta baseline de producción); Fase 1 ya estaba aplicada**

> **2026-10-18 (verificado contra AWS, solo lectura).** Cuenta `126356678380`, usuario `henry-terraform`, `us-east-1`.
> - Fase 1 está **aplicada desde 2026-08-17**: estado `s3://atl-terraform-estado/yam/1-hibrido.tfstate`, zona Route 53 `atiempologistica.com`, SES (identidad del dominio), CloudFront `E1U307A1V4FDED`, bucket `atl-yam-logos-marca`, Lambda `yam-shopify-sync`, regla `yam-shopify-cada-15-min` ENABLED, secreto `yam/shopify-reloj`.
> - Fase 2 **no** aplicada: no hay ECS ni Aurora. `terraform validate` OK y `plan` = **101 a crear, 0 a destruir** (sin aplicar, a petición de Henry).
> - El dominio **sigue en GoDaddy** (`ns29/ns30.domaincontrol.com`) y resuelve a Vercel (`216.198.79.1`): el paso 1.4 está pendiente.

---

## Retrato-control

El de referencia, contra el que se compara después de cada corte. `scripts/retrato.sql`
corrido contra producción (`uhbtivaepyhwfdvtpfjq`) el **2026-09-08**:

```
tablas            33        funciones      150        politicas         62   (public + storage)
triggers          23        indices        100        enums             12
usuarios_auth     17        archivos        70
extensiones       pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql,
                  supabase_vault, uuid-ossp
cron              at-cuota-saas, at-enviar-mensajes, at-limpiar-registros,
                  at-notificar-pendientes, at-shopify         (5 jobs)
buckets           at-brand-logos, at-courier-docs, at-delivery-evidence,
                  at-facility-docs, at-payment-receipts, evidencias   (6)

datos   comercios 10 · perfiles 17 · pedidos 6 · eventos 23 · recogidas 9 ·
        facturas 12 · remesas 1 · zonas 15 (10 activas) · tarifas_par 125 ·
        productos 5 · destinatarios 2803

perfiles por rol: 1 admin · 3 asesor · 11 cliente · 2 mensajero · 0 CEDI · 0 comprador
migraciones registradas en la nube: 139 (última 20260901004804)
```

Reglas de comparación después de un corte:
- `tablas`, `funciones`, `politicas`, `triggers`, `enums`, `usuarios_auth`,
  `buckets`, `archivos`: **iguales o más**. Si bajan, PARAR.
- `at_rate_limit` y `evidencias` (bucket vacío) pueden variar — ver pie de `retrato.sql`.
- Los `cron` cambiarán al pasar a EventBridge (Fase 2.5) — es esperado.

> El pie de `scripts/retrato.sql` tenía los números del **2026-08-09** (28 tablas,
> 111 funciones). Actualizado el 2026-09-08 con este retrato. ✅

---

## Fase 0 — Red de seguridad · bloqueante

- [~] **0.1** Staging local: `supabase start` + `db reset` reconstruye las migraciones sin error
      → **FALLA en 0100** (2026-10-18, Docker ya instalado, `supabase start` aplica 0001-0100 bien): `0100_nadie_sin_sesion_llama_lo_que_no_es_suyo.sql:45` hace `revoke execute on function public.at_evento_al_crear_pedido()` y esa función **no la crea ninguna migración local** (solo existe en producción). Veredicto de la rama (3) de «Notas»: **la carpeta local no es fiel → hay que regenerar un baseline desde producción** (`supabase db dump`, necesita la contraseña de la BD) y usarlo como `0000` del staging. **Actualización:** con 3 funciones + 2 tablas + 1 membresía de publicación como stubs (`docs/migracion-aws/staging-stubs/`), las 119 migraciones aplican completas. Retrato local vs control: tablas 33=33, índices 100=100, enums 12=12, cron 5=5; **funciones 143 vs 150, triggers 22 vs 23, políticas 63 vs 62, falta bucket `evidencias`**. Sigue pendiente el baseline real (producción pausada por facturas impagas de la org).
      → _(superado: con red nueva las imágenes bajaron y `supabase start` llegó hasta la migración 0100; lo de abajo describe el bloqueo previo)_ Docker Desktop 4.95 ya está instalado y el daemon responde (29.8.2; hizo falta `wsl --shutdown` para destrabar WSL2). `supabase start` falló al bajar las imágenes: (1) errores TLS intermitentes contra public.ecr.aws / ghcr.io / docker.io (la red, no Supabase; no se desactivó la verificación) y (2) **disco C: sin espacio** (~1 GB libres de 237; las imágenes necesitan ~4 GB). Hecho: postgrest y kong bajados. Falta: gotrue, realtime, storage-api, postgres. Para retomar: liberar ≥ 8 GB en C: (caches de npm/.cache/Temp) y reintentar `npx supabase@latest start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,supavisor,postgres-meta` con `C:\Program Files\Docker\Docker\resources\bin` en el PATH. `[db] major_version = 17` ya añadido a `supabase/config.toml`.
- [x] **0.2** Huecos de numeración explicados — **veredicto abajo**. Pero apareció algo más gordo: la carpeta local **no corresponde** al historial de la nube. Ver «Notas».
- [x] **0.3** Tests de BD contra staging parchado (`npm run test:db`) — 2026-10-18: **83 de 83 en verde** (eran 81/83; ver «RESUELTO» abajo). Con la salvedad de que el staging lleva stubs y no es el baseline real de producción.
      Los 3 fallos de `catalogo.test.ts` NO eran un objeto faltante: eran un defecto del arnés. (1) `crearUsuario` pasa `{role}` en `user_metadata` pero `at_handle_new_user` nunca lo lee: todo perfil nace `pendiente`, así que `at_ensure_my_client` lanzaba «Solo una cuenta de cliente…» y muchos tests pasaban en vacío por sus `if (!clientId) return`. (2) Sin nombre, `at_ensure_my_client`/`at_autocreate_client` enlazan por nombre normalizado y todos caen en «Comercio sin nombre» = el MISMO comercio (A veía el catálogo de B). Arreglo en `tests/db/harness.ts` (sin commitear): asigna el rol con la llave de servicio y un `business_name` único.
      Quedan 2 en `cobro.test.ts`, sin diagnosticar del todo: (a) «sin return_rate cobra cero» hace `update return_rate = null` pero la columna es `not null default 3000` (0001) → el update falla en silencio y cobra 7.500; a menos que producción la haya vuelto nullable fuera de migraciones. (b) «trigger = botón»: el trigger cobra 16.000 con `shipping_fee` 14.500 y el botón no factura la guía (-2). Probable prueba vieja frente a migraciones 0114-0124, sin confirmar.
      **Reproducido de forma independiente el 2026-10-18 (segunda pasada):** `db reset --local --no-seed` desde una carpeta de trabajo con los dos stubs → las 121 migraciones (hasta 0124) aplican; `retrato.sql` local = 33 tablas · 100 índices · 12 enums · 5 cron · 143 funciones · 22 triggers · 63 políticas · 5 buckets (sin `evidencias`); `npm run test:db` = **81/83**, los mismos 2 fallos de `cobro.test.ts`. Lectura de los 2: (b) `a`=16.000 (el trigger) y `b`=−2 significa que `itemB` es **null**: la guía B nace sin pasar a `entregada`, así que el botón no la factura. Es defecto del test, no del cobro. Y 16.000 no es el `shipping_fee` (14.500): coincide con una tarifa por zona de la 0114 (`MED-NP` 15.500→16.000), o sea que desde 0057/0062 el cobro sale de la tarifa de zona y no de `shipping_fee` — **hipótesis, no verificada**. (a) sigue siendo columna `NOT NULL` en el `update`. Ambos son tests desactualizados; falta decidir si se reescriben o se retiran.
      **RESUELTO 2026-10-18 — `test:db` = 83/83.** Hipótesis verificada con matiz: el cobro sí lee `g.shipping_fee` (0062), pero al crear la guía `at_guides_asigna_zona` le resuelve la zona por la dirección y el trigger `at_set_guide_shipping_fee` (BEFORE INSERT/UPDATE OF zone_id, 0051/0072) **pisa** `shipping_fee` con `at_precio_domicilio` (tarifa de zona, 16.000 en el staging). El 14.500 que pasaba el test se descartaba. Reescritos en `tests/db/cobro.test.ts` (sin commitear): (b) ya no hardcodea 14.500, lee la tarifa congelada de la guía A, crea B directamente como `entregada` (el trigger de facturar es solo UPDATE y el de tarifa no toca guías entregadas) con esa misma tarifa, factura por el botón con ventana de ±1 día (UTC vs Bogotá) y exige a = b = tarifa; (a) pasa a «devolución de un comercio que no existe cobra cero» porque `return_rate` es `NOT NULL default 3000` y el caso null era inalcanzable. Verificado por mutación que (b) llega a sus `expect` (con `toBe(-1)` falla viendo a=b=16000). **Ojo, producción:** si el tarifario por zona mueve el domicilio, `shipping_fee` de una guía **no entregada** cambia al editar su zona; solo queda congelado desde `entregada`/`devuelta`/`cancelada`.
      **`supabase/seed.sql` está roto** frente a las migraciones: inserta en `at_zones` sin `facility_id` (hoy `NOT NULL`) → `db reset` con seed falla al final (`MigrationSeedError`). El staging se levanta con `--no-seed`; los tests crean sus propios datos.
      **Aviso de colisión:** `supabase start` expone los puertos 54321/54322 del proyecto `a-tiempo-logistica`; dos sesiones que hagan `db reset` a la vez se pisan la misma base. Mi primer `db reset` (sin stubs, desde el repo) la dejó a medias en la 0100 y hubo que rehacerla.
- [~] **0.4** `test:db` en CI — **borrador listo** en `docs/migracion-aws/ci-tests-base.draft.yml`, se arma cuando 0.3 esté verde
- [ ] **0.5** Mudanza de Supabase por transferencia ejecutada · proyecto bajo org propia · subido a Pro · MCP reconectado · `retrato.sql` idéntico — **acción de Henry en el panel**
- [x] **0.6** Retrato-control completo pegado arriba + pie de `retrato.sql` actualizado

**Puerta 0 → 1:** CI verde con tests de BD · staging reproducible · retrato-control guardado · mudanza ejecutada o aplazada con motivo escrito.
Estado de la puerta: **cerrada**

### Notas de la Fase 0

**0.2 — los huecos de numeración (2026-09-08).**

Faltan en la carpeta local: `0031`, `0039`, `0078`, `0079`, `0097`.

- `0031` y `0039` son **saltos de número sin más**. En la nube tampoco hay nada
  entre `at_0030`/`at_0032` (el `0031` de la nube, `at_0031_notificaciones_en_vivo`,
  se fundió en otra migración local) ni entre `0038`/`0040`. No falta ningún
  archivo: se saltó el número al renumerar.
- `0078`, `0079` — saltos de número. `docs/despliegue-supabase.md` ya los
  menciona. Ni la nube ni el repo tienen nada ahí.
- `0097` — el `0097` de la nube es `0097_el_codigo_puede_salir_por_el_puente_de_whatsapp`;
  en el repo, ese cambio quedó como `0097_el_codigo_puede_salir...` **renombrado a
  otro número** en la reorganización. Salto de número en local.

Conclusión de 0.2: **los huecos son cosméticos, no falta ningún archivo.**

**0.2 (lo gordo) — la carpeta local ≠ el historial de la nube.**

Al comparar `supabase/migrations/` (106 archivos) con
`supabase_migrations.schema_migrations` (139 entradas):

- La nube arrastra el historial de **TaxiYa** (`taxiya_*`, `alianza_*`, `socio_*`,
  `realtime_contador_cargos`) de cuando la base era compartida. El repo, con
  razón, no las tiene — la migración `solo_queda_lo_de_atl` las quitó.
- Las primeras migraciones se **renombraron** en el repo: la nube tiene
  `atiempo_core_schema`, el repo tiene `core_schema`. Mismo contenido, otro
  nombre.
- Varias migraciones de la nube están **fundidas** en un archivo local — p. ej.
  `facturacion_automatica_y_pagos` + `rpcs_pagos_cartera_y_entrega_directa` +
  `bloqueo_cartera_y_entrega_directa` (3 en la nube) = `facturacion_automatica_pagos_y_entrega_directa` (1 en local).
- Hay migraciones **solo en local** (`devoluciones_sin_reembolso`,
  `tarifa_domicilio_por_zona`, `medios_de_pago_y_qr`, `solicitudes_registro`,
  `cobertura_real_y_zona_por_ciudad`) y **solo en la nube** aplicadas por SQL
  editor sin registrar (`0090`, `0091`, `0092` — ya anotado en `docs/LO-QUE-FALTA.md`).

**Qué significa para la Fase 0:**

1. `supabase db push` local→nube **no sirve** y nunca ha servido (ya documentado
   en `docs/despliegue-supabase.md`). El equipo aplica por `apply_migration` (MCP)
   o SQL editor. Eso no cambia.
2. `supabase db reset` (staging) aplica los **106 archivos locales** en orden a
   una base vacía. Si el resultado da el retrato-control → la carpeta local ES
   una fuente de esquema válida y los tests de BD pueden correr contra ella.
3. **Si `db reset` deriva del retrato** (le falta un objeto, sobra otro), la
   carpeta local no es fiel y hay que **regenerar un baseline desde producción**
   (`supabase db dump --schema public,auth,storage`) y usar ese como `0000` del
   staging. Es la deuda B4 de la auditoría, y el camino A la necesita igual
   (el corte de la Fase 2 restaura de un `pg_dump` de la base viva, no de los
   archivos de migración).

**Acción pendiente en 0.1:** correr `db reset` y comparar con el retrato. El
resultado decide si vamos por (2) o por (3).

---

## Fase 1 — Piezas de borde (`infra/aws/1-hibrido/`) · puede ir en paralelo

- [x] **1.1** Bucket `atl-terraform-estado` (us-east-1) con versionado (`Enabled`, verificado 2026-10-18)
- [~] **1.2** `terraform plan` de `1-hibrido/` revisado — no hay constancia; el estado ya existe. Falta correr un `plan` para confirmar que no hay deriva
- [~] **1.3** `terraform apply` — **aplicado el 2026-08-17** (zona Route 53, identidad SES, CloudFront, Lambda, regla EventBridge, secreto existen). Falta confirmar presupuesto/SNS y deriva con un `plan`
- [ ] **1.4** Dominio: NS al registrador · Vercel Domains · Supabase Auth URL Configuration — **pendiente: los NS siguen en GoDaddy** (2026-10-18)
- [~] **1.5** Reloj de Shopify: Lambda y regla (cada 15 min) ENABLED. Sin verificar: `invoke` sin 401 y `cron.unschedule('at-shopify')` en Supabase
- [ ] **1.6** Salida del sandbox de SES solicitada
- [x] **1.7** Suscripción SNS `yam-alertas` confirmada (Confirmed=1, Pending=0, 2026-10-18)

**Puerta 1 → 2:** dominio resuelve por Route 53 · Lambda de Shopify estable · alarmas llegan de verdad.
Estado de la puerta: **cerrada**

### Notas de la Fase 1
_(vacío)_

---

## Backend sin Supabase Cloud — instancia única con créditos · **borrador, nada creado** (2026-10-18)

Henry descartó Supabase Cloud y pidió una opción gratuita y responsable; la más cercana es una sola EC2 con la pila abierta pagada con los 137,66 USD de créditos de la cuenta (≈34 USD/mes, ~4 meses). Plan completo y decisiones pendientes: `plan-instancia-unica.md`. Código: `infra/aws/3-instancia/` (`terraform validate` OK; `plan` = 23 a crear, 0 a destruir).

- [x] **I.0** Probar el compose en local con Docker y correr `test:db` contra esa pila (sin AWS) — **hecho 2026-10-18**: 83/83 y humo 8/8; corregidos 4 fallos reales (contraseñas de roles, esquema `_realtime`, `METRICS_JWT_SECRET`, CORS); dump restaurable. Frontend probado en navegador el 2026-10-19 (registro, login, pedido, encuesta, logo): todo bien; ver `plan-instancia-unica.md`. **Corrección:** el cliente e-commerce nace activo, no pendiente. Herramienta: `infra/aws/3-instancia/prueba-local/`
- [x] **I.1** Decisiones de Henry (2026-10-18): correo en **dos fases** (autoconfirmar al salir, SES después) · **t4g.medium** + 2 GB de swap · créditos: **asumir 6 meses y re-verificar ~2027-01-18** · DNS con **registros puntuales en GoDaddy** (sin mover NS; el A de api ya creado, quedan 5 del correo) · respaldo con **pg_dump cada 6 h**. Detalle en `plan-instancia-unica.md`. Hallazgo: SES sigue en sandbox y el dominio sin verificar (DKIM/MAIL FROM en FAILED) hasta que existan esos registros
- [x] **I.2** Sí explícito de Henry (2026-10-19, «solo gastar lo del crédito») → `terraform apply`: **24 recursos creados**, instancia `i-0ad88ff03708de9ba`, IP `34.199.160.189`; añadido el presupuesto `yam-solo-creditos`
- [~] **I.3** Paquete a S3 ✅ (arranque verificado: 6 contenedores, 146 funciones, respaldo a S3 con métrica) · **registro A en GoDaddy y certificado hechos el 2026-10-19** (HTTPS 200, prueba 10/10) · **pendiente:** variables en Vercel · **prueba de restauración** (el respaldo se probó, la restauración no)
- [~] **I.4** Los 3 stubs de funciones **reconstruidos** (2026-10-18, sin commitear): `at_valida_hora_recogida`, `at_franja_de_recogida` y `at_evento_al_crear_pedido` + su trigger. `test:db` = **100/100** (83 + 17 nuevos en `tests/db/recogidas-y-eventos.test.ts`); verificado por mutación; triggers 22→23 = producción. Qué es dato y qué suposición: `staging-stubs/LEEME.md`. **La encuesta (3 funciones, 2 tablas) también está reconstruida** (2026-10-18, sin commitear): es diseño nuevo sobre pistas del repo (`staging-stubs/01087_staging_encuesta.sql`; 17 tests en `tests/db/encuesta.test.ts`; `test:db` = **117/117**; mutación: fallan 9). **Quedan 2 funciones sin reconstruir a propósito**: `at_admin_eliminar_comercio` (riesgo alto: borraba pedidos, facturas y recaudo en cascada a mano) y `at_admin_eliminar_usuario` (riesgo medio); fallan cerrado y existe el interruptor `active` como alternativa

---

## Fase 1b — La web en AWS Amplify · **superada** por la decisión de descartar Supabase Cloud (la web seguiría en Vercel con el backend nuevo)

Solo la web; Supabase Cloud intacto. Detalle en `plan-maestro.md`.

- [~] **1b.1** Región: recomendada `us-west-2` (misma que Supabase). **Latencia NO medida**: el proyecto Supabase está `INACTIVE` (pausado) y su host da NXDOMAIN (2026-10-18). Reactivar y medir con `/api/salud`
- [~] **1b.2** `next.config.ts` usa `VERCEL_GIT_COMMIT_SHA ?? AWS_COMMIT_ID` (typecheck OK, sin commit). Falta ver `/api/version` en Amplify
- [~] **1b.3** `amplify.yml` y `docs/migracion-aws/amplify-1b.md` listos (sin commit). Falta: crear la app (decisión de Henry), variables, build
- [ ] **1b.4** Verificación a mano en la URL `*.amplifyapp.com` (login, pedidos, recaudo, documento, pedido de prueba)
- [x] **1b.5** Presupuesto `yam-mensual` 20 USD con avisos 80/100/previsto 100, SNS confirmado, sin NAT Gateways (verificado 2026-10-18)
- [ ] **1b.6** Corte: dominio a Amplify · NS a Route 53 · Supabase Auth URL Configuration
- [ ] **1b.7** «No apagar Vercel antes de: ____» (fecha, +7 días del corte)

**Puerta 1b → fin:** 7 días sirviendo desde Amplify sin sorpresas.
Estado de la puerta: **cerrada**

---

## Fase 2 — Camino A (`infra/aws/2-plataforma/`) · **opcional** · ventana de mantenimiento

- [ ] **2.0** AWS Pricing Calculator con la carga real — cifra pegada aquí
- [ ] **2.1** `terraform apply` de `2-plataforma/` — Aurora + RDS Proxy + ECS + ALB + WAF, sirviendo a nadie
- [ ] **2.2** Restaurar roles + schema + data en Aurora (`session_replication_role = replica`)
- [ ] **2.3** Replicación lógica corriendo · lag < 5 s sostenido
- [ ] **2.4** 5 buckets privados copiados detrás de la Storage API
- [ ] **2.5** Crons y edge functions → EventBridge + Lambda · flujo `at_cron_secreto_valido` recreado
- [ ] **2.6** `retrato.sql` en Aurora = retrato-control (si un número baja, PARAR)
- [ ] **2.7** Ventana: `MANTENIMIENTO=1` → última sync → cortar replicación → cambiar las dos variables → `MANTENIMIENTO=0`
- [ ] **2.8** Verificación en producción a mano (login con contraseña de siempre, pedidos, recaudo, archivos, pedido de prueba)
- [ ] **2.9** «No borrar Supabase antes de: ____» (fecha, +7 días del corte)

**Puerta 2 → 3:** 7 días sirviendo desde AWS sin sorpresas · alarmas en verde · vuelta atrás aún posible.
Estado de la puerta: **cerrada**

### Notas de la Fase 2
_(vacío)_

---

## Fase 3 — Endurecer camino A

- [ ] **3.1** Prueba de carga (k6/Artillery) — informe con p95 y punto de saturación
- [ ] **3.2** `EXPLAIN ANALYZE` de los agregados sobre tabla completa · índices/materialización donde lo pida
- [ ] **3.3** Server Components en las pantallas de solo lectura · bundle del móvil medido
- [ ] **3.4** Realtime dimensionado y medido con N conexiones
- [ ] **3.5** `docs/migracion-aws/operacion.md` — runbooks + guardia de los 3 socios

**Puerta 3 → 4:** carga pasada al volumen objetivo · runbooks escritos · sin escaneos de tabla completa en caliente.
Estado de la puerta: **cerrada**

### Notas de la Fase 3
_(vacío)_

---

## Fase 4 — Camino B por piezas

- [ ] **4.1** Realtime → IoT Core (MQTT) — rastreo por *topic*, mapa suscrito
- [ ] **4.2** Edge Functions + crons → Lambda + Step Functions + EventBridge (retirar `pg_cron`/`pg_net`)
- [ ] **4.3** Storage API → S3 + API de archivos propia (URLs firmadas con comprobación de rol)
- [ ] **4.4** PostgREST/RPC → API propia, RPC por RPC, tras *flag* en `src/lib/api/`
- [ ] **4.5** GoTrue → Cognito con `USER_MIGRATION` — **solo si se decide** (ADR-0008)
- [ ] **4.6** Retirar Kong — API Gateway + CloudFront como frente único

**Puerta 4 → 5:** cada pieza con métricas ≥ la vieja durante N días · reversible por *flag* · retrato-control sin cambios.
Estado de la puerta: **cerrada**

### Notas de la Fase 4
_(vacío)_

---

## Fase 5 — Punto máximo

- [ ] Supabase (gestionado y autogestionado) apagado
- [ ] Prueba de carga a la escala objetivo pasada
- [ ] `NEXT_PUBLIC_VERSION` repuesto fuera de Vercel si el hosting se movió
- [ ] Runbooks completos · guardia rodada
- [ ] ADR-0008 cerrado: decididas 4.5 (Cognito sí/no) y hosting (Vercel/Amplify)

### Decisiones abiertas que hay que cerrar antes del final
- ¿4.5 Cognito se ejecuta o GoTrue se queda indefinidamente?
- ¿El frontend sigue en Vercel o pasa a Amplify Hosting?
- ¿Región definitiva? El Terraform asume `us-east-1` (más barato, mejor latencia contra Medellín que `us-west-2`).

### 2026-10-19 — Prueba de restauración REALIZADA (pendiente cerrado)
Dump `yam-20261019T140022Z.dump` (906 KB) de S3 restaurado en una base temporal de la instancia y comparado con la base viva: 33 tablas, 146 funciones, 17 zonas, 169 tarifas, 5 buckets y 49 políticas públicas, IDÉNTICOS. Único error de pg_restore: `pg_cron` ("can only create extension in database postgres"), esperado fuera de la base `postgres`; no afecta datos. Base temporal y archivos borrados. El respaldo es restaurable.
### 2026-10-19 — yam.atiempologistica.com en producción (puente hacia yam.cdhmaker.com)
- Cloudflare: la cuenta del navegador (Cdhmaker8) tiene cdhmaker.com solo como zona PENDIENTE (NS journey/terry). La zona viva (NS irena/norm) está en otra cuenta, con registros que la pendiente no tiene (p. ej. incubapp.cdhmaker.com con proxy, _domainconnect). NO se cambiaron los NS en GoDaddy para no romper subdominios. cdhmaker.com sí está en la cartera de GoDaddy de Henry.
- GoDaddy: creado A yam.atiempologistica.com -> 76.76.21.21 (TTL 1/2 h). Vercel: dominio añadido al proyecto atiempo-logistica; https responde 200 con certificado válido.
- Instancia: Caddyfile y compose actualizados (CORS y GOTRUE_URI_ALLOW_LIST incluyen yam.atiempologistica.com); verificado CORS permitido para ambos yam.* y rechazado para origen ajeno.
- Pendiente: que Henry cree A yam 76.76.21.21 (sin proxy) en la cuenta de Cloudflare que sirve irena/norm; entonces yam.cdhmaker.com queda listo (ya registrado en Vercel y permitido en CORS).
### 2026-10-19 — Primer administrador y clientes existentes
- Creado el primer admin (cdhmaker@gmail.com, rol admin, activo) con la API admin de GoTrue; la base tenía 0 usuarios. Clave temporal guardada en el Escritorio de Henry (yam-admin-clave.txt), fuera del repo; debe cambiarla y borrar el archivo. Zonas (17) y tarifas (169) ya existían.
- Clientes de atiempologistica.com: atiempologistica.com (308 a www), www y yam.atiempologistica.com sirven el MISMO despliegue de Vercel y la misma API. El SW es red-primero y /api/version fuerza la actualización, así que las apps instaladas se actualizan solas. PERO la base nueva nació sin datos: las cuentas anteriores (Supabase Cloud) no existen aquí; cada cliente debe volver a registrarse. Sin datos de producción migrados por decisión de Henry.