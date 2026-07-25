// Importación de la base de compradores del e-commerce.
// Sin dependencias: los archivos que suben los clientes son exportaciones de
// Shopify/WooCommerce/Excel, así que hay que tolerar comillas, comas dentro de
// comillas, saltos de línea CRLF, BOM y separador ; (Excel en español).

export type CsvRow = Record<string, string>;

/** Campos que la app necesita para poder crear una guía. */
export type RecipientField = "full_name" | "phone" | "address" | "city" | "external_id" | "notes";

export const RECIPIENT_FIELD_LABELS: Record<RecipientField, string> = {
  full_name: "Nombre del destinatario",
  phone: "Teléfono",
  address: "Dirección",
  city: "Ciudad",
  external_id: "ID en tu sistema",
  notes: "Notas",
};

export const REQUIRED_FIELDS: RecipientField[] = ["full_name", "address"];

// Encabezados que se ven en exportaciones reales, normalizados (sin tildes).
const HEADER_HINTS: Record<RecipientField, string[]> = {
  full_name: ["nombre", "nombre completo", "destinatario", "cliente", "name", "full name", "customer", "shipping name", "comprador"],
  phone: ["telefono", "celular", "movil", "phone", "mobile", "shipping phone", "contacto"],
  address: ["direccion", "dir", "address", "shipping address", "address1", "direccion de envio"],
  city: ["ciudad", "municipio", "city", "shipping city", "localidad"],
  external_id: ["id", "codigo", "external id", "customer id", "order id", "pedido", "referencia"],
  notes: ["notas", "nota", "observaciones", "comentarios", "notes", "note"],
};

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
 * Primero exacto, luego por inclusión, para que "Shipping Address 1" caiga en address.
 */
export function guessMapping(headers: string[]): Partial<Record<RecipientField, string>> {
  const mapping: Partial<Record<RecipientField, string>> = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  for (const field of Object.keys(HEADER_HINTS) as RecipientField[]) {
    const hints = HEADER_HINTS[field];
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
  return mapping;
}

/** Convierte las filas del archivo al payload que espera at_sync_recipients. */
export function toRecipientPayload(
  rows: CsvRow[],
  mapping: Partial<Record<RecipientField, string>>
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const field of Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[]) {
      const col = mapping[field];
      if (col && row[col]) out[field] = row[col];
    }
    return out;
  });
}
