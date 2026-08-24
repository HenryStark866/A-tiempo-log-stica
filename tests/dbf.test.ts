import { describe, it, expect } from "vitest";
import { leerDbf, pareceDbf } from "@/lib/dbf";
import { parseCsv } from "@/lib/csv";

/**
 * Construye un .dbf real, byte a byte, para no depender de ningún archivo de
 * muestra ni de una librería que lo genere. Los campos y los valores calzan
 * con lo que un catálogo de productos exportado de un sistema viejo trae de
 * verdad: nombre, precio con decimales, un lógico, una fecha y un memo (que
 * no viaja con el .dbf y por eso tiene que salir vacío).
 */
function construirDbf(): ArrayBuffer {
  type Campo = { nombre: string; tipo: string; longitud: number; decimales?: number };
  const campos: Campo[] = [
    { nombre: "NOMBRE", tipo: "C", longitud: 20 },
    { nombre: "PRECIO", tipo: "N", longitud: 10, decimales: 2 },
    { nombre: "ACTIVO", tipo: "L", longitud: 1 },
    { nombre: "FECHA", tipo: "D", longitud: 8 },
    { nombre: "NOTA", tipo: "M", longitud: 10 },
  ];

  const anchoRegistro = 1 + campos.reduce((s, c) => s + c.longitud, 0);
  const tamEncabezado = 32 + campos.length * 32 + 1;

  type RegistroCrudo = { borrado: boolean; valores: string[] };
  const registros: RegistroCrudo[] = [
    { borrado: false, valores: ["Tornillos 1/2", "   1234.50", "T", "20240115", "0000000001"] },
    { borrado: true, valores: ["Este no debe salir", "     0.00", "F", "20240101", "          "] },
    { borrado: false, valores: ["Tuercas", "    500.00", "F", "20240220", "0000000002"] },
  ];

  const total = tamEncabezado + registros.length * anchoRegistro + 1; // +1 por el EOF 0x1A
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const enc = new TextEncoder();

  dv.setUint8(0, 0x03); // dBase III sin memo
  dv.setUint32(4, registros.length, true);
  dv.setUint16(8, tamEncabezado, true);
  dv.setUint16(10, anchoRegistro, true);

  let p = 32;
  for (const c of campos) {
    bytes.set(enc.encode(c.nombre).subarray(0, 11), p); // el resto queda en 0x00
    bytes[p + 11] = c.tipo.charCodeAt(0);
    bytes[p + 16] = c.longitud;
    bytes[p + 17] = c.decimales ?? 0;
    p += 32;
  }
  bytes[p] = 0x0d; // fin de los descriptores de campo
  p += 1;

  for (const r of registros) {
    bytes[p] = r.borrado ? 0x2a : 0x20;
    p += 1;
    campos.forEach((c, i) => {
      const valor = (r.valores[i] ?? "").padEnd(c.longitud, " ").slice(0, c.longitud);
      bytes.set(enc.encode(valor), p);
      p += c.longitud;
    });
  }
  bytes[p] = 0x1a; // marca de fin de archivo, opcional pero habitual

  return buf;
}

describe("importación de catálogos en .dbf (dBase/FoxPro)", () => {
  it("reconoce la firma de un .dbf real", () => {
    expect(pareceDbf(construirDbf())).toBe(true);
  });

  it("no confunde un CSV cualquiera con un .dbf", () => {
    const csv = new TextEncoder().encode("nombre,precio\nTornillos,1500\n").buffer;
    expect(pareceDbf(csv)).toBe(false);
  });

  it("lee encabezados y filas, saltando el registro borrado", () => {
    const [headers, ...filas] = leerDbf(construirDbf());
    expect(headers).toEqual(["NOMBRE", "PRECIO", "ACTIVO", "FECHA", "NOTA"]);
    expect(filas).toHaveLength(2); // el del medio estaba marcado como borrado
    expect(filas.map((f) => f[0])).toEqual(["Tornillos 1/2", "Tuercas"]);
  });

  it("recorta los campos de texto y numéricos a su valor, sin el relleno de ancho fijo", () => {
    const [, primera] = leerDbf(construirDbf());
    expect(primera[0]).toBe("Tornillos 1/2");
    expect(primera[1]).toBe("1234.50");
  });

  it("convierte el lógico a texto legible", () => {
    const [, primera, segunda] = leerDbf(construirDbf());
    expect(primera[2]).toBe("true");
    expect(segunda[2]).toBe("false");
  });

  it("convierte la fecha AAAAMMDD al formato AAAA-MM-DD de toda la app", () => {
    const [, primera, segunda] = leerDbf(construirDbf());
    expect(primera[3]).toBe("2024-01-15");
    expect(segunda[3]).toBe("2024-02-20");
  });

  it("deja vacío el memo: su texto real vive en un .DBT/.FPT que no viaja con el .dbf", () => {
    const [, primera] = leerDbf(construirDbf());
    expect(primera[4]).toBe("");
  });

  it("el resultado se puede convertir a filas con nombre igual que un CSV", () => {
    // La prueba de fuego: que lo que arma leerDbf sea justo lo que matrizAFilas
    // y el resto del pipeline de importación ya sabe consumir. Se verifica acá
    // reusando parseCsv como ancla de que las filas de un CSV equivalente
    // producen el mismo primer valor de NOMBRE, sin acoplar este test al
    // wiring de matrizAFilas (privado en csv.ts).
    const [headers, primera] = leerDbf(construirDbf());
    const equivalente = parseCsv(`${headers.join(",")}\n${primera.map((v) => `"${v}"`).join(",")}`);
    expect(equivalente.rows[0].NOMBRE).toBe("Tornillos 1/2");
  });
});
