# La plataforma en AWS

Aurora PostgreSQL con RDS Proxy, y la pila de Supabase en contenedores sobre
ECS Fargate. Es el «camino A» de la nota *Plan — Migración a AWS*.

## Qué conserva, y por qué importa

Son los mismos contenedores que corre Supabase gestionado:

- **PostgREST sigue siendo PostgREST.** Los 53 archivos del frontend que hablan
  directo con la base **no se tocan**, y las 55 políticas RLS valen tal cual.
- **GoTrue sigue siendo GoTrue.** Los hashes de contraseña viajan intactos:
  **nadie tiene que restablecer la suya** el día del cambio. Ese solo punto es
  lo que descarta el camino nativo con Cognito, que no importa hashes bcrypt.

En la app cambian **dos variables de entorno**. Nada más.

## Lo que de verdad aguanta miles de usuarios

No es Aurora. Es **RDS Proxy**.

PostgREST abre una conexión de Postgres por petición, y Postgres no aguanta
miles de conexiones concurrentes: cada una cuesta memoria, y pasado cierto punto
el servidor dedica más tiempo a cambiar de contexto que a responder. Se cae por
agotamiento de conexiones mucho antes que por CPU.

Supabase gestionado ya trae esto resuelto (Supavisor). Al autogestionar, esa
pieza hay que ponerla, y es la que se olvida: el sistema va perfecto en pruebas
y se derrumba el día que entra tráfico real.

Por eso el grupo de seguridad de la base **solo acepta conexiones del proxy**.
No es una recomendación en un documento: está forzado en la red.

## Lo demás que da estabilidad

| Pieza | Qué resuelve |
| --- | --- |
| 3 zonas de disponibilidad | Perder una degrada un tercio, no tumba |
| Aurora con réplica en otra zona | Conmutación automática si cae el escritor |
| 35 días de respaldo con PITR | Volver al minuto anterior a un borrado |
| `deletion_protection` + snapshot final | Tres cinturones contra el borrado accidental |
| Autoescalado por CPU al 60% | Sube rápido, baja despacio |
| Circuit breaker en el despliegue | Si la versión nueva no pasa la revisión, revierte sola |
| WAF con límite por IP | Corta antes de gastar una conexión de Postgres |

## Lo que NO resuelve, y hay que saberlo

Migrar a AWS **no da por sí solo capacidad para miles de usuarios**. Lo que
falta es independiente del proveedor:

1. **Nadie ha mirado los planes de consulta.** Hay 77 índices, pero funciones
   como `at_recaudo_por_girar` hacen agregados sobre tabla completa. Con 28
   pedidos es gratis; con 100.000 es un escaneo en cada carga del tablero.
2. **No hay prueba de carga.** Ni una. Los números de este Terraform
   (`acu_max`, `tareas_max`) son estimaciones, no mediciones.
3. **76 de 124 archivos son `"use client"`.** Casi toda la app se renderiza en
   el navegador y consulta desde ahí. Mover pantallas de solo lectura a Server
   Components baja el tráfico contra PostgREST más que cualquier ajuste de
   infraestructura.
4. **Realtime tiene su propio techo.** Cada mensajero reporta cada 10 s. Con
   cientos de mensajeros hay que dimensionar ese servicio aparte y medirlo.

**El orden honesto es: aplicar esto, medir con carga real, y ajustar.** No al
revés.

## El corte

El método es el mismo que ya funcionó para la mudanza de Supabase
(`docs/reconstruir-en-el-proyecto-nuevo.md`), porque el riesgo es idéntico: lo
peligroso no es que la app se caiga, es que siga escribiendo en la base vieja
durante la ventana y ese trabajo se pierda en silencio.

1. `terraform apply` — la pila queda arriba sirviendo a nadie.
2. Restaurar el esquema y los datos, y dejar **replicación lógica** corriendo
   días hasta que el retardo sea de segundos.
3. Verificar contra el retrato de la base: 28 tablas, 111 funciones, 55
   políticas, 15 triggers, 77 índices, 12 enums, 15 usuarios. **Si un número
   baja, parar.**
4. `MANTENIMIENTO=1` en Vercel + redesplegar. Desde aquí nadie escribe.
5. Última sincronización, cortar la replicación, cambiar
   `NEXT_PUBLIC_SUPABASE_URL` y la llave anónima.
6. `MANTENIMIENTO=0` + redesplegar. Un solo despliegue para las dos cosas.
7. **Supabase se deja intacto días.** La vuelta atrás son esas dos variables y
   un redespliegue: dos minutos.

De noche, sin reparto, avisando antes a los comercios. Media hora anunciada no
molesta a nadie; media hora por sorpresa sí.

## Antes de aplicar

- `1-hibrido` aplicada y el dominio resolviendo por Route 53 — esta pila **lee**
  esa zona para el certificado de `api.atiempologistica.com`.
- Los tests de `tests/db/` en verde contra staging.
- Decidido si se termina antes la mudanza de Supabase pendiente.
- Confirmada la suscripción de correo del SNS: hasta que alguien haga clic, las
  alarmas no llegan a nadie.
