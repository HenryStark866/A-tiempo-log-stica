# A Tiempo Logística — Plataforma SaaS

Plataforma de **logística de última milla para e-commerce en Medellín**, construida a partir del flujograma operativo estándar (ISO 9001) de la compañía: recogida en comercio, digitalización in situ, CEDI, picking/zonificación, ruta de última milla, recaudo contraentrega, cierre de caja bancario, reintentos (máx. 2), logística inversa y facturación quincenal/mensual.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript |
| Estilos | Tailwind CSS 4 |
| Backend | Supabase (PostgreSQL 17 + Auth + RLS) |
| Lógica de negocio | Funciones RPC `security definer` (máquina de estados en la BD) |
| Despliegue | Vercel |

## Arquitectura de seguridad

- **RLS en todas las tablas**: el staff ve la operación completa; cada cliente e-commerce solo ve sus guías, recogidas y facturas; cada mensajero solo su ruta y sus cierres de caja.
- **Máquina de estados en la base de datos**: los cambios de estado de guías pasan por `at_change_guide_status`, que valida transición, rol y propiedad. No se puede saltar el flujo desde el cliente.
- **Reintentos controlados**: `at_process_return` aplica la regla de negocio (1er fallo → reprogramada, 2do fallo → logística inversa).
- **Antiescalada de privilegios**: un trigger impide que un usuario cambie su propio rol; solo un admin puede asignar roles.
- **Rastreo público limitado**: `at_track_guide` expone solo estado e historial de fechas, nunca datos personales del destinatario.
- Cabeceras de seguridad (X-Frame-Options, nosniff, Referrer-Policy) en `next.config.ts`.

## Roles

| Rol | Acceso |
|---|---|
| `admin` | Todo + gestión de usuarios y roles |
| `coordinador` | Operación completa, clientes, facturación, conciliación |
| `operario` | Recogidas, recepción CEDI, zonificación, retornos |
| `mensajero` | Su ruta (iniciar, entregar, novedad), su cierre de caja |
| `cliente` | Sus guías, solicitudes de recogida, sus facturas, dashboard propio |
| `pendiente` | Registro nuevo a la espera de activación por un admin |

## Flujo de una guía

```
creada → recogida → en_cedi → zonificada → en_ruta → entregada ✔
                                    ↑            ↓
                                    |         novedad (intento +1)
                                    |            ↓  (retorno al CEDI)
                                    └── reprogramada (1er fallo)
                                              o
                                        en_devolucion (2do fallo) → devuelta ✔
```

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completa URL y anon key de Supabase
npm run dev                  # http://localhost:3000
```

## Base de datos

Las migraciones están en [`supabase/migrations/`](supabase/migrations/) y se aplican en orden:

1. `0001_core_schema.sql` — enums, tablas `at_*`, índices
2. `0002_functions_triggers.sql` — RPCs de negocio, triggers, KPIs
3. `0003_rls_policies.sql` — políticas de Row Level Security

`supabase/seed.sql` carga zonas de Medellín, clientes y guías de demostración.

## Usuarios demo

| Correo | Rol | Contraseña |
|---|---|---|
| `admin@atiempo.co` | Administrador | `Atiempo2026!` |
| `operario@atiempo.co` | Operario CEDI | `Atiempo2026!` |
| `mensajero@atiempo.co` | Mensajero | `Atiempo2026!` |
| `cliente@novamoda.co` | Cliente e-commerce | `Atiempo2026!` |

> Cambia estas contraseñas en producción (Dashboard de Supabase → Authentication).

## Métricas del dashboard (del flujograma de inversión)

- **LTR** — Lead Time de Recogida: horas promedio desde la solicitud hasta la digitalización.
- **TLI** — Tasa de Logística Inversa: % de guías finalizadas que regresaron al e-commerce.
- **Recaudo por consignar** — ciclo de conversión de efectivo del contraentrega.
