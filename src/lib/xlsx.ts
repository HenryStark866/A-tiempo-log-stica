/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LEER UN .XLSX SIN LIBRERÍA
 *
 * Un .xlsx no es un formato binario: es un ZIP con archivos XML dentro. Todo
 * lo que hace falta para leerlo lo trae ya el navegador —`DecompressionStream`
 * descomprime, y el XML de una hoja es plano y predecible—, así que aquí no se
 * instala nada.
 *
 * Y esa es la razón de fondo, no la comodidad. La librería obvia para esto es
 * SheetJS, pero su paquete `xlsx` en npm está congelado en 0.18.5 con dos
 * vulnerabilidades sin parchear (contaminación de prototipo y ReDoS); las
 * versiones corregidas solo se publican en su propio CDN. Meter eso en una app
 * que maneja datos de comercios, para leer una lista de contactos, es un mal
 * negocio.
 *
 * ── Lo que SÍ lee ────────────────────────────────────────────────────────
 * · Texto de la tabla de cadenas compartidas y texto en línea.
 * · Números, con el valor exacto que guardó Excel (nada de notación
 *   científica: un teléfono largo sigue siendo un teléfono).
 * · El valor calculado de una fórmula, que es lo que la persona ve en pantalla.
 * · Fechas: Excel las guarda como un número de días desde 1900, así que se
 *   miran los formatos de `styles.xml` y se convierten a AAAA-MM-DD. Sin esto,
 *   una columna de fechas se importaría como «45678».
 * · La PRIMERA hoja según el orden del libro, no según el nombre del archivo
 *   interno: no siempre coinciden.
 *
 * ── Lo que NO lee, y qué se hace ─────────────────────────────────────────
 * · `.xls` de Excel 2003 y anteriores. Es un formato binario completamente
 *   distinto (BIFF), no un ZIP. `leerTabla` lo detecta por su firma y pide que
 *   se guarde como .xlsx o .csv, que es un clic.
 * · Un teléfono que Excel guardó como número YA perdió su cero inicial antes
 *   de llegar aquí. Eso no se puede recuperar; se arregla en el origen
 *   formateando la columna como texto.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Una hoja ya leída: matriz de celdas en texto, sin interpretar. */
export type Matriz = string[][];

// ── ZIP ────────────────────────────────────────────────────────────────────

/**
 * Saca los archivos de un ZIP.
 *
 * Se recorre el directorio central (al final del archivo) y no las cabeceras
 * locales: cuando el ZIP se escribió en streaming, las cabeceras locales traen
 * el tamaño en cero y el dato real vive solo aquí. Excel escribe así.
 */
async function abrirZip(datos: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(datos);
  const dv = new DataView(datos);
  const salida = new Map<string, Uint8Array>();

  // El fin del directorio central (PK\x05\x06) está en los últimos 64 KiB.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("ARCHIVO_NO_ZIP");

  const entradas = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < entradas; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const comprimido = dv.getUint32(p + 20, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComentario = dv.getUint16(p + 32, true);
    const offsetLocal = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + largoNombre));

    // En la cabecera local los campos «extra» pueden medir distinto que en el
    // directorio central, así que se releen ahí antes de saltar a los datos.
    const nombreLocal = dv.getUint16(offsetLocal + 26, true);
    const extraLocal = dv.getUint16(offsetLocal + 28, true);
    const inicio = offsetLocal + 30 + nombreLocal + extraLocal;
    const crudo = b.subarray(inicio, inicio + comprimido);

    if (metodo === 0) {
      salida.set(nombre, crudo);
    } else if (metodo === 8) {
      salida.set(nombre, await inflar(crudo));
    }
    // Cualquier otro método de compresión se ignora: Excel solo usa 0 y 8.

    p += 46 + largoNombre + largoExtra + largoComentario;
  }

  return salida;
}

