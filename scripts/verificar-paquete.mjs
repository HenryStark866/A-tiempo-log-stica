/**
 * Revisa el paquete YA COMPILADO antes de que salga a producción.
 *
 * Existe porque las dos cosas que comprueba se rompen en silencio y no se
 * notan hasta que alguien las busca:
 *
 *  1. UN MAPA DE ORIGEN PUBLICADO es el código fuente entero servido en
 *     abierto. Basta con que alguien ponga `productionBrowserSourceMaps: true`
 *     para depurar un día y se le olvide quitarlo. En pantalla no cambia nada.
 *
 *  2. EL PESO DEL PRIMER JAVASCRIPT es lo que tarda un mensajero con señal
 *     mala en poder tocar el primer botón. Crece de a poquito, un import
 *     nuevo cada semana, y no hay un día en que se note.
 *
 * Se corre contra `.next` después de `npm run build`. No compila nada: si no
 * hay build, lo dice y sale con error, que es lo correcto en CI.
 *
 *   node scripts/verificar-paquete.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath y no `.pathname`: en Windows, `.pathname` deja la barra de
// delante ("/C:/…") y, sobre todo, deja los espacios como %20 — y esta
// carpeta se llama «A TIEMPO LIGISTIC». Con la ruta mal, el script decía «no
// hay build» sobre un build que sí estaba, que es la peor forma de fallar:
// pasa por bueno en CI sin haber mirado nada.
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const ESTATICO = join(RAIZ, ".next", "static");

/**
 * Techo del JavaScript que descarga CUALQUIERA que abra CUALQUIER pantalla.
 *
 * Son kilobytes SIN COMPRIMIR: por el cable van más o menos a un tercio, que
 * es el número que imprime `next build`. Se mide sin comprimir a propósito
 * —el gzip lo pone el CDN y varía— y lo que interesa aquí no es el valor
 * absoluto sino el salto.
 *
 * Hoy son 344 kB. El techo va con holgura: sirve para enterarse de que alguien
 * metió una librería pesada en un sitio que carga siempre, no para pelearse
 * con cada kilobyte. Si se pasa a conciencia, se sube ESTA línea en el mismo
 * commit que lo justifica.
 */
const TOPE_PRIMERA_CARGA_KB = 450;

const problemas = [];
const avisos = [];

if (!existsSync(ESTATICO)) {
  console.error(
    "No hay build que revisar: falta .next/static.\n" +
      "Corre `npm run build` antes que esto."
  );
  process.exit(1);
}

/** Todos los archivos de .next/static, con su ruta relativa y su tamaño. */
function recorrer(dir, base = "") {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const rel = base ? `${base}/${nombre}` : nombre;
    const st = statSync(ruta);
    if (st.isDirectory()) salida.push(...recorrer(ruta, rel));
    else salida.push({ rel, ruta, bytes: st.size });
  }
  return salida;
}

const archivos = recorrer(ESTATICO);

// ── 1. Ni un mapa de origen, ni una pista de dónde encontrarlo ────────────
const mapas = archivos.filter((a) => a.rel.endsWith(".map"));
if (mapas.length) {
  problemas.push(
    `Hay ${mapas.length} mapa(s) de origen publicados en .next/static. ` +
      `El primero es ${mapas[0].rel}.\n` +
      "  Un .map es el código fuente entero servido en abierto. Revisa " +
      "`productionBrowserSourceMaps` en next.config.ts."
  );
}

// Aunque el .map no esté, el comentario que lo apunta delata rutas del
// disco de quien compiló. Se busca solo en el JS del navegador.
const conApuntador = archivos
  .filter((a) => a.rel.endsWith(".js"))
  .filter((a) => {
    const texto = readFileSync(a.ruta, "utf8");
    // El nombre se parte para que este archivo no se cace a sí mismo cuando
    // alguien grepee el repo buscando el apuntador.
    return texto.includes("//# source" + "MappingURL=");
  });

if (conApuntador.length) {
  problemas.push(
    `Hay ${conApuntador.length} archivo(s) de JavaScript que apuntan a un ` +
      `mapa de origen. El primero es ${conApuntador[0].rel}.`
  );
}

// ── 2. Cuánto pesa arrancar ───────────────────────────────────────────────
//
// Lo que se mide es la INTERSECCIÓN: los trozos que aparecen en las 60
// páginas, o sea lo que descarga cualquiera abra lo que abra.
//
// La primera versión de esto sumaba todo lo que hubiera en chunks/ y daba
// 2.420 kB donde Next decía 103. Contaba los trozos de cada página por
// separado y hasta el worker de MapLibre, que solo baja quien abre el mapa.
// Un número que no significa nada es peor que no medir: se ajusta el techo
// para que deje de saltar y a partir de ahí ya no avisa de nada.
const MANIFIESTO = join(RAIZ, ".next", "app-build-manifest.json");

let kb = 0;
let comunes = [];

if (existsSync(MANIFIESTO)) {
  const paginas = Object.values(
    JSON.parse(readFileSync(MANIFIESTO, "utf8")).pages ?? {}
  ).map((lista) => new Set(lista.filter((f) => f.endsWith(".js"))));

  if (paginas.length) {
    comunes = [...paginas[0]].filter((f) => paginas.every((s) => s.has(f)));
    kb = Math.round(
      comunes.reduce((n, f) => n + statSync(join(RAIZ, ".next", f)).size, 0) / 1024
    );
  }
} else {
  avisos.push(
    "No está .next/app-build-manifest.json: no se pudo medir el peso de " +
      "arranque. Lo de los mapas de origen sí se comprobó."
  );
}

if (kb > TOPE_PRIMERA_CARGA_KB) {
  avisos.push(
    `El JavaScript que carga toda pantalla pesa ${kb} kB y el techo está en ` +
      `${TOPE_PRIMERA_CARGA_KB} kB.\n` +
      "  Si el crecimiento es a conciencia, sube TOPE_PRIMERA_CARGA_KB en " +
      "este mismo archivo, en el commit que lo justifica."
  );
}

// ── Veredicto ─────────────────────────────────────────────────────────────
console.log(`Paquete revisado: ${archivos.length} archivos en .next/static.`);
console.log(
  `JavaScript que carga toda pantalla: ${kb} kB sin comprimir en ` +
    `${comunes.length} trozos (techo ${TOPE_PRIMERA_CARGA_KB} kB).`
);
console.log(`Mapas de origen: ${mapas.length}.`);

for (const a of avisos) console.warn(`\nAVISO: ${a}`);

if (problemas.length) {
  for (const p of problemas) console.error(`\nFALLA: ${p}`);
  process.exit(1);
}

// Los avisos no tumban el build: uno se entera y decide. Lo que sí tumba es
// publicar el código fuente, que no admite matices.
console.log("\nSin mapas de origen publicados.");
