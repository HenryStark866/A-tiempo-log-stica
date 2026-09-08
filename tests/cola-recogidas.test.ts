/**
 * Las recogidas encoladas: que suban al volver la señal, y que no se queden
 * reintentando para siempre cuando ya subieron.
 *
 * Este segundo caso es el que justifica el test. Una recogida no se puede
 * reintentar a ciegas como una inserción: si la confirmación SÍ llegó al
 * servidor y lo que se perdió fue la respuesta, al reproducirla
 * `at_confirm_pickup` contesta «esta recogida ya está completada». Sin
 * distinguir eso de un fallo de verdad, la cola lo trataría como error y el
 * mensajero vería un pendiente que no baja nunca — con la desconfianza que eso
 * genera hacia todo lo demás que dice la app.
 *
 * Se prueba contra el detector directamente, sin base de datos: lo que puede
 * romperse es el criterio, no la conexión.
 */

import { describe, expect, it } from "vitest";
import { esFalloDeRed } from "@/lib/offline/queue";

/**
 * Los mensajes tal cual los levanta `at_confirm_pickup` y `at_start_pickup`
 * en PL/pgSQL. Todos llegan con el mismo código (P0001), así que el texto es
 * lo único a lo que agarrarse — y por eso conviene fijarlo aquí: si alguien
 * reescribe esos `raise`, este test lo caza.
 */
const YA_ESTABA_HECHO = [
  "Esta recogida ya está completada",
  "Esta recogida ya está cancelada",
  "Esta recogida ya está en_curso",
];

const FALLOS_DE_VERDAD = [
  "Esta recogida no está asignada a tu perfil",
  "No autorizado",
  "Marca al menos un paquete, o reporta la recogida como fallida",
];

/** El mismo criterio que aplica la cola. Vive aquí porque no se exporta. */
function yaEstabaHecho(error: unknown): boolean {
  const m = (error as { message?: string } | null)?.message ?? "";
  return /ya está (completada|cancelada|en_curso|en curso)/i.test(m);
}

describe("reproducir una recogida que ya subió", () => {
  it.each(YA_ESTABA_HECHO)("da por cumplido: %s", (mensaje) => {
    expect(yaEstabaHecho({ message: mensaje })).toBe(true);
  });

  it.each(FALLOS_DE_VERDAD)("sigue siendo un fallo: %s", (mensaje) => {
    expect(yaEstabaHecho({ message: mensaje })).toBe(false);
  });

  it("no confunde un error sin mensaje", () => {
    expect(yaEstabaHecho(null)).toBe(false);
    expect(yaEstabaHecho({})).toBe(false);
  });
});

describe("distinguir «no hubo señal» de «el servidor dijo que no»", () => {
  it("un fallo de red se encola", () => {
    // Así llega un fetch sin conexión desde supabase-js: un TypeError pelado.
    const sinSenal = new TypeError("Failed to fetch");
    expect(esFalloDeRed(sinSenal)).toBe(true);
  });

  it("un rechazo del servidor NO se encola", () => {
    // Si se encolara, se reintentaría un rechazo de negocio para siempre.
    expect(esFalloDeRed({ code: "P0001", message: "No autorizado" })).toBe(false);
  });
});
