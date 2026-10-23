import { createClient as crearCliente } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "./server";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PERSONA, VENGA DEL NAVEGADOR O DEL TELÉFONO
 *
 * `server.ts` identifica a la persona por **cookies**, y hasta ahora bastaba:
 * todo lo que llamaba a `/api` era el navegador. La app nativa no tiene
 * cookies que compartir — guarda su sesión en el llavero del teléfono y manda
 * el token en la cabecera `Authorization: Bearer`—, así que contra `server.ts`
 * recibía un 401 por una razón que no tiene nada que ver con sus permisos.
 *
 * Esto elige el camino según lo que traiga la petición. Lo importante es lo
 * que NO cambia: en los dos casos el cliente lleva la llave anónima y el token
 * de la persona, así que **RLS sigue decidiendo**. No es una puerta de
 * servicio ni un atajo de autorización; es la misma puerta con dos llaves.
 *
 * El token NO se cree por venir en la cabecera: `getUser()` lo manda a validar
 * contra GoTrue en cada llamada. Un token inventado o vencido no identifica a
 * nadie, igual que una cookie falsificada.
 *
 * Úsalo en las rutas `/api` que atienden también al móvil. Donde solo hay
 * navegador, `server.ts` sigue siendo lo correcto y más corto; y cuando quien
 * llama es una máquina, `servicio.ts` — que se salta RLS entera.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function clienteDeLaPersona(request: NextRequest) {
  const cabecera = request.headers.get("authorization");
  const token = cabecera?.toLowerCase().startsWith("bearer ")
    ? cabecera.slice(7).trim()
    : null;

  if (!token) return createClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return crearCliente(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    // En el servidor no hay nada que persistir ni que refrescar: la sesión la
    // administra el teléfono. Guardarla aquí mezclaría a dos personas que
    // caigan en la misma instancia, que es el error clásico de este atajo.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
