/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEER UN .DBF SIN LIBRERÍA
 *
 * El formato de dBase/FoxPro que todavía exportan muchos sistemas de
 * inventario y punto de venta en Colombia. A diferencia del .xlsx (un ZIP con
 * XML), el .dbf es binario de ancho fijo: un encabezado de 32 bytes, la lista
 * de campos (32 bytes cada uno, terminada en 0x0D), y después un registro por
 * fila con esos mismos campos en ancho fijo. No hace falta ninguna librería
 * para leer eso — es aritmética sobre un ArrayBuffer.
 *
 * ── Lo que SÍ lee ────────────────────────────────────────────────────────
 * · Character (C), Numeric (N), Float (F), Logical (L) y Date (D).
 * · Registros marcados como borrados (el primer byte del registro en 0x2A)
 *   se saltan: no son datos vigentes, son basura que dBase nunca compacta sola.
 *
 * ── Lo que NO lee, y qué se hace ─────────────────────────────────────────
 * · Memo (M): el texto real vive en un archivo .DBT/.FPT aparte que nadie
 *   sube junto con el .dbf. Se deja la columna vacía en vez de mostrar el
 *   puntero de bloque como si fuera el dato — eso confundiría más que ayudar.
 * · La codificación se asume Windows-1252 siempre, igual que ya se hace para
 *   CSV en `decodeCsvBytes`. La mayoría de estos archivos salen de sistemas
 *   Windows (Visual FoxPro, dBase para Windows); el DOS viejo con code page
 *   850/437 podría traer alguna tilde mal, pero el archivo se sigue leyendo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Matriz } from "./xlsx";

/** Ancho fijo del encabezado del archivo, antes de la lista de campos. */
const TAM_ENCABEZADO = 32;
/** Ancho fijo de cada descriptor de campo. */
const TAM_DESCRIPTOR_CAMPO = 32;
/** Byte que marca el final de la lista de campos. */
const FIN_DESCRIPTORES = 0x0d;
/** Primer byte de cada registro: espacio si está vigente, asterisco si se borró. */
const REGISTRO_BORRADO = 0x2a;

interface CampoDbf {
  nombre: string;
  tipo: string;
  longitud: number;
}

/**
 * Firma de un .dbf, con validación estructural además del byte de versión.
 *
 * El primer byte solo (0x03, 0x83, 0x30…) no alcanza: cualquier archivo
 * binario podría empezar así por casualidad. Se exige además que el tamaño de
 * encabezado declarado en los bytes 8-9 apunte de verdad a un 0x0D — ese
 * byte solo aparece ahí en un .dbf real, así que descarta los falsos
 * positivos sin tener que leer el archivo entero.
 */
export function pareceDbf(datos: ArrayBuffer): boolean {
  if (datos.byteLength < TAM_ENCABEZADO + 1) return false;
  const dv = new DataView(datos);
  const version = dv.getUint8(0);
  // Los tres bits bajos identifican la familia dBase/FoxPro en casi todas las
  // variantes conocidas (III, IV, 5, FoxBASE, Visual FoxPro, con o sin memo).
  const versionPlausible = [0x02, 0x03, 0x04, 0x05, 0x07, 0x30, 0x31, 0x32].includes(version & 0x7f) ||
    [0x83, 0x8b, 0x8e, 0xf5, 0xe5, 0xcb, 0xc5, 0x43, 0x63].includes(version);
  if (!versionPlausible) return false;

  const tamEncabezado = dv.getUint16(8, true);
  if (tamEncabezado < TAM_ENCABEZADO + 1 || tamEncabezado > datos.byteLength) return false;

  return dv.getUint8(tamEncabezado - 1) === FIN_DESCRIPTORES;
}

const decoder = new TextDecoder("windows-1252");

function leerCampoTexto(bytes: Uint8Array): string {
  return decoder.decode(bytes).trim();
}

/** AAAAMMDD sin separadores → AAAA-MM-DD, igual que el resto de la app. */
function formatearFechaDbf(crudo: string): string {
  const limpio = crudo.trim();
  if (!/^\d{8}$/.test(limpio)) return "";
  return `${limpio.slice(0, 4)}-${limpio.slice(4, 6)}-${limpio.slice(6, 8)}`;
}

function formatearLogico(crudo: string): string {
  if ("TtYy".includes(crudo)) return "true";
  if ("FfNn".includes(crudo)) return "false";
  return "";
}

/**
 * Lee un .dbf y lo devuelve como matriz de texto: primera fila los nombres de
 * campo, el resto los registros vigentes (sin los marcados como borrados).
 */
export function leerDbf(datos: ArrayBuffer): Matriz {
  const dv = new DataView(datos);
  const bytes = new Uint8Array(datos);

  const numRegistros = dv.getUint32(4, true);
  const tamEncabezado = dv.getUint16(8, true);
  const tamRegistro = dv.getUint16(10, true);

  const campos: CampoDbf[] = [];
  let p = TAM_ENCABEZADO;
  while (p + 1 < tamEncabezado && bytes[p] !== FIN_DESCRIPTORES) {
    const nombreCrudo = bytes.subarray(p, p + 11);
    const finNombre = nombreCrudo.indexOf(0);
    const nombre = decoder
      .decode(finNombre === -1 ? nombreCrudo : nombreCrudo.subarray(0, finNombre))
      .trim();
    const tipo = String.fromCharCode(bytes[p + 11]);
    const longitud = bytes[p + 16];
    if (nombre) campos.push({ nombre, tipo, longitud });
    p += TAM_DESCRIPTOR_CAMPO;
  }
  if (campos.length === 0) throw new Error("DBF_SIN_CAMPOS");

  const filas: Matriz = [campos.map((c) => c.nombre)];

  let offset = tamEncabezado;
  for (let i = 0; i < numRegistros && offset + tamRegistro <= bytes.length; i++, offset += tamRegistro) {
    if (bytes[offset] === REGISTRO_BORRADO) continue; // fila borrada: no cuenta

    const fila: string[] = [];
    let q = offset + 1; // el primer byte del registro es la marca de borrado
    for (const campo of campos) {
      const crudo = bytes.subarray(q, q + campo.longitud);
      switch (campo.tipo) {
        case "D":
          fila.push(formatearFechaDbf(leerCampoTexto(crudo)));
          break;
        case "L":
          fila.push(formatearLogico(leerCampoTexto(crudo)));
          break;
        case "M":
          // Puntero a un .DBT/.FPT que no viaja con este archivo: no hay dato que mostrar.
          fila.push("");
          break;
        default: // C, N, F y cualquier otro se leen como texto
          fila.push(leerCampoTexto(crudo));
      }
      q += campo.longitud;
    }
    filas.push(fila);
  }

  return filas;
}
