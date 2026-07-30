/**
 * Recuperación de errores del cliente.
 *
 * EL CASO QUE ESTO RESUELVE
 * Esta app se publica varias veces al día y vive en pestañas que quedan
 * abiertas durante todo el turno. Cuando sale una versión nueva, Vercel deja de
 * servir los trozos de JavaScript de la anterior: la pestaña vieja sigue
 * pidiendo archivos que ya no existen y, al navegar, Next revienta con una
 * pantalla en blanco. No es un error de la app, es una app desactualizada — y
 * la cura es recargar, no reintentar.
 *
 * Se recarga una sola vez por sesión. Si tras recargar vuelve a fallar, el
 * problema es otro y hay que mostrarlo, no dejar el teléfono dando vueltas en
 * un bucle de recargas.
 */

const YA_RECARGUE = "at_recarga_por_version";

/** ¿Este error es "tu pestaña quedó vieja" y no un fallo de verdad? */
export function esErrorDeVersion(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === "ChunkLoadError") return true;
  return /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(
    e.message ?? ""
  );
}

/**
 * Recarga si el error fue por versión nueva. Devuelve true si va a recargar,
 * para que quien llama sepa que no vale la pena pintar nada más.
 */
export function recargarPorVersionNueva(error: unknown): boolean {
  if (typeof window === "undefined" || !esErrorDeVersion(error)) return false;

  try {
    if (window.sessionStorage.getItem(YA_RECARGUE) === "1") return false;
    window.sessionStorage.setItem(YA_RECARGUE, "1");
  } catch {
    /* almacenamiento bloqueado: se recarga igual, una vez no hace daño */
  }

  window.location.reload();
  return true;
}
