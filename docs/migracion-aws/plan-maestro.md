# Plan maestro — migración a AWS (Vía 5)

> **Decisión tomada el 2026-09-08 (Henry).** Se migra la plataforma entera a
> AWS. Forma elegida: **camino A ahora, camino B por fases después**. La Fase 0
> (red de seguridad) es **bloqueante**: no se aplica nada de AWS que sirva
> tráfico hasta que esté verde.
>
> Esto **revierte el ADR-0004** («camino híbrido: piezas sueltas, no la pila»).
> El porqué del cambio y la alternativa que se descarta están en
> `20 Decisiones/ADR-0008` de la bóveda. Este archivo es **el cómo**; la bóveda
> es **el porqué**; `docs/migracion-aws/estado.md` es **por dónde vamos**.

## Qué significa cada camino

| | Camino A | Camino B | Camino C (descartado) |
| --- | --- | --- | --- |
| Qué monta | La pila de Supabase (PostgREST, GoTrue, Realtime, Storage, Kong) en contenedores propios sobre ECS Fargate + Aurora PostgreSQL con RDS Proxy | AWS nativo: Aurora + Cognito + API Gateway/AppSync + Lambda + IoT Core + S3 + CloudFront | Solo piezas sueltas de AWS (Route 53, SES, CDN de logos, Lambda del reloj), Supabase se queda |
| Frontend | Cambian **dos variables de entorno**. Nada más | Se reescribe **toda** la capa de datos: 81 RPC → endpoints, 48 políticas RLS → autorización en código | No se toca |
| Auth | GoTrue sigue siendo GoTrue: **nadie restablece su contraseña** | Cognito **no importa hashes bcrypt** → migración en caliente con trigger `USER_MIGRATION`, GoTrue vivo meses | No se toca |
| Ventana | Minutos de escritura bloqueada, de noche | Por pieza, sin ventana (conviven vieja y nueva tras *flag*) | Ninguna |
| Coste al volumen de hoy | ~250-400 USD/mes en reposo | Variable; el mínimo de Aurora domina | < 5 USD/mes |
| Reversible | Sí: dos variables + redespliegue, dos minutos | Por pieza | Sí, pieza a pieza |
| Terraform | Escrito en `infra/aws/2-plataforma/`, **sin aplicar** | Sin escribir | Escrito en `infra/aws/1-hibrido/`, **sin aplicar** |

**El orden A→B no es indecisión: es la forma de que B no tenga ventana.** Con la
pila A arriba, cada pieza nativa de B se levanta al lado, se le manda tráfico por
*flag*, y solo se apaga la de Supabase cuando la nueva lleve días midiendo bien.
Sin A de por medio, B sería una reescritura a puerta cerrada contra una operación
con dinero en la calle.

## Punto de partida (medido el 2026-09-08)

| | Valor | De dónde sale |
| --- | --- | --- |
| Proyecto Supabase | `uhbtivaepyhwfdvtpfjq` · org `kjcdwpttgqdfqqdtlvfc` · **us-west-2** · instancia Micro · PG 17.6 | producción, compartido con TaxiYa (prefijo `at_`) |
| Escala | 6 guías · 10 comercios · 17 perfiles (1 admin, 3 asesores, 11 clientes, 2 mensajeros, **0 CEDI**) · 9 recogidas · 12 facturas · 1 remesa COD | consulta directa |
| Base | 34 tablas `at_` · 150 funciones `at_` · 48 políticas RLS · 5 buckets privados + 1 público | `retrato.sql` |
| Migraciones | 106 archivos (0001–0111), faltan **0031, 0039, 0078, 0079, 0097** · 139 entradas en el historial de la nube | `ls` + `supabase_migrations.schema_migrations` |
| Advisors seguridad | 0 ERROR. 4 WARN/INFO, todos documentados como aceptados en `docs/estandares-de-plataforma.md` | `get_advisors` |
| Tests | 109 unitarios en verde · **75 de BD dormidos** por falta de staging | `vitest run` |
| CI | `ci.yml`, `post-despliegue.yml`, `vigilancia.yml` | `.github/workflows/` |
| Dominio | `atiempologistica.com` (canónico con `www`) → Vercel. **Aún sin Route 53** | — |
| Mudanza de Supabase pendiente | sin resolver: *transferir* vs *reconstruir* (ver `docs/transferencia-de-cuenta.md`) | — |

Guarda este bloque tal cual: es el retrato-control. Después de cada corte, los
números tienen que dar **lo mismo o más**. Si alguno baja, se para.

---

## Las fases

