/**
 * La foto que se lleva el mensajero al salir.
 *
 * Dos cosas que rompen callado y que por eso están probadas:
 *
 *  1. **El formato viejo.** Antes se guardaba el valor pelado; ahora va
 *     envuelto con su hora. Quien tenga la app abierta desde antes del cambio
 *     tiene una foto del formato viejo en el teléfono, y si `leer` no la
 *     entendiera, ese mensajero abriría su ruta en blanco un lunes a las seis
 *     de la mañana. Nadie se enteraría: no hay error, solo una lista vacía.
 *
 *  2. **`olvidarTodo` recorriendo al revés.** Borrar de localStorage corre los
 *     índices hacia atrás, así que un bucle hacia adelante se salta una de
 *     cada dos claves. El fallo deja datos de destinatarios —nombres,
 *     direcciones, teléfonos— en un teléfono que ya cambió de manos.
 *
 * El entorno de vitest es `node` y no tiene localStorage, así que aquí va uno
 * de mentira: es un Map con la interfaz justa que usa `cache.ts`, incluido
 * `key(i)`, que es de donde sale el problema del recorrido.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

class AlmacenDeMentira {
  private datos = new Map<string, string>();
  get length() {
    return this.datos.size;
  }
  key(i: number) {
    return [...this.datos.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.datos.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.datos.set(k, v);
  }
  removeItem(k: string) {
    this.datos.delete(k);
  }
}

let almacen: AlmacenDeMentira;

beforeEach(() => {
  almacen = new AlmacenDeMentira();
  vi.stubGlobal("localStorage", almacen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Import dinámico para que el localStorage de mentira ya esté puesto.
async function cargar() {
  return await import("@/lib/offline/cache");
}

describe("lo guardado para trabajar sin señal", () => {
  it("devuelve lo que se guardó, con su hora", async () => {
    const cache = await cargar();
    cache.guardar("entregas", [{ id: "a" }, { id: "b" }]);

    expect(cache.leer<{ id: string }[]>("entregas")).toEqual([{ id: "a" }, { id: "b" }]);
    expect(cache.guardadoEn("entregas")).toBeInstanceOf(Date);
  });

  it("sigue leyendo el formato viejo, sin hora pero sin perderse", async () => {
    const cache = await cargar();
    // Tal cual lo dejaba la versión anterior: el valor pelado.
    almacen.setItem("yam:cache:entregas", JSON.stringify([{ id: "vieja" }]));

    expect(cache.leer<{ id: string }[]>("entregas")).toEqual([{ id: "vieja" }]);
    expect(cache.guardadoEn("entregas")).toBeNull();
  });

  it("no revienta con una clave corrupta", async () => {
    const cache = await cargar();
    almacen.setItem("yam:cache:entregas", "{esto no es json");

    expect(cache.leer("entregas")).toBeNull();
    expect(cache.guardadoEn("entregas")).toBeNull();
  });

  it("al cerrar sesión no queda ni una clave, ni las de en medio", async () => {
    const cache = await cargar();
    cache.guardar("entregas", [1]);
    cache.guardar("cedi", [2]);
    cache.guardar("recogidas", [3]);
    // Ajena: no lleva el prefijo y no se toca.
    almacen.setItem("yam:rastreo", "1");

    cache.olvidarTodo();

    expect(cache.leer("entregas")).toBeNull();
    expect(cache.leer("cedi")).toBeNull();
    expect(cache.leer("recogidas")).toBeNull();
    expect(almacen.getItem("yam:rastreo")).toBe("1");
  });
});

describe("de cuándo son los datos", () => {
  it("lo dice en minutos, horas y días", async () => {
    const cache = await cargar();
    const ahora = new Date("2026-08-25T10:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(ahora);

    const hace = (ms: number) => new Date(ahora.getTime() - ms);
    const MIN = 60_000;
    const HORA = 60 * MIN;

    expect(cache.haceCuanto(hace(10_000))).toBe("hace un momento");
    expect(cache.haceCuanto(hace(1 * MIN))).toBe("hace 1 minuto");
    expect(cache.haceCuanto(hace(40 * MIN))).toBe("hace 40 minutos");
    expect(cache.haceCuanto(hace(1 * HORA))).toBe("hace 1 hora");
    expect(cache.haceCuanto(hace(5 * HORA))).toBe("hace 5 horas");
    expect(cache.haceCuanto(hace(30 * HORA))).toBe("ayer");
    expect(cache.haceCuanto(hace(72 * HORA))).toBe("hace 3 días");
  });

  it("sin fecha no inventa nada", async () => {
    const cache = await cargar();
    expect(cache.haceCuanto(null)).toBeNull();
  });
});
