# Migración a AWS — por dónde vamos

> Este archivo es **el estado vivo** del plan de `plan-maestro.md`. Se actualiza
> al cerrar cada paso. Un `[x]` significa **verificado**, no «escrito» ni
> «intentado». Si un paso se hizo a medias, va `[~]` con una línea de qué falta.
>
> **Al terminar una sesión de trabajo sobre esto:** marcar lo que cambió aquí y
> añadir la línea del día a la bitácora de la bóveda (`40 Bitácora/`).

**Fase actual: 0 — Red de seguridad**
**Última actualización: 2026-09-08 — 0.2 y 0.6 avanzados; 0.1 bloqueado en Docker**

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

- [~] **0.1** Staging local: `supabase start` + `db reset` reconstruye las 106 migraciones sin error
      → **BLOQUEADO**: Docker Desktop no arranca el daemon. Henry tiene que abrirlo y confirmar que está corriendo. `[db] major_version = 17` ya añadido a `supabase/config.toml`.
- [x] **0.2** Huecos de numeración explicados — **veredicto abajo**. Pero apareció algo más gordo: la carpeta local **no corresponde** al historial de la nube. Ver «Notas».
- [ ] **0.3** Los 75 tests de BD despiertos y en verde contra staging (`npm run test:db`) — depende de 0.1
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

- [ ] **1.1** Bucket `atl-terraform-estado` (us-east-1) con versionado y bloqueo público
- [ ] **1.2** `terraform plan` de `1-hibrido/` revisado — ~25 recursos, cero `destroy`
- [ ] **1.3** `terraform apply` — Route 53, SES, S3+CloudFront, Lambda Shopify, presupuesto
- [ ] **1.4** Dominio: NS al registrador · Vercel Domains · Supabase Auth URL Configuration
- [ ] **1.5** Reloj de Shopify en Lambda verde (`invoke` sin 401) · cron viejo apagado (`cron.unschedule('at-shopify')`)
- [ ] **1.6** Salida del sandbox de SES solicitada
- [ ] **1.7** Suscripción SNS confirmada (clic en el correo de AWS)

**Puerta 1 → 2:** dominio resuelve por Route 53 · Lambda de Shopify estable · alarmas llegan de verdad.
Estado de la puerta: **cerrada**

### Notas de la Fase 1
_(vacío)_

---

## Fase 2 — Camino A (`infra/aws/2-plataforma/`) · ventana de mantenimiento

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
