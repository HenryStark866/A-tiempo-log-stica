import { describe, it, expect } from "vitest";
import { normalizeText, resolveZone, zoneForText } from "@/lib/zones";
import type { Zone } from "@/lib/types";

/**
 * La zona decide la tarifa. Equivocarla no es un fallo visual: es cobrarle mal
 * a un comercio, todos los días, sin que nadie lo note hasta la factura.
 *
 * `zoneForText` es además el espejo en cliente de `at_zone_for_city` en la base.
 * Si un día dejan de coincidir, la app mostrará un precio y la base cobrará
 * otro. Estos tests fijan el comportamiento del lado del cliente; el del lado
 * de la base se prueba en `tests/db/cobro.test.ts`.
 */

function zona(over: Partial<Zone> & { name: string; sort_order: number }): Zone {
  return {
    id: over.name,
    // Null, como las zonas anteriores a la migración 0089: el código corto
    // solo lo tienen las diez subzonas nuevas.
    code: null,
    description: null,
    coverage: null,
    city_fallback: null,
    delivery_rate: 0,
    active: true,
    ...over,
  };
}

// Tarifario de mentira, pero con las trampas reales que documenta zones.ts:
// un sector que contiene a otro, y una ciudad que contiene a otra.
const ZONAS: Zone[] = [
  zona({ name: "Zona 3", sort_order: 3, coverage: "Prado Centro, Girardot, Centro" }),
  zona({ name: "Zona 4", sort_order: 4, coverage: "Girardota, Copacabana" }),
  zona({ name: "Zona 5", sort_order: 5, coverage: "San Antonio de Prado" }),
  zona({ name: "Zona 1", sort_order: 1, coverage: "El Poblado, Belén" }),
  zona({ name: "Zona 9", sort_order: 9, coverage: null, city_fallback: "Medellín, Envigado" }),
];

describe("normalizeText", () => {
  it("baja a minúsculas y quita tildes, igual que at_norm en la base", () => {
    expect(normalizeText("Medellín")).toBe("medellin");
    expect(normalizeText("ITAGÜÍ")).toBe("itagui");
    expect(normalizeText("Belén")).toBe("belen");
  });

  it("trata null y undefined como cadena vacía, sin reventar", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("zoneForText — gana el sector más específico", () => {
  // Estos dos casos están escritos como comentario en zones.ts. Aquí dejan de
  // ser una intención y pasan a ser una comprobación.
  it("«San Antonio de Prado» le gana a «Prado Centro»", () => {
    expect(zoneForText(ZONAS, "Calle 10 San Antonio de Prado")?.name).toBe("Zona 5");
  });

  it("«Girardota» le gana a «Girardot»", () => {
    expect(zoneForText(ZONAS, "Parque de Girardota")?.name).toBe("Zona 4");
  });

  it("encuentra la zona sin importar tildes ni mayúsculas", () => {
    expect(zoneForText(ZONAS, "CRA 43A EL POBLADO")?.name).toBe("Zona 1");
    expect(zoneForText(ZONAS, "belen rosales")?.name).toBe("Zona 1");
  });

  it("solo mira la ciudad si ningún barrio coincidió", () => {
    // "Belén" está en Medellín. Si la ciudad compitiera como un sector más,
    // "medellin" (8 letras) le ganaría a "belen" (5) y se cobraría la tarifa
    // equivocada. Este es el test que impide esa regresión.
    expect(zoneForText(ZONAS, "Belén Rosales, Medellín")?.name).toBe("Zona 1");
    // Sin barrio reconocible, ahí sí manda la ciudad.
    expect(zoneForText(ZONAS, "Medellín")?.name).toBe("Zona 9");
  });

  it("devuelve null con texto vacío o solo espacios", () => {
    expect(zoneForText(ZONAS, "")).toBeNull();
    expect(zoneForText(ZONAS, "    ")).toBeNull();
  });

  it("no depende del orden del arreglo que le llegue, sino de sort_order", () => {
    const alReves = [...ZONAS].reverse();
    expect(zoneForText(alReves, "Parque de Girardota")?.name).toBe("Zona 4");
    expect(zoneForText(alReves, "Belén Rosales, Medellín")?.name).toBe("Zona 1");
  });
});

describe("resolveZone — los tres estados de cobertura", () => {
  it("«asignada» cuando el sector está en el tarifario", () => {
    const r = resolveZone(ZONAS, "Medellín", "Cra 43A El Poblado");
    expect(r.status).toBe("asignada");
    expect(r.zone?.name).toBe("Zona 1");
  });

  it("«por_confirmar» en una ciudad que operamos pero con barrio desconocido", () => {
    // Sin esto, la app decía «Fuera de cobertura» en direcciones de Sabaneta:
    // falso y alarmante, porque es área metropolitana.
    const r = resolveZone([], "Sabaneta", "Calle inventada 123");
    expect(r.status).toBe("por_confirmar");
    expect(r.zone).toBeNull();
  });

  it("«fuera» en una ciudad donde no operamos", () => {
    const r = resolveZone(ZONAS, "Bogotá", "Calle 100");
    expect(r.status).toBe("fuera");
    expect(r.zone).toBeNull();
  });

  it("reconoce las ciudades operadas escritas sin tilde", () => {
    expect(resolveZone([], "medellin").status).toBe("por_confirmar");
    expect(resolveZone([], "ITAGUI").status).toBe("por_confirmar");
  });

  it("funciona sin dirección, solo con la ciudad", () => {
    expect(resolveZone(ZONAS, "Envigado").status).toBe("asignada");
  });
});
