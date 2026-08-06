/**
 * La última foto buena de una lista, para cuando la carga en vivo falla por
 * falta de señal. No es una caché general de la app —eso es justo lo que
 * `sw.js` decidió no hacer, con razón: los datos de esta operación cambian
 * por minuto— es solo "mejor esto que una pantalla vacía" para las tres
 * pantallas de trabajo de campo. Un objeto plano por clave, en localStorage
 * porque no hay Blobs que guardar aquí y no vale la pena abrir IndexedDB para
 * esto.
 */

const PREFIJO = "yam:cache:";

export function guardar<T>(clave: string, valor: T): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    /* cuota llena o localStorage no disponible: no es crítico, se sigue sin caché */
  }
}

export function leer<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}