/** DEFLATE crudo, con el descompresor del navegador. */
async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const copia = new Uint8Array(datos); // desprende el subarray del buffer padre
  const stream = new Blob([copia as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── XML ────────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function desescapar(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m])
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function texto(bytes: Uint8Array | undefined): string {
  return bytes ? new TextDecoder().decode(bytes) : "";
}

// ── Fechas ─────────────────────────────────────────────────────────────────

/** Los formatos de fecha que Excel trae de fábrica. */
const FORMATOS_FECHA = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/**
 * Qué estilos son de fecha.
 *
 * Un estilo lo es si apunta a un formato de fábrica de la lista, o a uno
 * personalizado cuyo patrón menciona día, mes o año. Se ignora lo que va entre
 * comillas y el `\`, porque un formato como `"año "yyyy` tiene una `a` que no
 * es un token.
 */
function estilosDeFecha(stylesXml: string): Set<number> {
  const personalizados = new Set<number>();
  for (const m of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const patron = desescapar(m[2]).replace(/"[^"]*"|\\./g, "");
    if (/[ymd]/i.test(patron) && !/^\[/.test(patron)) personalizados.add(Number(m[1]));
  }

  const cellXfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  const estilos = new Set<number>();
  if (!cellXfs) return estilos;

  let i = 0;
  for (const xf of cellXfs[1].matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(xf[0].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    if (FORMATOS_FECHA.has(id) || personalizados.has(id)) estilos.add(i);
    i++;
  }
  return estilos;
}

/**
 * El número de serie de Excel a AAAA-MM-DD.
 *
 * El día 1 es el 1 de enero de 1900, y Excel cree que 1900 fue bisiesto: un
 * error heredado de Lotus 1-2-3 que nunca se corrigió porque arreglarlo habría
 * roto todas las hojas del mundo. El serial 60 es un 29 de febrero que no
 * existió.
 *
 * La constante 25569 —seriales entre el 1 de enero de 1900 y el 1 de enero de
 * 1970— YA lleva ese día fantasma dentro, así que para cualquier fecha
 * posterior a febrero de 1900 la resta sola acierta. Solo hay que compensar
 * hacia atrás, en los seriales anteriores al fantasma, que en la práctica no
 * aparecen nunca pero cuestan una línea.
 *
 * Se probó con fechas reales escritas por un Excel de verdad: sin este ajuste
 * bien puesto, toda fecha importada se corría un día.
 */
function fechaDeSerial(serial: number): string {
  const epoca = serial < 60 ? 25_568 : 25_569;
  const ms = Math.round((serial - epoca) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  return d.toISOString().slice(0, 10);
}

// ── La hoja ────────────────────────────────────────────────────────────────

/** "BC" → 54. La columna sale de la referencia de la celda, no de su posición. */
function columnaDeRef(ref: string): number {
  let n = 0;
  for (const c of ref) {
    const code = c.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** El texto de cada `<si>` de sharedStrings, uniendo los tramos con formato. */
function cadenasCompartidas(xml: string): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) =>
    m[1] ? [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescapar(t[1])).join("") : ""
  );
}

function leerHoja(xml: string, compartidas: string[], fechas: Set<number>): Matriz {
  const filas: Matriz = [];

  for (const fila of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const celdas: string[] = [];
    if (fila[1]) {
      for (const c of fila[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const cuerpo = c[2] ?? "";
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        const tipo = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
        const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);

        let valor: string;
        if (tipo === "s") {
          const i = Number(cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1);
          valor = compartidas[i] ?? "";
        } else if (tipo === "inlineStr") {
          valor = [...cuerpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
            .map((t) => desescapar(t[1]))
            .join("");
        } else {
          // Number, boolean, error y el valor cacheado de una fórmula: todos
          // guardan lo que se ve en <v>.
          const bruto = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
          valor = desescapar(bruto);
          if (tipo === "b") valor = valor === "1" ? "VERDADERO" : "FALSO";
          else if (valor !== "" && fechas.has(estilo) && !Number.isNaN(Number(valor))) {
            valor = fechaDeSerial(Number(valor));
          }
        }

        const col = ref ? columnaDeRef(ref) : celdas.length;
        while (celdas.length < col) celdas.push(""); // celdas vacías omitidas
        celdas[col] = valor;
      }
    }
    filas.push(celdas);
  }

  return filas;
}

// ── La entrada ─────────────────────────────────────────────────────────────

/** Los cuatro primeros bytes de un ZIP, que es lo que es un .xlsx. */
export function pareceXlsx(datos: ArrayBuffer): boolean {
  if (datos.byteLength < 4) return false;
  const b = new Uint8Array(datos, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
}

/** La firma de los formatos viejos de Office (OLE2), o sea un .xls de verdad. */
export function pareceXlsViejo(datos: ArrayBuffer): boolean {
  if (datos.byteLength < 8) return false;
  const b = new Uint8Array(datos, 0, 8);
  return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((x, i) => b[i] === x);
}

/**
 * Lee la primera hoja de un .xlsx y la devuelve como matriz de texto.
 * Lanza Error("ARCHIVO_NO_ZIP") o Error("XLSX_SIN_HOJAS") si no se puede.
 */
export async function leerXlsx(datos: ArrayBuffer): Promise<Matriz> {
  const zip = await abrirZip(datos);

  // Qué hoja es la primera: se pregunta al libro y a sus relaciones, no se
  // adivina por el nombre del archivo. Una hoja llamada sheet3.xml puede ser
  // perfectamente la primera del libro.
  const workbook = texto(zip.get("xl/workbook.xml"));
  const rels = texto(zip.get("xl/_rels/workbook.xml.rels"));
  const rid = workbook.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  const destino = rid
    ? rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
    : undefined;

  let ruta = destino
    ? destino.startsWith("/")
      ? destino.slice(1)
      : `xl/${destino.replace(/^\.\//, "")}`
    : undefined;

  if (!ruta || !zip.has(ruta)) {
    // Respaldo: la primera hoja por orden natural de nombre.
    ruta = [...zip.keys()]
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  }
  if (!ruta) throw new Error("XLSX_SIN_HOJAS");

  return leerHoja(
    texto(zip.get(ruta)),
    cadenasCompartidas(texto(zip.get("xl/sharedStrings.xml"))),
    estilosDeFecha(texto(zip.get("xl/styles.xml")))
  );
}
