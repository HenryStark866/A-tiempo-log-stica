/**
 * La flecha silbadora del splash: que vuele, que vuelen DOS, y que el silbato
 * suba al salir y baje al alejarse.
 *
 * Esto se prueba y no se escucha a ojo porque un sonido no deja rastro en la
 * pantalla: si mañana alguien toca los tiempos y queda sonando una sola vez, o
 * el barrido se queda plano y en vez de una flecha se oye un pitido, nadie lo
 * ve en una captura ni lo caza el compilador. Solo se nota abriendo la app con
 * el volumen arriba y prestando atención — o sea, nunca.
 *
 * Se cuenta lo que se programa en el reloj del audio, que es donde de verdad
 * ocurre. Un AudioContext de mentira apunta cada `start()` y cada movimiento
 * de frecuencia en vez de hacer ruido.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/** Cada `start()` programado, con el momento que le toca. */
let arranques: number[] = [];
/** El recorrido en altura del silbato. */
let barridoDelSilbato: number[] = [];

class ParamFalso {
  value = 0;
  constructor(private apunta = false) {}
  setValueAtTime(v: number) {
    if (this.apunta) barridoDelSilbato.push(v);
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (this.apunta) barridoDelSilbato.push(v);
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
  // Solo el oscilador apunta su recorrido: es el silbato de la punta. El
  // pasa banda del aire lo sigue, pero medir los dos duplicaría todo.
  frequency = new ParamFalso(true);
  detune = new ParamFalso();
  start(t: number) {
    arranques.push(t);
  }
  stop() {}
}

class FuenteFalsa extends NodoFalso {
  buffer: unknown = null;
  start(t: number) {
    arranques.push(t);
  }
  stop() {}
}

class FiltroFalso extends NodoFalso {
  type = "";
  frequency = new ParamFalso();
  Q = new ParamFalso();
}

class GananciaFalsa extends NodoFalso {
  gain = new ParamFalso();
}

class BufferFalso {
  private datos: Float32Array;
  constructor(muestras: number) {
    this.datos = new Float32Array(muestras);
  }
  getChannelData() {
    return this.datos;
  }
}

class ContextoFalso {
  state: AudioContextState;
  currentTime = 10; // distinto de 0: los desfases son relativos
  sampleRate = 44100;
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
  createBuffer(_canales: number, muestras: number) {
    return new BufferFalso(muestras);
  }
  createBufferSource() {
    return new FuenteFalsa();
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
  barridoDelSilbato = [];
  vi.resetModules(); // el módulo cachea su contexto: hay que reimportarlo limpio
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function cargar() {
  return await import("@/lib/sonidoNotificacion");
}

/** Tres fuentes por flecha: el chasquido de la suelta, el silbato y el aire. */
const FUENTES_POR_FLECHA = 3;

describe("la flecha silbadora", () => {
  it("dispara dos flechas separadas 700 ms", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();

    expect(arranques).toHaveLength(FUENTES_POR_FLECHA * 2);

    const t0 = contexto.currentTime;
    const momentos = [...new Set(arranques.map((t) => Math.round((t - t0) * 1000)))];
    expect(momentos).toEqual([0, 700]);
  });

  it("el silbato sube al salir y baja al alejarse", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoNotificacion();

    // Empieza, sube al pico, y cae por debajo de donde empezó.
    const [inicio, pico, final] = barridoDelSilbato;
    expect(pico).toBeGreaterThan(inicio);
    expect(final).toBeLessThan(inicio);
    // El arco es lo que hace que se lea como algo que pasó volando y no como
    // un pitido: si el recorrido se aplana, esto salta.
    expect(pico / final).toBeGreaterThan(1.8);
  });

  it("el aviso normal dispara una sola flecha", async () => {
    montar();
    const sonido = await cargar();

    sonido.reproducirSonidoNotificacion();

    expect(arranques).toHaveLength(FUENTES_POR_FLECHA);
  });

  it("si el audio está dormido, lo despierta y suena igual", async () => {
    montar("suspended");
    const sonido = await cargar();

    sonido.reproducirSonidoDeArranque();
    // `resume()` devuelve una promesa: hay que dejar pasar la microtarea.
    await Promise.resolve();
    await Promise.resolve();

    expect(contexto.state).toBe("running");
    expect(arranques).toHaveLength(FUENTES_POR_FLECHA * 2);
  });
});
