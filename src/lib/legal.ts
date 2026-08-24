import { MARCA } from "@/lib/marca";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LO LEGAL
 *
 * Colombia exige autorización previa, expresa e informada para tratar datos
 * personales (Ley 1581 de 2012 y Decreto 1377 de 2013). «Informada» significa
 * que la persona pueda leer QUÉ se hace con sus datos antes de aceptar, y
 * «expresa» que tenga que hacer un acto positivo — marcar una casilla, no
 * encontrársela marcada.
 *
 * Por eso la casilla del registro nace vacía y el botón no se habilita hasta
 * que se marca, y por eso se guarda CUÁNDO aceptó y QUÉ VERSIÓN aceptó: si
 * mañana cambian las políticas, hay que poder demostrar qué texto tenía
 * delante cada quien el día que dijo que sí.
 *
 * La aceptación se guarda en los metadatos de la cuenta (auth.users), no en
 * una tabla nueva: nace con el registro, viaja con la cuenta y no depende de
 * que ninguna otra escritura haya salido bien.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Se sube cuando cambie el texto de las políticas.
 *
 * Lo que se guarda en la cuenta es esta cadena, así que cambiarla sin cambiar
 * el texto haría creer que alguien aceptó algo que nunca vio.
 */
export const VERSION_POLITICAS = "2026-08-24";

/**
 * Los datos del responsable del tratamiento.
 *
 * OJO: `nit`, `correo` y `direccion` van vacíos a propósito. Una política de
 * datos tiene que identificar al responsable y decir a dónde escribir para
 * ejercer los derechos de habeas data, y esos tres datos no se pueden
 * adivinar: hay que ponerlos a mano. Mientras estén vacíos, la página
 * sencillamente no los pinta en vez de inventarlos.
 */
export const RESPONSABLE = {
  razonSocial: MARCA.empresa,
  ciudad: MARCA.ciudad,
  nit: "",
  correo: "",
  direccion: "",
} as const;

/** Lo que se guarda en la cuenta al aceptar. */
export function marcaDeAceptacion() {
  return {
    politicas_aceptadas_en: new Date().toISOString(),
    politicas_version: VERSION_POLITICAS,
  };
}
