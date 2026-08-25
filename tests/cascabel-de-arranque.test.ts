/**
 * El cascabel del splash: que suene, y que suene DOS veces.
 *
 * Esto se prueba y no se mira a ojo porque un sonido no deja rastro en la
 * pantalla: si mañana alguien toca los tiempos y queda sonando una sola vez, o
 * las dos pisadas una encima de otra, nadie lo ve en una captura ni lo caza el
 * compilador. Solo se nota abriendo la app con el volumen arriba y prestando
 * atención — o sea, nunca.
 *
 * Se cuenta lo que se programa en el reloj del audio, que es donde de verdad
 * ocurre: tres osciladores por cascabel (Sol-Do-Mi), dos cascabeles, separados
 * por la pausa que dice el módulo. Un AudioContext de mentira apunta cada
 * `start()` en vez de hacer ruido.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/** Cada `start()` que se programa, con el momento exacto en que le toca. */
let arranques: number[] = [];

class OsciladorFalso {
  type = "";
  frequency = { value: 0 };
  connect() {}
  start(t: number) {
    arranques.push(t);
  }
  stop() {}
}

class GananciaFalsa {
  gain = {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  connect() {}
}

class ContextoFalso {
  state: AudioContextState;
  currentTime = 10; // un valor cualquiera distinto de 0: los desfases son relativos
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
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

/** El contexto que verá el módulo en esta prueba. */
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
  vi.resetModules(); // el módulo cachea su contexto: hay que reimportarlo limpio
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function cargar() {
  return await import("@/lib/sonidoNotificacion");
}

describe("el cascabel del arranque", () => {
  it("programa dos cascabeles de tres notas, separados 700 ms", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();

    expect(arranques).toHaveLength(6);

    // Relativo al reloj del contexto, para no depender de dónde arrancó.
    const t0 = contexto.currentTime;
    const relativos = arranques.map((t) => Math.round((t - t0) * 1000));

    // Primer cascabel: las tres notas a 0, 75 y 150 ms.
    expect(relativos.slice(0, 3)).toEqual([0, 75, 150]);
    // Segundo: lo mismo, 700 ms más tarde.
    expect(relativos.slice(3)).toEqual([700, 775, 850]);
  });

  it("el aviso normal suena una sola vez", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoNotificacion();

    expect(arranques).toHaveLength(3);
  });

  it("si el audio está dormido, lo despierta y suena igual", async () => {
    montar("suspended");
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();
    // `resume()` devuelve una promesa: hay que dejar pasar la microtarea.
    await Promise.resolve();
    await Promise.resolve();

    expect(contexto.state).toBe("running");
    expect(arranques).toHaveLength(6);
  });
});
