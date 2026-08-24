/**
 * Copia el worker de MapLibre a public/, para que el mapa de la flota
 * arranque de verdad.
 *
 * ── El fallo que esto arregla ─────────────────────────────────────────────
 *
 * maplibre-gl construye la URL de su Web Worker en tiempo de ejecución, a
 * partir de `import.meta.url` del propio paquete:
 *
 *   new URL('./maplibre-gl-worker.mjs', import.meta.url)
 *
 * Esto asume que el worker vive al lado del archivo principal, como en
 * node_modules. Pero Next.js empaqueta maplibre-gl dentro de sus propios
 * chunks (`_next/static/chunks/...`), así que en el navegador esa URL apunta
 * a un archivo que no existe ahí. El navegador pide un script de tipo módulo,
 * el servidor no tiene nada en esa ruta y responde con la página HTML de
 * siempre —no un 404 limpio—, y el navegador rechaza cargarlo: "Failed to
 * load module script: ... non-JavaScript MIME type of text/html".
 *
 * Sin worker, MapLibre nunca procesa una sola tesela: el mapa se queda con el
 * lienzo en blanco hasta que FleetMap.tsx se rinde a los 12 segundos y
 * muestra "El mapa en 3D no arrancó en este navegador" — un mensaje que
 * suena a que le falta aceleración por hardware, cuando el problema de
 * verdad es que el worker nunca encontró dónde vivir.
 *
 * ── La corrección ─────────────────────────────────────────────────────────
 *
 * Este script copia el worker donde SÍ es servible —public/, con URL fija—,
 * y FleetMap.tsx llama a `maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs')`
 * antes de crear el mapa, para que apunte ahí en vez de a `import.meta.url`.
 *
 * Corre solo, antes de `dev` y de `build` (ver package.json: predev/prebuild),
 * así que nunca hay que acordarse de repetirlo a mano después de actualizar
 * la librería. No se commitea el archivo copiado: se regenera siempre desde
 * la versión de maplibre-gl que haya en node_modules, así nunca queda
 * desincronizado del resto del paquete.
 */
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const origen = join(raiz, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const destino = join(raiz, "public", "maplibre-gl-worker.mjs");

if (!existsSync(origen)) {
  console.warn(
    "[copiar-worker-maplibre] No se encontró " +
      origen +
      " — ¿se corrió npm install? El mapa de la flota no va a arrancar sin este archivo."
  );
  process.exit(0); // no rompe la instalación por esto; solo avisa.
}

copyFileSync(origen, destino);
console.log("[copiar-worker-maplibre] worker de MapLibre listo en public/maplibre-gl-worker.mjs");