Cada fase tiene **entrada** (qué tiene que estar hecho para empezar), **trabajo**
y **puerta** (qué tiene que estar verde para pasar a la siguiente). Las puertas
no se saltan: son el motivo de que esto sea reversible.

### Fase 0 — Red de seguridad · bloqueante · ~1-2 semanas · sin AWS

**Por qué primero.** Migrar infraestructura sin poder verificar las reglas de
negocio automáticamente es hacerlo a ojo. Hoy `npm run build` no mira la base:
una migración puede romper el cobro o abrir los datos de un comercio a otro y
compilar igual. La Fase 0 pone el filtro que falta.

| # | Trabajo | Guardián / prueba |
| --- | --- | --- |
| 0.1 | **Staging local**: `npx supabase start` + `npx supabase db reset`. Confirmar que las 106 migraciones aplican desde cero **y que el resultado da el retrato-control** | el `db reset` termina sin error · `retrato.sql` en local = retrato-control · si deriva → regenerar baseline desde `supabase db dump` (ver `estado.md`) |
| 0.2 | ~~Aclarar los 5 huecos de numeración~~ **HECHO 2026-09-08**: los huecos (0031, 0039, 0078, 0079, 0097) son saltos de número cosméticos, no falta ningún archivo. Lo que sí apareció: **la carpeta `supabase/migrations/` ha divergido del historial de la nube** (renombres, fusiones, migraciones aplicadas por SQL editor sin registrar). Detalle y consecuencias en `estado.md` → «Notas de la Fase 0» | — |
| 0.3 | **Despertar los 75 tests de BD**: cuadrar nombres de columnas y parámetros contra el SQL real (están deducidos del frontend). Ver cabecera de `tests/db/harness.ts` | `npm run test:db` en verde contra staging |
| 0.4 | **Meter `test:db` en CI**: un servicio de Postgres efímero en el *runner* o un proyecto de staging en la nube con las tres `SUPABASE_TEST_*` | `ci.yml` corre los tests de BD y falla si se rompen |
| 0.5 | **Resolver la mudanza de Supabase pendiente por la vía de _transferir_** (`docs/transferencia-de-cuenta.md`): mismo ref, misma URL, mismas llaves, sin ventana. Saca el proyecto de la org compartida y permite subirlo a **Pro** (respaldos diarios, no se pausa) | el proyecto aparece bajo la org nueva, `retrato.sql` idéntico, MCP reconectado |
| 0.6 | **Guardar el retrato-control** del día del corte de Fase 0 en `docs/migracion-aws/estado.md` | bloque de números con fecha |

> **0.5 y el acceso de Claude.** Transferir el proyecto o cambiarlo de
> organización **probablemente corta el MCP de Supabase**. Hay que volver a
> conectarlo con la cuenta destino. Hacer 0.5 en un momento en que se pueda
> reconectar enseguida, no a mitad de otra cosa.

**Puerta 0 → 1:** CI verde incluyendo los tests de BD · staging se reconstruye
desde el repo sin sorpresas · retrato-control guardado · decisión de mudanza
ejecutada o explícitamente aplazada con su motivo.

---

### Fase 1 — Piezas de borde (`infra/aws/1-hibrido/`) · riesgo bajo · ~1 semana · puede ir en paralelo con Fase 0

Esto es lo que era el camino C. **No se descarta: es el cimiento del camino A** —
la pila de la Fase 2 *lee* la zona de Route 53 que crea esta para el certificado
de `api.atiempologistica.com`. El runbook completo está en
`infra/aws/1-hibrido/README.md`; aquí solo el orden y las puertas.

| # | Trabajo | Guardián / prueba |
| --- | --- | --- |
| 1.1 | **Backend de estado**: crear a mano el bucket `atl-terraform-estado` (us-east-1) con versionado y bloqueo público. Huevo y gallina: Terraform no puede crear el bucket donde guarda su estado | `aws s3api get-bucket-versioning` dice `Enabled` |
| 1.2 | `terraform init/fmt/validate/plan` en `1-hibrido/`. **Leer el plan entero**: ~25 recursos, **cero** `destroy` | `plan.tfplan` revisado |
| 1.3 | `terraform apply`. Route 53, SES, S3+CloudFront (logos), Lambda+EventBridge (Shopify), presupuesto (aviso a 20 USD) | `terraform output` completo |
| 1.4 | **Dominio**: los 4 NS de `terraform output servidores_de_nombres` al registrador. Luego Vercel → Domains, y Supabase → Auth → URL Configuration (dejando el `.vercel.app`) | `dig +short A atiempologistica.com` da la IP de Vercel |
| 1.5 | **Reloj de Shopify**: cargar el secreto en Secrets Manager con el **mismo valor** que `AT_CRON_SECRET` en Supabase. `aws lambda invoke` da `{"tiendas":N,...}` y no `401`. Solo entonces `select cron.unschedule('at-shopify')` | invoke en verde + cron viejo apagado |
| 1.6 | **SES**: pedir la salida del sandbox **el mismo día** (lo aprueba AWS a mano y tarda). Mientras, los correos siguen saliendo por Supabase | solicitud enviada |
| 1.7 | **Confirmar la suscripción SNS** (AWS manda un correo; hasta el clic, las alarmas no llegan a nadie) | correo de confirmación aceptado |

