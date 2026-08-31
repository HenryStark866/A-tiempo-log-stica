/**
 * El freno de las rutas /api.
 *
 * Lo que se prueba aquí es lo que se rompe en silencio: un limitador mal
 * escrito no se cae, deja pasar. Y no hay pantalla donde se note.
 *
 * Tres cosas concretas, todas por un motivo que ya se ha pagado en otro sitio:
 *
 *  1. Que el tope se aplique y que la ventana caduque de verdad. Un contador
 *     que nunca se reinicia deja al mensajero fuera hasta que se reinicie la
 *     instancia.
 *  2. Que cada cubo cuente aparte. Si `telemetria` y `whatsapp-enviar`
 *     compartieran cuenta, un error repetido en un teléfono dejaría al CEDI
 *     sin poder mandar códigos.
 *  3. Que `actorDe` se quede con el PRIMER elemento de x-forwarded-for. Es el
 *     error clásico: quedarse con el último mete a TODO el tráfico en el mismo
 *     cubo —los saltos intermedios son los mismos para todos— y el freno pasa
 *     de proteger a cerrarle la puerta a cualquiera.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { actorDe, frenar, olvidarTodo } from "@/lib/api/freno";
import type { NextRequest } from "next/server";

/** Lo mínimo que mira `actorDe`: las cabeceras. */
function peticionCon(cabeceras: Record<string, string>): NextRequest {
  return { headers: new Headers(cabeceras) } as NextRequest;
}

beforeEach(() => olvidarTodo());

describe("el tope", () => {
  it("deja pasar hasta el tope y corta la siguiente", () => {
    for (let i = 0; i < 3; i++) {
      expect(frenar("prueba", "ip:1", 3).pasa, `petición ${i + 1}`).toBe(true);
    }
    expect(frenar("prueba", "ip:1", 3).pasa).toBe(false);
  });

  it("dice cuánto esperar cuando corta", () => {
    frenar("prueba", "ip:1", 1, 60);
    const v = frenar("prueba", "ip:1", 1, 60);
    expect(v.pasa).toBe(false);
    // Nunca 0: un Retry-After de cero invita a reintentar en bucle.
    expect(v.esperar).toBeGreaterThan(0);
    expect(v.esperar).toBeLessThanOrEqual(60);
  });

  it("no le cuenta a uno lo que hizo otro", () => {
    frenar("prueba", "ip:1", 1);
    expect(frenar("prueba", "ip:2", 1).pasa).toBe(true);
  });

  it("cada cubo lleva su propia cuenta", () => {
    frenar("telemetria", "ip:1", 1);
    expect(frenar("telemetria", "ip:1", 1).pasa).toBe(false);
    // Pasarse reportando errores no puede dejar al CEDI sin mandar códigos.
    expect(frenar("whatsapp-enviar", "ip:1", 1).pasa).toBe(true);
  });
});

describe("la ventana caduca", () => {
  afterEach(() => vi.useRealTimers());

  it("vuelve a dejar pasar cuando pasa la ventana", () => {
    vi.useFakeTimers();
    expect(frenar("prueba", "ip:1", 1, 60).pasa).toBe(true);
    expect(frenar("prueba", "ip:1", 1, 60).pasa).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(frenar("prueba", "ip:1", 1, 60).pasa).toBe(true);
  });
});

describe("a quién se le cuenta", () => {
  it("se queda con el PRIMER elemento de x-forwarded-for", () => {
    // El primero es el cliente; los demás son los saltos intermedios, que son
    // los mismos para todo el mundo.
    expect(actorDe(peticionCon({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }))).toBe(
      "1.2.3.4"
    );
  });

  it("x-real-ip manda sobre x-forwarded-for", () => {
    expect(
      actorDe(peticionCon({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }))
    ).toBe("5.6.7.8");
  });

  it("sin cabeceras, todos caen en el mismo cubo y no se inventa un actor", () => {
    // Inventar uno por petición volvería inútil el contador: cada llamada
    // estrenaría cuenta y el tope no se alcanzaría jamás.
    expect(actorDe(peticionCon({}))).toBe("sin-ip");
    expect(actorDe(peticionCon({ "x-forwarded-for": "  " }))).toBe("sin-ip");
  });
});
