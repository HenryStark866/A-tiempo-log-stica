# A Tiempo Logística — mapa del repo

SaaS de última milla para e-commerce en Medellín. Next.js 15 (App Router) + React 19 +
TypeScript + Tailwind 4 + Supabase. Todo en **español**, incluida la UI y los commits.

> Las decisiones y el *porqué* (infraestructura, marcas, criterios de diseño) viven en la
> memoria del proyecto. Este archivo solo describe **dónde está cada cosa**, para no
> reexplorar el repo.

## Antes de escribir código, lee esto

**[`docs/estandares-de-plataforma.md`](docs/estandares-de-plataforma.md)** —
cómo tiene que estar hecho cada frente (paquete sin mapas de origen, RLS,
control de versiones, APIs, hosting, despliegue, seguridad y freno, caché,
escalabilidad y monitoreo), con el guardián de cada regla y lo que se aceptó a
sabiendas. **Vale para cualquiera que trabaje aquí, persona o agente.**

Lo mínimo, si no vas a leerlo entero:

- **RLS es la única capa de autorización.** Toda tabla `at_` nace con RLS; toda
  función `security definer` comprueba el rol por dentro y se revoca de `anon`.
  Tras cada cambio de esquema, `get_advisors` de seguridad **y** de rendimiento.
- **Elegir bien el cliente de Supabase**: `client.ts` en el navegador,
  `server.ts` cuando hay persona, `servicio.ts` **solo** cuando quien llama es
  una máquina (se salta RLS entera). Equivocarse no da error: da cero filas.
- **Toda ruta `/api`** usa `src/lib/api/respuesta.ts` (una sola forma) y
  `src/lib/api/freno.ts` (tope).
- **Antes de empujar**, `npm run verificar`.
- **Dos proyectos de Supabase activos**: este es `uhbtivaepyhwfdvtpfjq`.
  Confirmar el ref antes de cada migración.

## La memoria del proyecto

Está en una bóveda de Obsidian, en `C:\Users\tabor\CLAUDE_CDH`. Son archivos `.md`
normales: Obsidian y Claude escriben sobre los mismos, así que no hay nada que
sincronizar a mano.

**Al empezar una sesión de trabajo sobre este repo, leer primero:**

| Archivo de la bóveda | Qué trae |
| --- | --- |
| `00 Índice/Índice.md` | mapa de todo |
| `10 Proyectos/YAM/YAM.md` | contexto del proyecto y enlaces al resto |
| `10 Proyectos/YAM/Estado de producción.md` | qué está encendido y qué falta |
| `20 Decisiones/` | ADR — decisiones tomadas con su alternativa descartada |
| `40 Bitácora/` | qué se hizo cada día |

Reparto, para que nada esté escrito dos veces: **este archivo dice dónde está cada
cosa; la bóveda dice por qué es como es.** Al terminar una sesión, actualizar lo que
cambió y añadir la línea del día a la bitácora.

Los secretos **no** se escriben en la bóveda. Viven en Vercel y en Supabase.

## Comandos

```bash
npm run dev        # servidor de desarrollo (puerto 3000)
npm run build      # build de producción — úsalo para verificar que compila
npm run lint
npm run typecheck
npm run test:run   # los de la base se saltan solos sin staging configurado
npm run paquete    # revisa el build: sin mapas de origen, y cuánto pesa arrancar
npm run verificar  # todo lo anterior en el orden de CI. Correr antes de empujar.
```

Para previsualizar usar el panel Browser con `preview_start {name: "atiempo-dev"}`
(definido en `.claude/launch.json`), nunca `npm run dev` por consola.

No hay tests. La verificación es `npm run build` + revisar la pantalla en el navegador.

## Estructura

```
src/app/
  (plataforma)/        ~25 pantallas de trabajo, tras login, con AppShell
    admin, cedi, clientes, codigos, conductor, dashboard, destinatarios,
    entregas, facturacion, inicio, mapa, mensajeros, mi-comercio, mi-perfil,
    mi-recaudo, novedades, pedidos, productos, recaudo, recogidas, rutas,
    seguimiento, usuarios
  login, registro, bienvenido, rastreo, pagar, auth/confirmar   → públicas
src/components/        UI compartida; `fondos/` solo para las públicas
src/lib/               dominio y utilidades
src/lib/supabase/      client.ts (browser) y server.ts (RSC/acciones)
supabase/migrations/   SQL versionado 0001…, ya aplicado en la nube
supabase/functions/    edge functions (enviar-mensajes, shopify-sync)
```

## Dónde vive qué

| Necesitas | Archivo |
| --- | --- |
| Cómo tiene que estar hecho cada frente | `docs/estandares-de-plataforma.md` |
| Forma y caché de las respuestas de /api | `src/lib/api/respuesta.ts` |
| Tope de peticiones en las rutas de Next | `src/lib/api/freno.ts` |
| Cliente de Supabase sin persona detrás | `src/lib/supabase/servicio.ts` |
| Semáforo de la operación | `app/api/salud` + `at_salud()` en la base |
| Nombres de marca (YAM vs ATL) | `src/lib/marca.ts` — fuente única, nunca a mano |
| Fechas y horas | `src/lib/tiempo.ts` — todo anclado a `America/Bogota` |
| Versión publicada y hora del servidor | `src/lib/servidor.ts` + `app/api/version` |
| Etiquetas y colores de estados | `src/lib/constants.ts` |
| Tipos del dominio | `src/lib/types.ts` |
| Menú y permisos por rol | `src/lib/menu.ts` — lo dibujan la barra lateral y `/inicio` |
| Zonas y tarifas | `src/lib/zones.ts` |
| Suscripciones realtime | `src/lib/realtime.ts` |
| Primitivas de UI (PageHeader, Card…) | `src/components/ui.tsx` |
| Perfil / cliente del usuario en sesión | `ProfileContext.tsx`, `useMyClient.ts` |

## Convenciones

- Componentes de UI llevan `"use client"`; el acceso a datos usa `createClient()` del
  archivo que corresponda (`supabase/client` en cliente, `supabase/server` en servidor).
- Estilos con clases Tailwind; usar `cn()` de `src/lib/utils.ts` para combinarlas.
- Iconos: `lucide-react`. Mapas: `leaflet`. QR: `react-qr-code`.
- Cada cambio de esquema es una migración nueva y numerada en `supabase/migrations/`;
  no editar una migración ya aplicada.
- Commits en español, en indicativo y contando el efecto para el usuario
  («el CEDI recibe el lote de un escaneo»), no el detalle técnico.
