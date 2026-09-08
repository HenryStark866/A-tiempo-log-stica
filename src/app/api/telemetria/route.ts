import { type NextRequest } from "next/server";
import { actorDe, frenar } from "@/lib/api/freno";
import { recibido } from "@/lib/api/respuesta";

/**
 * Donde aterrizan los errores del navegador y los avisos de la CSP.
 *
 * Solo escribe en `console.error`, que en Vercel son los Runtime Logs. Suena a
 * poco y es justo lo que faltaba: hasta ahora un error en el teléfono del
 * mensajero no llegaba a ninguna parte. Con esto se puede buscar por «[yam]» en
 * los logs y ver qué se está rompiendo, en qué pantalla y en qué versión.
 *
 * Sin base de datos a propósito: guardar esto en Supabase daría escrituras sin
 * control desde un endpoint público, que es justo lo que el freno de la
 * migración 0063 intenta evitar.
 */

/** Un reporte no debería pesar más que esto. Corta a quien intente inundar. */
const TOPE_BYTES = 8_000;

/**
 * Reportes por minuto y por IP.
 *
 * El cliente ya se autolimita: `observabilidad.ts` manda como mucho 20 errores
 * distintos por carga de página. Este tope va por encima de eso con holgura
 * —una pantalla puede recargarse varias veces en un minuto, y los operadores
 * móviles colombianos meten a mucha gente detrás de una sola IP— y sigue
 * cerrando la puerta al que quiera inundar los logs a mano.
 *
 * Sin esto, la ruta que existe para enterarse de que algo va mal era la más
 * cómoda para dejarnos ciegos: pública, sin sesión y sin tope.
 */
const REPORTES_POR_MINUTO = 60;

/** Ni el error más largo necesita más. Recorta antes de escribir en el log. */
function recortar(v: unknown, max = 500): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function POST(request: NextRequest) {
  try {
    // Siempre 204, se pase o no del tope: un endpoint que responde distinto
    // según lo que le manden es un endpoint que se puede sondear. Quien se
    // pasa simplemente deja de aparecer en el log.
    if (!frenar("telemetria", actorDe(request), REPORTES_POR_MINUTO).pasa) {
      return recibido();
    }

    const crudo = await request.text();
    if (crudo.length > TOPE_BYTES) {
      // 204 y no 413: al navegador no le sirve de nada saberlo, y un endpoint
      // que responde distinto según el contenido invita a que lo sondeen.
      return recibido();
    }

    const cuerpo = JSON.parse(crudo) as Record<string, unknown>;

    // Los navegadores mandan los avisos de CSP con esta forma, sin que nadie se
    // lo pida, cuando el middleware declara `report-uri`. Es el aviso que
    // habría cazado el mapa gris en producción el mismo día.
    const csp = cuerpo["csp-report"] as Record<string, unknown> | undefined;
    if (csp) {
      console.error(
        "[yam][csp] bloqueado",
        JSON.stringify({
          directiva: csp["violated-directive"],
          recurso: recortar(csp["blocked-uri"], 200),
          pagina: recortar(csp["document-uri"], 200),
        })
      );
      return recibido();
    }

    console.error(
      `[yam][${cuerpo.nivel === "aviso" ? "aviso" : "error"}]`,
      JSON.stringify({
        mensaje: recortar(cuerpo.mensaje, 300),
        ruta: recortar(cuerpo.ruta, 120),
        version: recortar(cuerpo.version, 40),
        digest: cuerpo.digest ? recortar(cuerpo.digest, 40) : undefined,
        contexto: cuerpo.contexto ? recortar(cuerpo.contexto, 300) : undefined,
        pila: cuerpo.pila ? recortar(cuerpo.pila, 800) : undefined,
        agente: recortar(request.headers.get("user-agent"), 160),
      })
    );

    return recibido();
  } catch {
    // Este endpoint no puede fallar nunca de forma visible: si el reporte de un
    // error provoca otro error, se pierde la señal y encima se ensucia el log.
    return recibido();
  }
}

/**
 * Los navegadores mandan los avisos de CSP con `Content-Type:
 * application/csp-report`, y algunos usan este verbo. Se acepta igual.
 */
export const runtime = "nodejs";