**Puerta 1 → 2:** el dominio resuelve por Route 53 · la Lambda de Shopify corrió
bien un par de veces y el cron viejo está apagado · las alarmas llegan de verdad
(SNS confirmado).

---

### Fase 2 — La plataforma en camino A (`infra/aws/2-plataforma/`) · riesgo alto · ventana de mantenimiento de noche

Runbook detallado en `infra/aws/2-plataforma/README.md` y método de corte en
`docs/reconstruir-en-el-proyecto-nuevo.md` (el riesgo es idéntico al de la
mudanza de Supabase, y ese método ya se probó).

**Entrada:** Puerta 0 y Puerta 1 cerradas. Los tres socios avisados. Ventana
elegida de noche sin reparto.

| # | Trabajo | Guardián / prueba |
| --- | --- | --- |
| 2.1 | `terraform apply` en `2-plataforma/`: Aurora Serverless v2 (`acu_min` 0.5 / `acu_max` 16) + 1 réplica en otra AZ + PITR 35 días + `deletion_protection`, RDS Proxy (el grupo de seguridad de la base **solo** acepta conexiones del proxy), ECS Fargate con PostgREST/GoTrue/Realtime/Storage/Kong (`tareas_min` 2), ALB, WAF con límite por IP, observabilidad. **Sirviendo a nadie todavía** | `terraform output` + healthchecks del ALB en verde |
| 2.2 | Restaurar `roles.sql` + `schema.sql` + `data.sql` (con `session_replication_role = replica` para no disparar la facturación al insertar). Método del paso 1-2 de `reconstruir-en-el-proyecto-nuevo.md` | los volcados mencionan `auth.users` y `at_guides` |
| 2.3 | **Replicación lógica** Supabase → Aurora corriendo **días** hasta que el retardo sea de segundos | `pg_stat_replication` con `lag` < 5 s sostenido |
| 2.4 | Copiar los **5 buckets privados** de Storage. Van detrás de la Storage API (misma autorización RLS), **no** a S3 directo. Adaptar `scripts/copiar-almacenamiento.mjs` al endpoint nuevo | conteo de `storage.objects` igual al retrato |
| 2.5 | Las tareas cron (`at-limpiar-rate-limit`, `at-notificar-pendientes`) y las edge functions (`enviar-mensajes`, `shopify-sync`) → EventBridge + Lambda. Recrear el flujo de `at_cron_secreto_valido` | cada tarea corre una vez en el entorno nuevo y deja rastro |
| 2.6 | **Verificar contra el retrato-control.** Tablas, funciones, políticas, triggers, índices, enums, extensiones, buckets, usuarios, y los conteos de negocio. **Si un número baja, parar aquí**: la app sigue en Supabase y no se ha tocado nada | `retrato.sql` en Aurona = retrato-control |
| 2.7 | **La ventana**, en este orden exacto: (a) `MANTENIMIENTO=1` en Vercel + redespliegue → desde aquí nadie escribe; (b) última sincronización; (c) cortar la replicación; (d) cambiar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` al gateway nuevo (`https://api.atiempologistica.com`); (e) `MANTENIMIENTO=0` + redespliegue. **Un solo despliegue para (d) y (e)** | `/api/version` sirve el commit nuevo · `/api/salud` `ok:true` |
| 2.8 | Verificación en producción **a mano**: entrar con una cuenta de comercio **con su contraseña de siempre** (si tiene que restablecerla, los usuarios no migraron → parar y revertir); ver *Mis pedidos*, *Mi recaudo*, abrir un documento de mensajero, crear y borrar un pedido de prueba | los 5 pasos pasan |
| 2.9 | **Supabase gestionado se deja intacto ≥ 7 días.** Vuelta atrás = devolver las dos variables + redespliegue (2 min) | recordatorio en `estado.md` con fecha de «no borrar antes de» |

**Puerta 2 → 3:** 7 días sirviendo producción desde AWS sin sorpresas · alarmas
en verde · la vuelta atrás sigue siendo posible (Supabase intacto).

