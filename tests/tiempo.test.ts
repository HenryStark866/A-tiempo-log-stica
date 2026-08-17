import { describe, it, expect } from "vitest";
import {
  ZONA,
  formatDate,
  formatDateTime,
  hoyEnColombia,
  horaDelDiaEnColombia,
  inicioDeHoyEnColombia,
  primerDiaDelMes,
} from "@/lib/tiempo";

/**
 * Los tres bugs que documenta `src/lib/tiempo.ts`, convertidos en tests.
 *
 * Todos eran el mismo error con distinta cara: usar UTC donde había que usar la
 * hora de Medellín. Se veían solo entre las 7 p. m. y la medianoche —cinco
 * horas al día en las que la operación sigue trabajando— y por eso costaron
 * tanto de encontrar.
 *
 * LA REFERENCIA CLAVE: 2026-08-06T02:30:00Z son las 21:30 del 5 de agosto en
 * Medellín. Ahí es donde UTC y Colombia discrepan de día, y donde todo esto se
 * rompía. Cada test que la usa está defendiendo una regresión concreta.
 */
const NOCHE = new Date("2026-08-06T02:30:00Z"); // = 5 ago 2026, 21:30 en Medellín
const MANANA = new Date("2026-08-05T14:00:00Z"); // = 5 ago 2026, 09:00 en Medellín

describe("la zona es un nombre IANA, no un desfase a mano", () => {
  it("usa America/Bogota", () => {
    // Si algún día vuelve el horario de verano (existió hasta 1993), el nombre
    // lo absorbe solo; un "-05:00" escrito a mano no.
    expect(ZONA).toBe("America/Bogota");
  });
});

describe("hoyEnColombia", () => {
  it("después de las 7 p. m. sigue siendo hoy, no mañana", () => {
    // `new Date().toISOString().slice(0,10)` daba "2026-08-06" aquí, y una
    // recogida se programaba para el día siguiente sola.
    expect(hoyEnColombia(NOCHE)).toBe("2026-08-05");
  });

  it("de día también acierta", () => {
    expect(hoyEnColombia(MANANA)).toBe("2026-08-05");
  });

  it("devuelve el formato YYYY-MM-DD que esperan las columnas date", () => {
    expect(hoyEnColombia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("inicioDeHoyEnColombia", () => {
  it("ancla la medianoche de Medellín, con su desfase explícito", () => {
    expect(inicioDeHoyEnColombia(NOCHE)).toBe("2026-08-05T00:00:00-05:00");
  });

  it("produce algo que Date sabe leer", () => {
    const d = new Date(inicioDeHoyEnColombia(NOCHE));
    expect(Number.isNaN(d.getTime())).toBe(false);
    // Medianoche en Medellín son las 05:00 UTC del mismo día.
    expect(d.toISOString()).toBe("2026-08-05T05:00:00.000Z");
  });
});

describe("primerDiaDelMes", () => {
  it("no se adelanta al mes anterior en la noche del día 1", () => {
    // El bug viejo: `new Date(a, m, 1).toISOString()` caía a las 7 p. m. del
    // último día del mes ANTERIOR, y el período de facturación arrancaba antes
    // de tiempo. Con dinero de por medio, eso es una factura mal cortada.
    const nocheDelPrimero = new Date("2026-08-02T02:30:00Z"); // 1 ago, 21:30 Medellín
    expect(primerDiaDelMes(nocheDelPrimero)).toBe("2026-08-01");
  });

  it("da el primero del mes en curso", () => {
    expect(primerDiaDelMes(NOCHE)).toBe("2026-08-01");
  });
});

describe("horaDelDiaEnColombia", () => {
  it("da la hora de Medellín, no la del aparato", () => {
    expect(horaDelDiaEnColombia(NOCHE)).toBe(21);
    expect(horaDelDiaEnColombia(MANANA)).toBe(9);
  });

  it("la medianoche es 0 y no 24", () => {
    // en-GB con hour12:false devuelve "24" para medianoche en algunas versiones
    // de ICU. Si eso pasara, un saludo de «buenas noches» se rompería.
    const medianoche = new Date("2026-08-05T05:00:00Z"); // 00:00 en Medellín
    expect(horaDelDiaEnColombia(medianoche)).toBeGreaterThanOrEqual(0);
    expect(horaDelDiaEnColombia(medianoche)).toBeLessThan(24);
  });
});

describe("formatDate — una fecha sola no es un instante", () => {
  it("muestra el día que está guardado, sin correrlo hacia atrás", () => {
    // Las columnas `date` llegan como "2026-08-05". `new Date("2026-08-05")` es
    // medianoche UTC, que en Colombia es el 4 a las 7 p. m.: la fecha de
    // recogida se mostraba un día antes.
    const salida = formatDate("2026-08-05");
    expect(salida).toContain("05");
    expect(salida).toContain("2026");
    expect(salida).not.toContain("04");
  });

  it("un timestamp sí se lee en hora de Medellín", () => {
    // 02:30Z del día 6 es todavía el día 5 en Medellín.
    expect(formatDate("2026-08-06T02:30:00Z")).toContain("05");
  });

  it("null, undefined y basura dan «—» en vez de «Invalid Date»", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("no es una fecha")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("muestra la hora de Medellín, sea cual sea la del teléfono", () => {
    // 02:30Z del día 6 son las 21:30 del día 5 en Medellín.
    // El día se comprueba por lo que NO puede aparecer: es-CO escribe el día
    // sin cero delante («5 de ago»), así que buscar "05" probaría el formato de
    // ICU y no la zona horaria — y se rompería al actualizar Node sin que nada
    // del negocio hubiera cambiado.
    const salida = formatDateTime("2026-08-06T02:30:00Z");
    expect(salida).not.toMatch(/\b0?6\b/); // no es el día 6
    expect(salida).toMatch(/\b0?5\b/); // es el día 5
    expect(salida).toMatch(/9:30|21:30/); // 21:30 en Medellín
  });

  it("también responde «—» a lo que no es una fecha", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("cualquier cosa")).toBe("—");
  });
});
