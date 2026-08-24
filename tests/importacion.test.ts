import { describe, it, expect } from "vitest";
import { lotesQueQuepan, toRecipientPayload, toProductPayload, parseCsv } from "@/lib/csv";
import type { CsvRow } from "@/lib/csv";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA IMPORTACIÓN DE LA BASE DEL COMERCIO
 *
 * Esto falló en operación real el 2026-08-16, y falló de la peor forma: sin
 * un error que explicara nada, porque el fallo ocurría en el transporte y no
 * en el SQL.
 *
 * LA CAUSA: `toRecipientPayload` metía TODAS las columnas no mapeadas del
 * archivo en un campo `extra` de cada fila. Pero `at_recipients` no tiene
 * columna `extra` —mira la migración 0009— y `at_sync_recipients` nunca lee
 * `r->>'extra'`. Todo eso viajaba por la red para que la base lo tirase.
 *
 * Un export de Shopify trae entre 50 y 70 columnas y el mapeo usa seis. Las
 * otras sesenta se serializaban por cada fila, y con lotes de 400 filas eso
 * son megabytes por petición.
 *
 * Estos tests corren HOY, sin base de datos, en milisegundos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Un export ancho, como el que sube un e-commerce de verdad. */
function exportAncho(filas: number, columnasBasura = 60): CsvRow[] {
  return Array.from({ length: filas }, (_, i) => {
    const row: CsvRow = {
      nombre: `Comprador ${i}`,
      telefono: `300123${String(i).padStart(4, "0")}`,
      direccion: `Cra ${i} #10-25`,
      ciudad: "Medellín",
    };
    for (let c = 0; c < columnasBasura; c++) {
      row[`columna_${c}`] = `valor largo de relleno para la columna ${c} de la fila ${i}`;
    }
    return row;
  });
}

const MAPEO = {
  full_name: "nombre",
  phone: "telefono",
  address: "direccion",
  city: "ciudad",
} as const;

describe("toRecipientPayload — no manda lo que la base tira", () => {
  it("NO incluye `extra`: at_recipients no tiene esa columna", () => {
    // Este es el test del fallo. Si alguien vuelve a añadir `extra` aquí,
    // la importación de archivos anchos se vuelve a caer.
    const payload = toRecipientPayload(exportAncho(3), MAPEO);
    for (const fila of payload) {
      expect(fila).not.toHaveProperty("extra");
    }
  });

  it("el payload no crece con las columnas que no se mapean", () => {
    const estrecho = toRecipientPayload(exportAncho(10, 0), MAPEO);
    const ancho = toRecipientPayload(exportAncho(10, 60), MAPEO);
    // Mismo peso: las 60 columnas de más no viajan.
    expect(JSON.stringify(ancho).length).toBe(JSON.stringify(estrecho).length);
  });

  it("un export de 400 filas y 60 columnas pesa poco, no megabytes", () => {
    const bytes = JSON.stringify(toRecipientPayload(exportAncho(400), MAPEO)).length;
    // Antes del arreglo esto pasaba de 2 MB. Ahora son decenas de KB.
    expect(bytes).toBeLessThan(200_000);
  });

  it("sigue conservando lo que sí se mapea", () => {
    const [fila] = toRecipientPayload(exportAncho(1), MAPEO);
    expect(fila.full_name).toBe("Comprador 0");
    expect(fila.address).toBe("Cra 0 #10-25");
    expect(fila.city).toBe("Medellín");
  });

  it("pega el complemento a la dirección, que es como lo lee el mensajero", () => {
    const rows: CsvRow[] = [
      { nombre: "María", direccion: "Cra 43 #10-25", comp: "apto 501 torre 2" },
    ];
    const [fila] = toRecipientPayload(rows, {
      full_name: "nombre",
      address: "direccion",
      address_2: "comp",
    });
    expect(fila.address).toBe("Cra 43 #10-25 apto 501 torre 2");
    expect(fila).not.toHaveProperty("address_2");
  });
});

describe("toProductPayload — los productos SÍ llevan extra", () => {
  it("at_products tiene columna extra y at_sync_products la guarda", () => {
    // La asimetría es real y deliberada: no es un descuido copiado del otro.
    const rows: CsvRow[] = [{ producto: "Vestido", color: "azul", talla: "S" }];
    const [fila] = toProductPayload(rows, { name: "producto" });
    expect(fila.name).toBe("Vestido");
    expect(fila.extra).toEqual({ color: "azul", talla: "S" });
  });
});

describe("lotesQueQuepan — cortar por peso, no por número de filas", () => {
  it("un archivo estrecho va en pocos lotes", () => {
    const payload = toRecipientPayload(exportAncho(500, 0), MAPEO);
    const lotes = lotesQueQuepan(payload);
    expect(lotes.length).toBeGreaterThan(0);
    // Ninguno se pasa del tope de filas.
    for (const l of lotes) expect(l.length).toBeLessThanOrEqual(200);
  });

  it("ningún lote se pasa del límite de bytes", () => {
    const gordas = Array.from({ length: 50 }, (_, i) => ({
      full_name: `Persona ${i}`,
      notes: "x".repeat(20_000),
    }));
    for (const lote of lotesQueQuepan(gordas, { maxBytes: 100_000 })) {
      // Se permite pasarse solo si el lote es de UNA fila que ya no cabe:
      // partirla no se puede y descartarla perdería un comprador.
      if (lote.length > 1) expect(JSON.stringify(lote).length).toBeLessThanOrEqual(100_000);
    }
  });

  it("una fila que por sí sola no cabe va sola, no se descarta", () => {
    const enorme = { full_name: "Gigante", notes: "x".repeat(900_000) };
    const lotes = lotesQueQuepan([{ full_name: "Normal" }, enorme, { full_name: "Otro" }]);
    // Las tres filas siguen ahí, repartidas.
    expect(lotes.flat().length).toBe(3);
    expect(lotes.flat().some((f) => f.full_name === "Gigante")).toBe(true);
  });

  it("no pierde ni duplica ninguna fila", () => {
    const payload = toRecipientPayload(exportAncho(437), MAPEO);
    const salida = lotesQueQuepan(payload).flat();
    expect(salida.length).toBe(437);
    expect(new Set(salida.map((f) => f.full_name)).size).toBe(437);
  });

  it("mantiene el orden del archivo", () => {
    const payload = toRecipientPayload(exportAncho(250), MAPEO);
    const salida = lotesQueQuepan(payload).flat();
    expect(salida[0].full_name).toBe("Comprador 0");
    expect(salida[249].full_name).toBe("Comprador 249");
  });

  it("una lista vacía no produce lotes", () => {
    expect(lotesQueQuepan([])).toEqual([]);
  });
});

describe("el archivo real que sube un comercio", () => {
  it("un CSV de Excel en español se parsea entero", () => {
    // Separador de punto y coma, comillas, y una coma dentro de un campo.
    const texto = [
      "nombre;telefono;direccion;notas",
      '"Restrepo, María";3001234567;"Cra 43 #10-25";"Dejar en portería"',
      '"Osorio, Juan";3109876543;"Cl 50 #38-14";',
    ].join("\r\n");

    const { headers, rows } = parseCsv(texto);
    expect(headers).toEqual(["nombre", "telefono", "direccion", "notas"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].nombre).toBe("Restrepo, María");
    expect(rows[1].notas).toBe("");
  });
});
