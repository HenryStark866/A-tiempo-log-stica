// Importación de la base de compradores del e-commerce.
// Sin dependencias: los archivos que suben los clientes son exportaciones de
// Shopify/WooCommerce/Excel, así que hay que tolerar comillas, comas dentro de
// comillas, saltos de línea CRLF, BOM y separador ; (Excel en español).

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
  full_name: "Nombre del destinatario",
  phone: "Teléfono",
  address: "Dirección",
  address_2: "Complemento (apto, barrio, torre)",
  city: "Ciudad",
  external_id: "ID en tu sistema",
  notes: "Notas",
};

export const REQUIRED_FIELDS: RecipientField[] = ["full_name", "address"];

// Encabezados que se ven en exportaciones reales, normalizados (sin tildes).
//
// external_id NO se adivina a propósito. Adivinarlo causó un daño real: en una
// importación, una columna con la segunda mitad de la dirección ("apt 1510 unidad
// reserva del parque") se mapeó a ID por coincidir con la pista "id", y esas
// direcciones quedaron truncadas. Si alguien necesita el ID, lo elige a mano.
const HEADER_HINTS: Record<RecipientField, string[]> = {
  full_name: ["nombre", "nombre completo", "destinatario", "cliente", "name", "full name", "customer", "shipping name", "comprador"],
  phone: ["telefono", "telefonos", "tel", "celular", "cel", "movil", "whatsapp", "wpp", "numero", "num", "phone", "mobile", "shipping phone", "contacto"],
  address: ["direccion", "dir", "address", "shipping address", "address1", "direccion de envio", "direccion 1"],
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
 * Primero exacto, luego por inclusión, para que "Shipping Address 1" caiga en
 * address. Si se pasan las filas, el teléfono se detecta también por contenido.
 */
export function guessMapping(
  headers: string[],
  rows?: CsvRow[]
): Partial<Record<RecipientField, string>> {
  const mapping: Partial<Record<RecipientField, string>> = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  for (const field of Object.keys(HEADER_HINTS) as RecipientField[]) {
    const hints = HEADER_HINTS[field];
    if (hints.length === 0) continue; // external_id: nunca se adivina
    const exact = normalized.find((h) => !used.has(h.raw) && hints.includes(h.norm));
    if (exact) {
      mapping[field] = exact.raw;
      used.add(exact.raw);
      continue;
    }
    const partial = normalized.find(
      (h) => !used.has(h.raw) && hints.some((hint) => h.norm.includes(hint))
    );
    if (partial) {
      mapping[field] = partial.raw;
      used.add(partial.raw);
    }
  }

  // Último recurso para el teléfono: mirar los datos.
  if (!mapping.phone && rows && rows.length > 0) {
    const porContenido = sniffPhoneColumn(headers, rows, used);
    if (porContenido) {
      mapping.phone = porContenido;
      used.add(porContenido);
    }
  }

  return mapping;
}

/**
 * Convierte las filas del archivo al payload que espera at_sync_recipients.
 * El complemento se pega a la dirección: al mensajero le sirve la dirección
 * completa en un solo campo, no partida en dos columnas.
 */
export function toRecipientPayload(
  rows: CsvRow[],
  mapping: Partial<Record<RecipientField, string>>
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
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
