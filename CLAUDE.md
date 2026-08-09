# A Tiempo Logística — mapa del repo

SaaS de última milla para e-commerce en Medellín. Next.js 15 (App Router) + React 19 +
TypeScript + Tailwind 4 + Supabase. Todo en **español**, incluida la UI y los commits.

> Las decisiones y el *porqué* (infraestructura, marcas, criterios de diseño) viven en la
> memoria del proyecto, que se carga sola cada sesión. Este archivo solo describe **dónde
> está cada cosa**, para no reexplorar el repo.

## Comandos

```bash
npm run dev     # servidor de desarrollo (puerto 3000)
npm run build   # build de producción — úsalo para verificar que compila
npm run lint
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
