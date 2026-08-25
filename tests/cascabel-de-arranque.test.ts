/**
 * El khöömei del splash: que suene, que suene DOS veces, y que cante las
 * notas que tiene que cantar.
 *
 * Esto se prueba y no se escucha a ojo porque un sonido no deja rastro en la
 * pantalla: si mañana alguien toca los tiempos y queda sonando una sola vez, o
 * el filtro deja de recorrer los armónicos y se queda en un zumbido, nadie lo
 * ve en una captura ni lo caza el compilador. Solo se nota abriendo la app con
 * el volumen arriba y prestando atención — o sea, nunca.
 *
 * Se cuenta lo que se programa en el reloj del audio, que es donde de verdad
 * ocurre. Un AudioContext de mentira apunta cada `start()` y cada movimiento
 * del pasa banda en vez de hacer ruido.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/** Cada `start()` programado, con el momento que le toca. */
let arranques: number[] = [];
/** Cada frecuencia por la que se hace pasar el tracto vocal. */
let recorridoDelFiltro: number[] = [];

class ParamFalso {
  value = 0;
  constructor(private apunta = false) {}
  setValueAtTime(v: number) {
    if (this.apunta) recorridoDelFiltro.push(v);
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (this.apunta) recorridoDelFiltro.push(v);
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
}

class NodoFalso {
  connect(destino: unknown) {
    return destino;
  }
}

class OsciladorFalso extends NodoFalso {
  type = "";
  frequency = new ParamFalso();
  detune = new ParamFalso();
  start(t: number) {
    arranques.push(t);
  }
  stop() {}
}

class FiltroFalso extends NodoFalso {
  type = "";
  // Solo el pasa banda —el tracto vocal— apunta su recorrido: es el que canta.
  frequency = new ParamFalso(true);
  Q = new ParamFalso();
}

class GananciaFalsa extends NodoFalso {
  gain = new ParamFalso();
}

class ContextoFalso {
  state: AudioContextState;
  currentTime = 10; // distinto de 0: los desfases son relativos
  destination = {};
  constructor(estado: AudioContextState = "running") {
    this.state = estado;
  }
  createOscillator() {
    return new OsciladorFalso();
  }
  createGain() {
    return new GananciaFalsa();
  }
  createBiquadFilter() {
    return new FiltroFalso();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

let contexto: ContextoFalso;

function montar(estadoInicial: AudioContextState = "running") {
  contexto = new ContextoFalso(estadoInicial);
  const Ctor = function () {
    return contexto;
  } as unknown as typeof AudioContext;
  vi.stubGlobal("window", { AudioContext: Ctor });
}

beforeEach(() => {
  arranques = [];
  recorridoDelFiltro = [];
  vi.resetModules(); // el módulo cachea su contexto: hay que reimportarlo limpio
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function cargar() {
  return await import("@/lib/sonidoNotificacion");
}

/** Los armónicos 6, 8 y 10 de un Do3 son Sol5, Do6 y Mi6. */
const SOL5 = 130.81 * 6;
const DO6 = 130.81 * 8;
const MI6 = 130.81 * 10;

describe("el khöömei del arranque", () => {
  it("canta dos frases separadas 700 ms", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();

    // Dos osciladores por frase: el bordón y su vibrato.
    expect(arranques).toHaveLength(4);

    const t0 = contexto.currentTime;
    const relativos = [...new Set(arranques.map((t) => Math.round((t - t0) * 1000)))];
    expect(relativos).toEqual([0, 700]);
  });

  it("el tracto vocal recorre Sol5 → Do6 → Mi6, dos veces", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();

    const esperado = [SOL5, DO6, MI6, SOL5, DO6, MI6].map((f) => Math.round(f));
    expect(recorridoDelFiltro.map((f) => Math.round(f))).toEqual(esperado);
  });

  it("el aviso normal canta una sola frase", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoNotificacion();

    expect(arranques).toHaveLength(2);
    expect(recorridoDelFiltro.map((f) => Math.round(f))).toEqual(
      [SOL5, DO6, MI6].map((f) => Math.round(f))
    );
  });

  it("si el audio está dormido, lo despierta y suena igual", async () => {
    montar("suspended");
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();
    // `resume()` devuelve una promesa: hay que dejar pasar la microtarea.
    await Promise.resolve();
    await Promise.resolve();

    expect(contexto.state).toBe("running");
    expect(arranques).toHaveLength(4);
  });
});
