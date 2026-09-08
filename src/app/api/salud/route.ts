import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorDe, frenar } from "@/lib/api/freno";
import { SIN_CACHE } from "@/lib/api/respuesta";
import { NextResponse } from "next/server";

/**
 * GET /api/salud — ¿está bien esto?
 *
 * ── Qué agujero tapa ──────────────────────────────────────────────────────
 *
 * El 2026-08-27 salieron tres fallos que llevaban semanas o meses corriendo
 * sin quejarse: el cron de Shopify devolvía 401 cada quince minutos, la cola
 * de mensajes se llenaba sin que nadie la vaciara, y cuatro códigos de entrega
 * de paquetes YA ENTREGADOS esperaban para salir de golpe. Ninguno de los tres
 * rompía una pantalla, así que nadie reclamó y nadie se enteró.
 *
 * Esto es el número que faltaba: una dirección que se puede preguntar cada
 * pocos minutos, desde fuera y sin credenciales, y que se pone en rojo cuando
 * algo lleva parado más de lo normal. Lo interroga
 * `.github/workflows/vigilancia.yml`, y sirve igual para cualquier vigilante
 * externo (UptimeRobot, Better Stack) el día que se ponga uno.
 *
 * ── El código HTTP es el mensaje ──────────────────────────────────────────
 *
 * 200 si todo va; 503 si algo va mal. A propósito, para que `curl -f` baste y
 * un vigilante no tenga que entender nuestro JSON. «Degradado» también da 503:
 * si la cola lleva un cuarto de hora sin vaciarse, eso hay que mirarlo hoy,
 * no cuando alguien reclame.
 *
 * ── Qué se enseña ─────────────────────────────────────────────────────────
 *
 * Sin sesión, solo el semáforo y la versión publicada. El detalle —cuántos
 * mensajes hay en cola, qué cron falló— lo decide `at_salud()` en la base
 * según quién pregunte, y solo lo ve el staff: decirle a un curioso por dónde
 * flaquea el sistema es decirle cuándo conviene empujar.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Un vigilante pregunta cada minuto; esto es de sobra y corta los bucles. */
const CONSULTAS_POR_MINUTO = 60;

export async function GET(request: NextRequest) {
  if (!frenar("salud", actorDe(request), CONSULTAS_POR_MINUTO).pasa) {
    return NextResponse.json(
      { ok: false, estado: "limitado" },
      { status: 429, headers: { ...SIN_CACHE, "Retry-After": "60" } }
    );
  }

  const version = process.env.NEXT_PUBLIC_VERSION ?? "local";

  try {
    // Con el cliente de sesión, no con el de servicio: así `at_salud()` sabe
    // si quien pregunta es del staff y decide ella cuánto contar. Sin cookie
    // —que es como llega el vigilante— corre como anon y devuelve el semáforo.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("at_salud");

    if (error) {
      // La base contestó que no. Es lo más grave que puede decir esta ruta:
      // sin base no hay operación, por mucho que la página cargue.
      console.error("[yam][salud] la base no respondió:", error.message);
      return NextResponse.json(
        { ok: false, estado: "caido", version, motivo: "La base de datos no respondió." },
        { status: 503, headers: SIN_CACHE }
      );
    }

    const salud = (data ?? {}) as { estado?: string };
    const bien = salud.estado === "ok";

    return NextResponse.json(
      { ok: bien, version, ...salud },
      { status: bien ? 200 : 503, headers: SIN_CACHE }
    );
  } catch (e) {
    console.error("[yam][salud] error inesperado:", e);
    return NextResponse.json(
      { ok: false, estado: "caido", version },
      { status: 503, headers: SIN_CACHE }
    );
  }
}
