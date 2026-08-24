// Importación de la base de compradores del e-commerce.
// Sin dependencias: los archivos que suben los clientes son exportaciones de
// Shopify/WooCommerce/Excel, así que hay que tolerar comillas, comas dentro de
// comillas, saltos de línea CRLF, BOM y separador ; (Excel en español).

import { leerXlsx, pareceXlsx, pareceXlsViejo } from "./xlsx";
import { leerDbf, pareceDbf } from "./dbf";

export type CsvRow = Record<string, string>;

/** Campos que la app necesita para poder crear una guía. */
export type RecipientField =
  | "full_name"
  | "phone"
  | "address"
  | "address_2"
  | "city"
  | "external_id"
  | "notes";

export const RECIPIENT_FIELD_LABELS: Record<RecipientField, string> = {
  full_name: "Nombre del cliente",
  phone: "Teléfono",
  address: "Dirección",
  address_2: "Complemento (apto, barrio, torre)",
  city: "Ciudad",
  external_id: "ID en tu sistema",
  notes: "Notas",
};

export const REQUIRED_FIELDS: RecipientField[] = ["full_name", "address"];

/** Campos del catálogo de productos del e-commerce. */
export type ProductField = "name" | "sku" | "price" | "description";

export const PRODUCT_FIELD_LABELS: Record<ProductField, string> = {
  name: "Nombre del producto",
  sku: "SKU / referencia",
  price: "Precio",
  description: "Descripción",
};

export const PRODUCT_REQUIRED_FIELDS: ProductField[] = ["name"];

// El ORDEN de las pistas es la prioridad: se prueba pista por pista, no
// columna por columna. Importa de verdad: un archivo de entregas trae NOMBRE
// (la persona) y PRODUCTO (el artículo). Recorriendo columnas ganaba NOMBRE
// por venir antes en el archivo, y el catálogo quedó con clientes de nombre
// "MARTHA" y "CLAUDIA" en vez de productos. Con "producto" como primera pista,
// gana la columna correcta sin importar dónde esté.
const PRODUCT_HINTS: Record<ProductField, string[]> = {
  name: ["producto", "nombre del producto", "articulo", "item", "product", "title", "descripcion corta", "nombre"],
  sku: ["sku", "variant sku", "codigo de barras", "codigo", "cod", "barcode", "ean", "ref", "referencia"],
  price: ["valor producto", "precio venta", "precio", "price", "pvp", "valor", "costo", "variant price"],
  description: ["descripcion", "detalle", "description", "body", "observaciones"],
};

// Columnas que delatan que el archivo es de ENTREGAS y no un catálogo.
const SENALES_DE_ENTREGA = ["direccion", "ciudad", "telefono", "celular", "destinatario", "barrio"];

/**
 * ¿El archivo describe entregas en vez de productos?
 *
 * Hace falta porque "referencia" es ambigua: en un catálogo es el SKU, pero en
 * un archivo colombiano de entregas es el complemento de la dirección (apto,
 * torre, barrio). Tomarla como SKU dejó referencias como
 * "apt 1510 unidad reserva del parque".
 */
function pareceArchivoDeEntregas(headers: string[]): boolean {
  const norms = headers.map(normalizeHeader);
  return norms.some((h) => SENALES_DE_ENTREGA.some((s) => h.includes(s)));
}