---

### Fase 3 — Endurecer el camino A · semanas-meses · sin ventana

Migrar a AWS **no da por sí solo capacidad para miles de usuarios**. Esto es lo
que falta y es independiente del proveedor (de `infra/aws/2-plataforma/README.md`,
sección «Lo que NO resuelve»).

| # | Trabajo | Guardián / prueba |
| --- | --- | --- |
| 3.1 | **Prueba de carga real** (k6 o Artillery) contra un clon de staging en AWS. Los números del Terraform (`acu_max`, `tareas_max`) son estimaciones — convertirlos en mediciones | informe de carga con p95 y punto de saturación |
| 3.2 | **Revisar los planes de consulta** de los agregados sobre tabla completa (`at_recaudo_por_girar`, `at_dashboard_kpis`, cierres de recaudo). Con 6 guías es gratis; con 100.000 es un escaneo por carga del tablero | `EXPLAIN (ANALYZE)` de cada uno + índice o materialización donde lo pida |
| 3.3 | **Server Components** para las pantallas de solo lectura (dashboard, seguimiento, facturación en consulta). Baja el tráfico contra PostgREST más que cualquier ajuste de infra. Cruza con la deuda B1 de la auditoría (pantallas de +1.000 líneas) | recuento de `"use client"` baja · bundle del móvil medido |
| 3.4 | **Dimensionar Realtime aparte.** Cada mensajero reporta cada 10 s; con cientos hay que medir ese servicio solo | prueba con N conexiones simuladas |
| 3.5 | **Runbooks de operación**: caída de una AZ, reversión por *circuit breaker*, saturación de RDS Proxy, rotación de guardia de los 3 socios | `docs/migracion-aws/operacion.md` escrito y repasado |

**Puerta 3 → 4:** prueba de carga pasada al volumen objetivo acordado · runbooks
escritos · sin consultas que escaneen tabla completa en el camino caliente.

---

### Fase 4 — Camino B por piezas · meses · cada pieza reversible

Descomponer la pila de Supabase en servicios nativos de AWS, **de uno en uno**,
detrás del mismo gateway. Regla por pieza: la vieja y la nueva conviven tras
*flag*; la vieja se apaga solo cuando la nueva lleve **N días midiendo bien**.

Orden por ganancia y por acoplamiento (menos acoplado primero):

| # | Pieza | A qué pasa | Por qué esta primero/después |
| --- | --- | --- | --- |
| 4.1 | **Realtime → AWS IoT Core (MQTT)** | El rastreo de mensajeros publica a un *topic*; el mapa se suscribe. `at_report_position` deja de escribir en `at_courier_positions` para Realtime | Mayor ganancia, menor acoplamiento. MQTT está hecho para redes móviles malas: mensajes retenidos, QoS, reconexión barata. **Habilita la app nativa** (ver `Plan — Apps nativas` en la bóveda). Se puede hacer sin nada más de B |
| 4.2 | **Edge Functions + crons → Lambda + Step Functions + EventBridge** del todo | Retirar `pg_cron` y `pg_net`. `enviar-mensajes` y `shopify-sync` como Lambda con su propia cola | Poco acoplado al frontend. `shopify-sync` ya vive en Lambda desde la Fase 1 |
| 4.3 | **Storage API → S3 + una API de archivos propia** | URLs firmadas con TTL corto emitidas por una función que comprueba el rol — la misma lógica que hoy hace RLS sobre `storage.objects` | El más delicado: 5 buckets con cédulas de mensajeros y evidencias de entrega. Reescribe la autorización de archivos entera. No se hace de paso |
| 4.4 | **PostgREST/RPC → API propia** (API Gateway + Lambda, o un servicio Node en ECS) | Las 81 RPC pasan a endpoints tipados, de una en una. El frontend llama a una capa `src/lib/api/` que enruta a lo viejo o lo nuevo por *flag*. Las 48 políticas RLS pasan a *middleware* de autorización con los mismos predicados | La pieza grande. **La máquina de estados de la guía se queda en Postgres** (ADR-0001 no se revierte del todo: la lógica de dominio dura sigue en la base; lo que cambia es quién expone la API) |
| 4.5 | **GoTrue → Cognito** con trigger `USER_MIGRATION` | Valida contra GoTrue en el primer login de cada persona y la migra en caliente. GoTrue vivo hasta que el último usuario haya entrado | Solo si Cognito aporta algo. **Decisión abierta** (ver ADR-0008): puede que GoTrue se quede indefinidamente. 17 usuarios no justifican prisa |
| 4.6 | **Retirar Kong** | API Gateway + CloudFront como frente único | Última: depende de que 4.3 y 4.4 estén hechas |

