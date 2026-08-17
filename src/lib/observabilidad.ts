/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVABILIDAD
 *
 * Hasta ahora los fallos de producción se descubrían porque alguien reclamaba.
 * El caso que mejor lo cuenta está escrito en `src/middleware.ts`: el mapa se
 * quedaba gris porque la CSP bloqueaba las teselas, y «el aviso solo sale en la
 * consola, donde nadie que use la app está mirando». El mensajero veía un mapa
 * en blanco y no tenía forma de contarlo; nosotros no teníamos forma de verlo.
 *
 * Esto lo arregla por el camino más corto: los errores del navegador se mandan
 * a `/api/telemetria`, que los escribe en el log del servidor. En Vercel eso ya
 * está: Runtime Logs, sin cuenta nueva, sin dependencia nueva y sin un
 * kilobyte más de JavaScript en el teléfono del mensajero.
 *
 * No pretende ser Sentry. Pretende que dejemos de estar ciegos hoy. `enviar()`
 * es el único punto por donde sale todo, así que el día que se quiera Sentry,
 * se enchufa ahí y no hay que tocar ninguna pantalla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Nivel = "error" | "aviso";

interface Reporte {
  nivel: Nivel;
  mensaje: string;
  pila?: string;
  /** Dónde pasó: la ruta, no la URL entera (los tokens viajan en la URL). */
  ruta?: string;
  /** Qué versión estaba corriendo. Sin esto no se sabe si ya está arreglado. */
  version?: string;
  /** Para agrupar: el `digest` que Next pone a los errores de servidor. */
  digest?: string;
  /** Contexto libre que añade quien reporta. Nunca datos personales. */
  contexto?: Record<string, unknown>;
}

/**
 * Errores idénticos repetidos no aportan nada y sí pueden inundar el log —un
 * error dentro de un render se dispara muchas veces por segundo—. Se recuerda
 * lo ya enviado en memoria: se limpia solo al recargar, que es justo lo que
 * queremos.
 */
const yaEnviados = new Set<string>();
const TOPE = 20;

/**
 * La ruta sin querystring.
 *
 * Los enlaces de rastreo y de pago llevan el token EN LA URL. Mandarla entera
 * al log metería tokens de acceso en un sitio donde no pintan nada — es el
 * mismo motivo por el que el `Referrer-Policy` de esta app es estricto.
 */
function rutaSegura(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.pathname;
}

function enviar(reporte: Reporte): void {
  if (typeof window === "undefined") return;

  const huella = `${reporte.nivel}:${reporte.mensaje}:${reporte.ruta ?? ""}`;
  if (yaEnviados.has(huella) || yaEnviados.size >= TOPE) return;
  yaEnviados.add(huella);

  const cuerpo = JSON.stringify({
    ...reporte,
    ruta: reporte.ruta ?? rutaSegura(),
    version: reporte.version ?? process.env.NEXT_PUBLIC_VERSION,
  });

  // sendBeacon sobrevive a que la pestaña se cierre, que es exactamente cuando
  // más falta hace: el error que tumba la app es el que se pierde si se manda
  // con un fetch normal. Si no está disponible, fetch con keepalive.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetria", new Blob([cuerpo], { type: "application/json" }));
      return;
    }
    void fetch("/api/telemetria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reportar un error nunca puede provocar otro. Si esto falla, se calla.
  }
}

/** Un error que ya rompió algo. Es lo que se mira primero. */
export function reportarError(error: unknown, contexto?: Record<string, unknown>): void {
  const e = error instanceof Error ? error : new Error(String(error));
  enviar({
    nivel: "error",
    mensaje: e.message,
    // Solo las primeras líneas: lo demás es ruido del framework y ocupa log.
    pila: e.stack?.split("\n").slice(0, 8).join("\n"),
    digest: (e as Error & { digest?: string }).digest,
    contexto,
  });
}

/** Algo que no rompió nada pero no debería estar pasando. */
export function reportarAviso(mensaje: string, contexto?: Record<string, unknown>): void {
  enviar({ nivel: "aviso", mensaje, contexto });
}

/**
 * Engancha los errores que no pasan por ningún `try` ni por un error boundary
 * de React: los de código asíncrono suelto y las promesas sin `catch`.
 *
 * Se llama una sola vez, desde el layout de la plataforma.
 */
export function instalarCapturaGlobal(): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (ev: ErrorEvent) => {
    reportarError(ev.error ?? ev.message, { origen: "window.error" });
  };
  const onRechazo = (ev: PromiseRejectionEvent) => {
    reportarError(ev.reason, { origen: "promesa sin catch" });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRechazo);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRechazo);
  };
}