// Encabezados que se ven en exportaciones reales, normalizados (sin tildes).
//
// external_id NO se adivina a propósito. Adivinarlo causó un daño real: en una
// importación, una columna con la segunda mitad de la dirección ("apt 1510 unidad
// reserva del parque") se mapeó a ID por coincidir con la pista "id", y esas
// direcciones quedaron truncadas. Si alguien necesita el ID, lo elige a mano.
const HEADER_HINTS: Record<RecipientField, string[]> = {
  full_name: ["nombre", "nombres", "apellido", "apellidos", "nombre completo", "nombre y apellido", "destinatario", "cliente", "name", "full name", "customer", "shipping name", "comprador", "razon social", "recibe", "quien recibe", "beneficiario", "titular"],
  phone: ["telefono", "telefonos", "tel", "celular", "cel", "movil", "whatsapp", "wpp", "numero", "num", "phone", "mobile", "shipping phone", "contacto", "fono", "telefono de contacto", "numero de contacto"],
  address: ["direccion", "dir", "address", "shipping address", "address1", "direccion de envio", "direccion 1", "direccion completa", "direccion de entrega"],
  // "referencia" cae acá y no en external_id: en los CSV colombianos es el
  // complemento de la dirección (apto, torre, barrio), no un identificador.
  address_2: ["complemento", "referencia", "direccion 2", "address2", "shipping address2", "barrio", "apto", "apartamento", "torre", "unidad", "conjunto", "detalle", "punto de referencia"],
  city: ["ciudad", "municipio", "city", "shipping city", "localidad"],
  external_id: [],
  notes: ["notas", "nota", "observaciones", "comentarios", "notes", "note"],
};

/** ¿El valor parece un número de teléfono colombiano (fijo o celular)? */
function looksLikePhone(v: string): boolean {
  const limpio = v.replace(/[\s()+\-.]/g, "");
  return /^\d{7,13}$/.test(limpio);
}

/**
 * Detecta la columna del teléfono por su CONTENIDO cuando el encabezado no
 * coincide con ninguna pista.
 *
 * Hace falta porque en una importación real la columna del teléfono no se
 * detectó y los 9 destinatarios quedaron sin número: sin teléfono el mensajero
 * no puede avisar que llegó. El encabezado puede llamarse cualquier cosa, pero
 * los datos siempre parecen teléfonos.
 */
export function sniffPhoneColumn(
  headers: string[],
  rows: CsvRow[],
  yaUsadas: Set<string>
): string | undefined {
  const muestra = rows.slice(0, 50);
  if (muestra.length === 0) return undefined;

  let mejor: { header: string; ratio: number } | null = null;
  for (const h of headers) {
    if (yaUsadas.has(h)) continue;
    const valores = muestra.map((r) => (r[h] ?? "").trim()).filter(Boolean);
    if (valores.length === 0) continue;
    const aciertos = valores.filter(looksLikePhone).length;
    const ratio = aciertos / valores.length;
    if (ratio >= 0.6 && (!mejor || ratio > mejor.ratio)) mejor = { header: h, ratio };
  }
  return mejor?.header;
}

/**
 * Decodifica el archivo tolerando la codificación con que lo exportó el cliente.
 *
 * Excel en español guarda CSV en ANSI (Windows-1252) por defecto, no en UTF-8.
 * Leerlo como UTF-8 destruye tildes y ñ: una importación real dejó guardado
 * "santa M?nica" en vez de "santa Mónica". Se intenta UTF-8 estricto y, si el
 * archivo no es UTF-8 válido, se reintenta como Windows-1252.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Detecta el separador dominante en la línea de encabezado. */
