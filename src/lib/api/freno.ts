/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL FRENO DE LAS RUTAS /api
 *
 * ── Qué frena esto, y qué NO ──────────────────────────────────────────────
 *
 * El freno de verdad de esta plataforma vive en Postgres (migración 0063,
 * `at_limitar`), y tiene que estar ahí por un motivo que no cambia: el
 * navegador habla DIRECTO con Supabase con la llave anónima, así que la
 * mayoría del tráfico no pasa por este servidor. Un límite aquí no protegería
 * esa puerta.
 *
 * Lo que sí pasa por aquí son estas seis rutas, y una de ellas —telemetría—
 * es pública, no toca la base y no tenía tope de ninguna clase: cualquiera
 * podía llenar los Runtime Logs de Vercel a base de peticiones y dejarnos
 * ciegos justo con la herramienta que compramos para ver.
 *
 * ── Por qué en memoria y no en la base ────────────────────────────────────
 *
 * Este contador vive en el proceso, así que cada instancia de la función
 * tiene el suyo: repartido entre diez instancias, el tope real es diez veces
 * el declarado. Eso es una limitación de verdad y conviene decirla en voz
 * alta, no disimularla.
 *
 * Se eligió igual porque para lo que protege es lo correcto:
 *   · lo que se protege es el LOG, que también es por instancia;
 *   · un contador en la base metería un viaje de ida y vuelta a Oregón en
 *     cada reporte de error — o sea, castigar la ruta que existe justamente
 *     para enterarse de que algo va mal;
 *   · y una ruta que escribe en la base desde un endpoint público es
 *     exactamente lo que la 0063 quería evitar.
 *
 * El día que haya un Redis compartido (o el tráfico lo pida), esto se cambia
 * por dentro sin tocar ninguna ruta: `frenar()` es el único punto de entrada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { NextRequest } from "next/server";

interface Cubo {
  golpes: number;
  /** Cuándo caduca esta ventana, en milisegundos epoch. */
  hasta: number;
}

const cubos = new Map<string, Cubo>();

/**
 * Techo de claves vivas. Sin esto, un atacante que rota de IP en cada
 * petición hace crecer el mapa hasta tumbar la instancia por memoria: el
 * freno se convertiría en la vulnerabilidad.
 *
 * Al llegar al techo se limpia lo caducado; si aun así no baja, se vacía
 * entero. Perder los contadores es un mal menor frente a quedarse sin RAM, y
 * el atacante que provoca el vaciado ya está pagando el precio de rotar.
 */
const MAX_CLAVES = 10_000;

/**
 * Quién está llamando, con el mismo criterio que `at_actor_de_la_peticion()`
 * en la base: la IP del cliente, tomada de las cabeceras que pone Vercel.
 *
 * `x-forwarded-for` es una lista y SOLO el primer elemento es el cliente —
 * los demás son los saltos intermedios, y quedarse con el último es el error
 * clásico que hace que todo el tráfico caiga en el mismo cubo.
 */
export function actorDe(request: NextRequest): string {
  const cabeceras = request.headers;
  const ip =
    cabeceras.get("x-real-ip") ??
    cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Sin IP visible no se inventa un actor por petición: eso volvería inútil el
  // contador. Caen todas en el mismo cubo, igual que hace la base.
  return ip && ip.length > 0 ? ip : "sin-ip";
}

function limpiar(ahora: number): void {
  for (const [clave, cubo] of cubos) {
    if (cubo.hasta <= ahora) cubos.delete(clave);
  }
  if (cubos.size >= MAX_CLAVES) cubos.clear();
}

export interface Veredicto {
  /** `true` si hay que dejarla pasar. */
  pasa: boolean;
  /** Segundos que debería esperar quien se pasó. Va en `Retry-After`. */
  esperar: number;
}

/**
 * Cuenta una petición y dice si pasa.
 *
 * @param bucket  qué se está limitando (`telemetria`, `whatsapp`…). Cada uno
 *                lleva su propia cuenta: pasarse en uno no cierra los demás.
 * @param actor   a quién se le cuenta. Normalmente `actorDe(request)`.
 * @param tope    peticiones permitidas por ventana.
 * @param ventanaSeg  cuánto dura la ventana.
 */
export function frenar(
  bucket: string,
  actor: string,
  tope: number,
  ventanaSeg = 60
): Veredicto {
  const ahora = Date.now();
  if (cubos.size >= MAX_CLAVES) limpiar(ahora);

  const clave = `${bucket}:${actor}`;
  const cubo = cubos.get(clave);

  if (!cubo || cubo.hasta <= ahora) {
    cubos.set(clave, { golpes: 1, hasta: ahora + ventanaSeg * 1000 });
    return { pasa: true, esperar: 0 };
  }

  cubo.golpes++;
  if (cubo.golpes > tope) {
    return { pasa: false, esperar: Math.max(1, Math.ceil((cubo.hasta - ahora) / 1000)) };
  }
  return { pasa: true, esperar: 0 };
}

/** Solo para los tests: deja el contador como recién arrancado. */
export function olvidarTodo(): void {
  cubos.clear();
}
