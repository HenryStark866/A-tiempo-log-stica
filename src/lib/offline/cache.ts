/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA ÚLTIMA FOTO BUENA
 *
 * Para cuando la carga en vivo falla por falta de señal. No es una caché
 * general de la app —eso es justo lo que `sw.js` decidió no hacer, con razón:
 * los datos de esta operación cambian por minuto— es solo «mejor esto que una
 * pantalla vacía» para las pantallas de trabajo de campo.
 *
 * localStorage y no IndexedDB porque aquí no hay Blobs que guardar (las fotos
 * de evidencia sí van a IndexedDB, en `db.ts`) y una ruta de treinta pedidos
 * ocupa unas decenas de kilobytes.
 *
 * ── Por qué cada foto lleva su hora ────────────────────────────────────────
 * Un mensajero mirando una lista sin señal no tiene forma de saber si lo que
 * ve es de hace dos minutos o de ayer. Y esa diferencia importa: una guía que
 * el CEDI reasignó hace una hora ya no es suya. Guardar la hora permite que la
 * pantalla lo diga —«datos de hace 3 horas»— en vez de fingir que están
 * frescos.
 *
 * El formato viejo (el valor pelado, sin envoltorio) se sigue leyendo: quien
 * tenga una foto guardada de antes de este cambio no la pierde, simplemente
 * no sabemos de cuándo es.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PREFIJO = "yam:cache:";

interface Envoltorio<T> {
  /** Marca de formato nuevo. Sin esto no se distingue de un valor pelado. */
  __yam: 1;
  guardadoEn: string;
  valor: T;
}

function esEnvoltorio<T>(x: unknown): x is Envoltorio<T> {
  return typeof x === "object" && x !== null && (x as { __yam?: number }).__yam === 1;
}

export function guardar<T>(clave: string, valor: T): void {
  try {
    const envuelto: Envoltorio<T> = {
      __yam: 1,
      guardadoEn: new Date().toISOString(),
      valor,
    };
    localStorage.setItem(PREFIJO + clave, JSON.stringify(envuelto));
  } catch {
    /* cuota llena o localStorage no disponible: no es crítico, se sigue sin caché */
  }
}

export function leer<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    return esEnvoltorio<T>(dato) ? dato.valor : (dato as T);
  } catch {
    return null;
  }
}

/** Cuándo se guardó esta foto. `null` si no hay nada o viene del formato viejo. */
export function guardadoEn(clave: string): Date | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    if (!esEnvoltorio(dato)) return null;
    const fecha = new Date(dato.guardadoEn);
    return isNaN(fecha.getTime()) ? null : fecha;
  } catch {
    return null;
  }
}

/**
 * «hace 3 horas», para decírselo a quien está mirando datos sin señal.
 *
 * En minutos y horas y no con la hora exacta porque lo que importa no es
 * cuándo se bajó, sino cuánto hace: «10:42» obliga a hacer la cuenta, y quien
 * está en la calle con el teléfono en una mano no está para cuentas.
 */
export function haceCuanto(fecha: Date | null): string | null {
  if (!fecha) return null;
  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return "hace un momento";
  if (minutos === 1) return "hace 1 minuto";
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  if (horas === 1) return "hace 1 hora";
  if (horas < 24) return `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

/**
 * Borrar todo lo guardado. Se llama al cerrar sesión.
 *
 * Estas fotos traen nombres, direcciones y teléfonos de destinatarios. Un
 * teléfono de reparto pasa de mano en mano —turnos, relevos, el que se quedó
 * sin batería— y quien entre después no tiene por qué encontrarse la ruta de
 * ayer de otra persona.
 *
 * Se recorren las claves al revés porque borrar mueve los índices hacia atrás:
 * yendo de adelante hacia atrás se saltaría una de cada dos.
 */
export function olvidarTodo(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const clave = localStorage.key(i);
      if (clave?.startsWith(PREFIJO)) localStorage.removeItem(clave);
    }
  } catch {
    /* sin localStorage no hay nada que borrar */
  }
}