function detectDelimiter(firstLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    // Cuenta solo separadores fuera de comillas.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const c = firstLine[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Parser CSV completo: comillas dobles, "" escapado, saltos de línea dentro de campos. */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const clean = text.replace(/^\uFEFF/, "");
  if (!clean.trim()) return { headers: [], rows: [] };

  const firstLineEnd = clean.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd));

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Consume el \n de un \r\n para no generar una fila vacía.
      if (c === "\r" && clean[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  // Último campo/fila si el archivo no termina en salto de línea.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

/**
 * Adivina qué columna del archivo corresponde a cada campo de la app.
 *
 * Recorre las PISTAS en orden, no las columnas: la primera pista de la lista
 * manda, esté donde esté esa columna en el archivo. Antes se recorrían las
 * columnas, así que ganaba la que viniera primero en el archivo y un archivo
 * de entregas mapeaba NOMBRE (la persona) como nombre del producto.
 *
 * Dentro de cada pista, primero coincidencia exacta y luego por inclusión,
 * para que "Shipping Address 1" caiga en address.
 */
function emparejar<F extends string>(
  headers: string[],
  hints: Record<F, string[]>,
  used: Set<string>
): Partial<Record<F, string>> {
  const mapping: Partial<Record<F, string>> = {};
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  for (const field of Object.keys(hints) as F[]) {
    const pistas = hints[field];
    if (pistas.length === 0) continue; // external_id: nunca se adivina

    // Pasada exacta, pista por pista y en orden de prioridad.
    let elegida = pistas
      .map((hint) => normalized.find((h) => !used.has(h.raw) && h.norm === hint))
      .find(Boolean);

    // Si ninguna pista casó exacta, se acepta por inclusión, igual en orden.
    if (!elegida) {
      elegida = pistas
        .map((hint) => normalized.find((h) => !used.has(h.raw) && h.norm.includes(hint)))
        .find(Boolean);
    }

    if (elegida) {
      mapping[field] = elegida.raw;
      used.add(elegida.raw);
    }
  }
  return mapping;
}

export function guessMapping(
  headers: string[],
  rows?: CsvRow[]
): Partial<Record<RecipientField, string>> {
  const used = new Set<string>();
  const mapping = emparejar<RecipientField>(headers, HEADER_HINTS, used);

  // Último recurso para el teléfono: mirar los datos.
  if (!mapping.phone && rows && rows.length > 0) {
    const porContenido = sniffPhoneColumn(headers, rows, used);
    if (porContenido) mapping.phone = porContenido;
  }
  return mapping;
}

export function guessProductMapping(headers: string[]): Partial<Record<ProductField, string>> {
  // En un archivo de entregas, las pistas genéricas apuntan a la persona y a la
  // dirección, no al artículo. Se limitan a las que solo pueden ser de producto
  // y el resto lo elige la persona a mano.
  if (pareceArchivoDeEntregas(headers)) {
    const estrictas: Record<ProductField, string[]> = {
      name: ["producto", "nombre del producto", "articulo", "item", "product"],
      sku: ["sku", "variant sku", "codigo de barras"],
      price: ["valor producto", "precio venta", "precio", "price", "pvp"],
      description: ["descripcion del producto", "detalle del producto"],
    };
    return emparejar<ProductField>(headers, estrictas, new Set());
  }
  return emparejar<ProductField>(headers, PRODUCT_HINTS, new Set());
}

/**
 * Todas las columnas que NO se mapearon a un campo propio.
 * Se guardan tal cual para no perder nada de lo que sube el e-commerce.
 */
function columnasExtra(row: CsvRow, mapeadas: (string | undefined)[]): Record<string, string> {
  const usadas = new Set(mapeadas.filter(Boolean) as string[]);
  const extra: Record<string, string> = {};
  for (const [col, valor] of Object.entries(row)) {
    if (!usadas.has(col) && valor.trim()) extra[col] = valor;
  }
  return extra;
}

/**
 * Convierte las filas del archivo al payload que espera at_sync_recipients.
 * El complemento se pega a la dirección: al mensajero le sirve la dirección
 * completa en un solo campo, no partida en dos columnas.
 *
 * ── Aquí NO se manda `extra`, y es a propósito ───────────────────────────
 *
 * `at_recipients` no tiene columna `extra` —mira su definición en la
 * migración 0009— y `at_sync_recipients` nunca lee `r->>'extra'`. O sea que
 * todo lo que se metiera ahí viajaría por la red para que la base lo tirase.
 *
 * No era gratis: un export de Shopify o WooCommerce trae entre 50 y 70
 * columnas y el mapeo usa seis. Las otras sesenta se serializaban POR CADA
 * FILA. Con lotes de cientos de filas eso son megabytes de JSON por petición,
 * y ahí es donde la importación de un archivo real se caía —sin un error que
 * explicara nada, porque el fallo ocurre en el transporte, no en el SQL—.
 *
 * Los productos SÍ llevan `extra` porque `at_products` sí tiene esa columna y
 * `at_sync_products` la guarda. Ver `toProductPayload`.
 */
export function toRecipientPayload(
  rows: CsvRow[],
  mapping: Partial<Record<RecipientField, string>>
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const field of Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[]) {
      if (field === "address_2") continue; // se fusiona abajo
      const col = mapping[field];
      if (col && row[col]) out[field] = row[col];
    }

    const compCol = mapping.address_2;
    const complemento = compCol ? (row[compCol] ?? "").trim() : "";
    if (complemento) {
      out.address = out.address ? `${out.address} ${complemento}` : complemento;
    }

    return out;
  });
}