**Puerta por pieza:** métricas de la nueva ≥ las de la vieja durante N días · la
vieja se puede reactivar por *flag* · retrato-control sin cambios.

---

### Fase 5 — Punto máximo

Toda la pila es AWS nativo:

```
Route 53 → CloudFront → API Gateway ──┬── Lambda (API, ex-RPC)
                                      ├── Lambda (archivos, URLs firmadas) → S3
                                      └── Cognito (auth)  [si 4.5 se ejecutó]
IoT Core (MQTT)  ── rastreo de mensajeros
Aurora PostgreSQL (Multi-AZ, PITR)  ── datos + máquina de estados
EventBridge + Lambda + Step Functions  ── crons y trabajos
Amplify Hosting o Vercel  ── el frontend
Terraform  ── única fuente de verdad de la infraestructura
```

- Supabase (gestionado y autogestionado) **apagado**. Sin contenedores de la
  pila que parchear.
- Prueba de carga a la escala objetivo, pasada.
- `NEXT_PUBLIC_VERSION` repuesto fuera de Vercel si el hosting se movió — hoy
  sale de `VERCEL_GIT_COMMIT_SHA` y fuera de Vercel vale `"local"`, con lo que la
  detección de versión nueva **deja de funcionar en silencio**.
- Runbooks completos y guardia de los 3 socios rodada.

**Qué es exactamente «el punto máximo» está por cerrar** (ADR-0008, decisiones
abiertas): si 4.5 (Cognito) se ejecuta o GoTrue se queda; si el hosting sigue en
Vercel o pasa a Amplify. Se deciden con datos cuando lleguen las fases, no ahora.

---

## Lo que no viaja en ningún volcado — se rehace a mano, en cada corte

De `docs/reconstruir-en-el-proyecto-nuevo.md` y del `Plan — Migración a AWS` de
la bóveda:

- URLs de redirección de Auth y `Site URL`.
- Plantillas de correo (`correos/confirmar-cuenta.html`, `correos/bienvenida.html`).
- Secretos de Edge Functions / Lambda: Shopify, WhatsApp, `AT_CRON_SECRET`.
- Tareas cron.
- Protección contra contraseñas filtradas y límites de registro.
- `NEXT_PUBLIC_VERSION` — ver Fase 5.

## Costes — cómo pensarlos

Henry indica (2026-09-08) que dispone de los servicios de AWS **sin gasto
incremental relevante**. Aun así, el primer paso operativo de la Fase 2 es meter
la carga real en el **AWS Pricing Calculator** y dejar el número en `estado.md`:
un supuesto de coste sin cifra envejece mal, y si el supuesto cambia hay que
enterarse antes de la ventana, no después. Factores que dominan la factura del
camino A: el mínimo de Aurora Serverless v2 (se paga encendido o no), RDS
Multi-AZ (dobla la instancia), las 5 tareas de ECS + ALB, el NAT Gateway y la
transferencia de salida por CloudFront.

## Riesgos que se asumen a sabiendas

1. **Equipo de 3 socios con guardia rotativa semanal** para hacerse cargo de
   Aurora + 5 contenedores + IoT + Lambdas. Es poca gente. La Fase 3.5
   (runbooks) es lo que lo hace sostenible; sin ella, esto es frágil.
2. **Sin prueba de carga previa.** Los tamaños del Terraform son estimaciones
   hasta la Fase 3.1.
3. **El MCP de Supabase de Claude** puede cortarse en 0.5 y otra vez al apagar
   Supabase en la Fase 5. Trabajo en la base ⇒ reconectar primero.
4. **Se encadena con la mudanza de Supabase pendiente.** Mitigado haciéndola por
   transferencia (sin ventana) dentro de la Fase 0.

## Reparto con el resto de la documentación

| Dónde | Qué |
| --- | --- |
| **este archivo** | el plan y sus puertas |
| `docs/migracion-aws/estado.md` | por dónde vamos, con fecha |
| `infra/aws/1-hibrido/README.md` | runbook de la Fase 1 |
| `infra/aws/2-plataforma/README.md` | runbook de la Fase 2 |
| `docs/reconstruir-en-el-proyecto-nuevo.md` | método de corte (reutilizado en Fase 2) |
| `20 Decisiones/ADR-0008` (bóveda) | por qué Vía 5 y qué se descartó |
| `10 Proyectos/YAM/Plan — Migración a AWS` (bóveda) | el análisis de los tres caminos |
| `.claude/skills/migracion-aws/SKILL.md` | cómo un agente retoma esto y lo lleva adelante |
