/**
 * Lo que solo el servidor sabe: qué versión está publicada y qué hora es de
 * verdad. Una sola consulta, `/api/version`, porque las dos respuestas viajan
 * juntas y ninguna pesa nada.
 *
 *  · La versión la usa `RegistrarSW` para darse cuenta de que se publicó algo
 *    nuevo mientras la app estaba abierta.
 *  · La hora la usa el `Reloj` de la barra. Un teléfono con la hora corrida
 *    —pasa más de lo que uno cree en equipos viejos o sin señal— haría que el
 *    mensajero registre entregas con una hora que no coincide con la que ve
 *    el CEDI. Aquí se mide el desfase una vez y se corrige al mostrar.
 */

export interface EstadoDelServidor {
  version: string;
  /** ISO 8601 con zona, tal como lo emite el servidor. */
  ahora: string;
}

/** Milisegundos que hay que sumarle al reloj del aparato para dar en el clavo. */
let desfase = 0;

/** El instante actual, ya corregido contra el servidor. */
export function ahoraSincronizado(): Date {
  return new Date(Date.now() + desfase);
}

/** Cuánto se está corrigiendo, en segundos. Sirve para avisar en pantalla. */
export function desfaseEnSegundos(): number {
  return Math.round(desfase / 1000);
}

/**
 * Al abrir la app, el reloj de la cabecera, el de la barra lateral y el
 * vigilante de versiones preguntan a la vez. Es la misma respuesta para los
 * tres: se comparte la petición en vuelo en lugar de hacer tres.
 */
let enVuelo: Promise<EstadoDelServidor | null> | null = null;

export function consultarServidor(): Promise<EstadoDelServidor | null> {
  if (!enVuelo) {
    enVuelo = preguntar().finally(() => {
      enVuelo = null;
    });
  }
  return enVuelo;
}

async function preguntar(): Promise<EstadoDelServidor | null> {
  const salida = Date.now();
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const datos = (await res.json()) as EstadoDelServidor;
    const regreso = Date.now();
    const servidor = Date.parse(datos.ahora);

    if (Number.isFinite(servidor)) {
      // El instante que mandó el servidor ocurrió en algún punto entre la
      // salida y el regreso de la petición. Se le atribuye la mitad del viaje:
      // es el error más pequeño que se puede suponer sin medir la red aparte.
      desfase = servidor - (salida + (regreso - salida) / 2);
    }
    return datos;
  } catch {
    // Sin señal el reloj sigue andando con la hora del aparato, que es
    // exactamente lo que haría si esto no existiera.
    return null;
  }
}