/**
 * Parte el payload en lotes que quepan en una petición.
 *
 * Antes se cortaba por número de filas (400) y eso no dice nada del tamaño:
 * 400 filas de un archivo con cuatro columnas son 40 KB, y 400 filas de un
 * export de e-commerce con setenta columnas son varios megabytes. El primero
 * vuela y el segundo no llega.
 *
 * Se corta por bytes de JSON, que es lo que de verdad viaja. El límite de
 * filas se mantiene como tope aparte: cada fila cuesta un recorrido del bucle
 * dentro de la RPC, y un lote gigantesco de filas cortas tarda demasiado
 * aunque pese poco.
 */
export function lotesQueQuepan<T>(
  filas: T[],
  { maxBytes = 512 * 1024, maxFilas = 200 }: { maxBytes?: number; maxFilas?: number } = {}
): T[][] {
  const lotes: T[][] = [];
  let actual: T[] = [];
  let bytes = 0;

  for (const fila of filas) {
    // +1 por la coma que las separa en el arreglo JSON.
    const peso = JSON.stringify(fila).length + 1;

    // Una sola fila que ya se pasa del límite va sola: partirla no se puede, y
    // dejarla fuera perdería un comprador sin avisar. Que la rechace el
    // servidor con su propio mensaje es mejor que descartarla en silencio.
    if (actual.length > 0 && (bytes + peso > maxBytes || actual.length >= maxFilas)) {
      lotes.push(actual);
      actual = [];
      bytes = 0;
    }
    actual.push(fila);
    bytes += peso;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

/** Convierte las filas al payload que espera at_sync_products. */
export function toProductPayload(
  rows: CsvRow[],
  mapping: Partial<Record<ProductField, string>>
): Record<string, unknown>[] {
  const mapeadas = Object.values(mapping);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const field of Object.keys(PRODUCT_FIELD_LABELS) as ProductField[]) {
      const col = mapping[field];
      if (col && row[col]) out[field] = row[col];
    }
    const extra = columnasExtra(row, mapeadas);
    if (Object.keys(extra).length > 0) out.extra = extra;
    return out;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UNA SOLA PUERTA PARA TODOS LOS FORMATOS
//
// Las dos pantallas que importan —Clientes y Productos— tenían el mismo
// FileReader copiado, y cada formato nuevo habría que añadirlo dos veces. Aquí
// se decide una vez qué es el archivo y se devuelve siempre lo mismo:
// encabezados y filas.
//
// El formato se decide por el CONTENIDO, no por la extensión. Un .csv renombrado
// a .txt sigue siendo un csv, y un .xlsx que alguien renombró a .xls sigue
// siendo un zip: mirar los primeros bytes acierta donde el nombre miente.
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que el `accept` del input debe ofrecer. Se escribe aquí para que la lista
 *  y lo que el parser realmente entiende no puedan separarse. */
export const FORMATOS_ACEPTADOS = [
  ".csv",
  ".tsv",
  ".txt",
  ".json",
  ".xlsx",
  ".dbf",
  "text/csv",
  "text/tab-separated-values",
  "text/plain",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

/** Para el texto de ayuda bajo el campo. */
export const FORMATOS_LEGIBLES = "CSV, TSV, TXT, JSON, Excel (.xlsx) o dBase (.dbf)";

/** Convierte una matriz de celdas en encabezados + filas con nombre. */
function matrizAFilas(matriz: string[][]): { headers: string[]; rows: CsvRow[] } {
  const noVacias = matriz.filter((f) => f.some((c) => c.trim() !== ""));
  if (noVacias.length === 0) return { headers: [], rows: [] };

  const headers = noVacias[0].map((h, i) => h.trim() || `Columna ${i + 1}`);
  const rows = noVacias.slice(1).map((fila) => {
    const row: CsvRow = {};
    headers.forEach((h, i) => (row[h] = (fila[i] ?? "").trim()));
    return row;
  });
  return { headers, rows };
}

/** Un JSON de exportación: `[{...}]`, o un objeto con un único arreglo dentro. */
function parseJson(texto: string): { headers: string[]; rows: CsvRow[] } {
  let dato: unknown;
  try {
    dato = JSON.parse(texto);
  } catch {
    throw new Error("El archivo .json no es válido. Ábrelo y revisa que no le falte una llave o una coma.");
  }

  if (!Array.isArray(dato) && dato && typeof dato === "object") {
    // Shopify y compañía envuelven la lista: { customers: [...] }.
    const arreglo = Object.values(dato as Record<string, unknown>).find(Array.isArray);
    if (arreglo) dato = arreglo;
  }
  if (!Array.isArray(dato) || dato.length === 0) {
    throw new Error("El .json tiene que ser una lista de registros. Este no trae ninguna.");
  }

  // Los encabezados salen de recorrer TODOS los registros: el primero puede no
  // traer los campos opcionales, y esas columnas se perderían.
  const headers: string[] = [];
  for (const item of dato) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const k of Object.keys(item)) if (!headers.includes(k)) headers.push(k);
    }
  }
  if (headers.length === 0) {
    throw new Error("El .json trae una lista, pero no de registros con campos.");
  }

  const rows = dato.map((item) => {
    const row: CsvRow = {};
    for (const h of headers) {
      const v = (item as Record<string, unknown>)?.[h];
      // Un objeto anidado se deja como JSON en vez de como «[object Object]»:
      // al menos así la persona ve qué traía y puede decidir.
      row[h] =
        v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v).trim();
    }
    return row;
  });

  return { headers, rows };
}

