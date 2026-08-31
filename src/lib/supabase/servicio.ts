import { createClient as crearCliente } from "@supabase/supabase-js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL CLIENTE QUE NO TIENE DUEÑO
 *
 * `client.ts` habla por el navegador y `server.ts` habla por la persona que
 * abrió la sesión. Los dos pasan por RLS, y así tiene que ser: RLS es la
 * ÚNICA capa de autorización de esta app (ADR-0001).
 *
 * Falta un tercer caso, y es el que trajo este archivo: cuando el que llama
 * NO es una persona. Un webhook de Polar llega desde los servidores de Polar,
 * sin cookie y sin sesión. Con el cliente de sesión, ese código corre como
 * `anon` y RLS lo bloquea — y aquí está lo caro: un `update` bloqueado por
 * RLS no devuelve error, devuelve CERO FILAS. El webhook de pagos escribía en
 * el log «factura marcada como pagada» mientras la factura seguía pendiente.
 * El comercio pagaba y la plataforma no se enteraba.
 *
 * ── Las reglas de usar esto ───────────────────────────────────────────────
 *
 * Esta llave se salta RLS entera. No hay política que la pare, ni comercio
 * cuyos datos no pueda leer. Así que:
 *
 *   1. Solo desde código que corre en el servidor. La guarda de abajo revienta
 *      si alguien lo importa en un componente de navegador — antes de que la
 *      llave llegue a viajar en un paquete.
 *   2. Solo cuando NO hay una persona detrás. Si hay sesión, se usa
 *      `server.ts` y se deja que RLS haga su trabajo: es lo que impide que un
 *      comercio toque las facturas de otro.
 *   3. Cada uso se acota a mano. Sin RLS que ponga el `where` por uno, el
 *      `where` lo tiene que poner el código, y una equivocación ahí toca los
 *      datos de todos los comercios a la vez.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Un cliente con la llave de servicio.
 *
 * Se crea por llamada y no una vez en el módulo, a propósito: importarlo no
 * debería exigir la variable. Así una ruta que no lo use sigue compilando y
 * sirviendo aunque `SUPABASE_SERVICE_ROLE_KEY` no esté configurada, y el que
 * sí la necesita se entera con un error que dice el nombre de la variable —
 * no con un 500 sin explicación, que es como se pierden las tardes.
 */
export function clienteDeServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof window !== "undefined") {
    throw new Error(
      "clienteDeServicio() se llamó desde el navegador. Esta llave se salta " +
        "RLS: no puede salir del servidor bajo ningún concepto."
    );
  }

  if (!url || !llave) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en este " +
        "entorno. La usan las rutas que atienden a máquinas y no a personas, " +
        "como /api/polar/webhook. Se configura en Vercel, nunca en el repo."
    );
  }

  return crearCliente(url, llave, {
    auth: {
      // Sin sesión que refrescar ni que guardar: esto no es un navegador y
      // dejar tokens en memoria entre invocaciones no aporta nada.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
