/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FORMA DE TODA RESPUESTA DE /api
 *
 * Seis rutas escritas en seis momentos distintos contestaban de seis formas:
 * `{ error }`, `{ ok, motivo }`, `{ ok, aviso }`, 204 pelado. Cada pantalla
 * que las consume tuvo que aprenderse la suya, y la próxima ruta va a
 * inventarse la séptima.
 *
 * Aquí se fija una sola: `{ ok: true, ...datos }` o `{ ok: false, motivo }`.
 * `motivo` va SIEMPRE en español y escrito para que se pueda enseñar en
 * pantalla tal cual — quien llama no debería tener que traducir nada.
 *
 * Y todas salen con `Cache-Control: private, no-store`. No es paranoia: estas
 * respuestas llevan datos de una sesión concreta, y basta con que un
 * intermediario —un proxy corporativo, el CDN— guarde una para servírsela a
 * otra persona. Que no se cachee tiene que ser lo que pasa por omisión, no lo
 * que alguien se acuerda de escribir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { NextResponse } from "next/server";

/** Nada de lo que sale por /api se guarda en ninguna caché intermedia. */
export const SIN_CACHE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
} as const;

/**
 * Todo salió bien. Los datos van al mismo nivel, junto a `ok`.
 *
 * `T extends object` y no `Record<string, unknown>`: con lo segundo no se
 * puede pasar una interfaz declarada (como `EstadoGateway`), porque a una
 * interfaz le falta la firma de índice. Obligaba a convertirla a mano en cada
 * llamada, y eso es justo lo que se acaba haciendo con un `as any`.
 */
export function ok<T extends object>(
  datos: T = {} as T,
  cabeceras: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { ok: true, ...datos },
    { status: 200, headers: { ...SIN_CACHE, ...cabeceras } }
  );
}

/**
 * No salió. `motivo` es lo que va a leer una persona, así que se escribe en
 * español y sin jerga: «Tu sesión venció», no «401 unauthorized».
 *
 * `estado` es para la máquina. Los que se usan aquí:
 *   400 falta un dato o viene mal   401 no hay sesión      403 el rol no da
 *   404 no existe                   409 ya estaba hecho    429 vas muy rápido
 *   502 falló algo de fuera         500 fallamos nosotros
 */
export function fallo(
  motivo: string,
  estado = 400,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json(
    { ok: false, motivo, ...extra },
    { status: estado, headers: SIN_CACHE }
  );
}

/**
 * Recibido y no hay nada que contar.
 *
 * Se usa donde la respuesta no le sirve de nada a quien llama —telemetría,
 * avisos de CSP—. Un 204 sin cuerpo también evita que un endpoint público
 * conteste distinto según lo que le manden, que es como se sondea.
 */
export function recibido(): NextResponse {
  return new NextResponse(null, { status: 204, headers: SIN_CACHE });
}