/**
 * Lee cualquiera de los formatos aceptados y devuelve encabezados y filas.
 *
 * Los errores llevan mensaje para la persona, no para la consola: lo que se
 * lanza aquí es lo que se va a pintar en pantalla tal cual.
 */
export async function leerTabla(file: File): Promise<{ headers: string[]; rows: CsvRow[] }> {
  const bytes = await file.arrayBuffer();
  const nombre = file.name.toLowerCase();

  if (pareceXlsViejo(bytes)) {
    throw new Error(
      "Ese archivo es de Excel 2003 o anterior (.xls), un formato que ya no se puede leer aquí. " +
        "Ábrelo en Excel y usa «Guardar como» → Libro de Excel (.xlsx) o CSV."
    );
  }

  if (pareceXlsx(bytes)) {
    try {
      return matrizAFilas(await leerXlsx(bytes));
    } catch (e) {
      const codigo = e instanceof Error ? e.message : "";
      if (codigo === "XLSX_SIN_HOJAS") throw new Error("Ese Excel no tiene ninguna hoja con datos.");
      throw new Error("No se pudo leer ese Excel. Si te sirve, guárdalo como CSV y vuelve a intentar.");
    }
  }

  if (pareceDbf(bytes)) {
    try {
      return matrizAFilas(leerDbf(bytes));
    } catch {
      throw new Error("Ese .dbf no se pudo leer. Puede estar dañado o venir de un formato dBase muy distinto.");
    }
  }

  // Texto: se decodifica desde bytes porque Excel en español exporta ANSI.
  const texto = decodeCsvBytes(bytes);

  // JSON por extensión o porque el contenido empieza como tal.
  if (nombre.endsWith(".json") || /^\s*[[{]/.test(texto)) return parseJson(texto);

  // Todo lo demás pasa por el lector de texto separado, que ya olfatea si el
  // separador es coma, punto y coma, tabulación o barra vertical.
  return parseCsv(texto);
}
