# Plan — backend de YAM en UNA instancia de AWS (opción con créditos)

> **Estado: BORRADOR para aprobación. No se ha creado nada en AWS.**
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
| `pg_dump` nocturno a S3 (03:00 Medellín) + archivos subidos | Restaura la base por separado, 35 días de dumps |
| S3 con versionado, cifrado, sin acceso público; la instancia **no puede borrar** respaldos | Un compromiso de la máquina no destruye el respaldo |
| Alarma `yam-respaldo-no-se-hizo` | Avisa si pasan 2 días sin un respaldo completo (el fallo silencioso clásico) |
| Alarma de sistema con recuperación automática | Si cae el hardware, EC2 la reinicia en otro host (~5 min) |

**No hay:** alta disponibilidad (si la máquina cae, el servicio cae hasta que se
recupere), recuperación al minuto (el punto de recuperación es de **hasta 24 h**),
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
falta el bucket `evidencias`) y los 3 **stubs** de staging
(`at_evento_al_crear_pedido`, `at_franja_de_recogida`,
`at_valida_hora_recogida`) tienen **cuerpo vacío**: la validación de la hora de
recogida y el evento al crear un pedido **no hacen nada** hasta que se
reescriban. No es aceptable salir a producción con eso sin revisarlo.

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

## Pasos, con puerta entre cada uno

| # | Paso | Puerta (qué debe cumplirse para seguir) |
|---|---|---|
| 0 | ✅ **HECHO (2026-10-18)** — Probar el compose en local con Docker, sin AWS (ver arriba) | 83/83 y humo 8/8. Pendiente solo: probar el **frontend real** en un navegador contra esa URL |
| 1 | **Decisiones de Henry** (abajo) | Las 5 respondidas |
| 2 | `terraform plan` en `3-instancia/` con tus valores y revisarlo entero | Ya corrido en solo lectura (2026-10-18): **23 a crear, 0 a cambiar, 0 a destruir**; debe seguir igual con tus valores |
| 3 | **Sí explícito de Henry con la cifra delante** → `terraform apply` | `terraform output` completo |
| 4 | Subir el paquete: `bootstrap/instancia.tgz` al bucket (compose, Caddyfile, scripts, migraciones + stubs) | La instancia lo recoge sola (hasta 60 min) |
| 5 | Registro A `api` en **GoDaddy** hacia la IP fija (los NS siguen allá; sin esto Let's Encrypt no puede emitir el certificado) | `curl -I https://api.atiempologistica.com/auth/v1/health` → 200 |
| 6 | Leer la clave anon (`aws ssm start-session` → `/opt/yam/.env`) y ponerla en Vercel junto con la URL; redesplegar | Registro y login funcionan |
| 7 | **Prueba de restauración**: restaurar el último dump en una base vacía y comparar con `scripts/retrato.sql` | Retrato igual |
| 8 | Crear el primer admin, repoblar zonas/tarifas y reescribir los 3 stubs | Hecho antes de operar con dinero |

## Vuelta atrás

`terraform destroy` está bloqueado a propósito para el disco de datos y el
bucket (`prevent_destroy`): hay que quitar esa línea a mano. La web sigue en
Vercel; para volver basta devolver las dos variables. Sin Supabase Cloud no hay
a dónde volver para los datos, por eso el respaldo importa.

## Decisiones que necesito de Henry

1. **Correo de confirmación.** GoTrue necesita SMTP. SES sigue en sandbox
   (solo envía a direcciones verificadas): o se pide la salida del sandbox y se
   crea un usuario SMTP, o se arranca con `MAILER_AUTOCONFIRM=true` (cualquiera
   se registra sin confirmar su correo). Recomiendo pedir la salida del sandbox
   hoy y arrancar sin autoconfirmar.
2. **Tamaño.** `t4g.medium` (≈34 USD) o `t4g.large` (8 GB, ≈59 USD, ~2,3 meses
   de créditos). Recomiendo empezar en medium y vigilar la memoria.
3. **Vencimiento de los créditos** (Billing → Credits): dato que solo ve Henry.
4. **Registro A en GoDaddy** para `api` (o mover los NS a Route 53, paso 1.4).
5. **Aceptar la ausencia de alta disponibilidad y el respaldo de hasta 24 h**
   para una operación con dinero contraentrega.
