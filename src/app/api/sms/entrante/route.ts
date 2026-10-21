import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { frenar } from "@/lib/api/freno";
import { ok, fallo } from "@/lib/api/respuesta";
import { procesar } from "@/lib/canales/motor";
import { fuenteSupabase } from "@/lib/canales/fuente-supabase";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/sms/entrante — el SMS que llega
 *
 * La puerta de entrada para quien no tiene internet. El celular Android de la
 * empresa (SMS Gateway for Android, el mismo que despacha los códigos de
 * entrega) reenvía aquí cada mensaje recibido. Esta ruta es el adaptador de
 * SMS del motor de canales (src/lib/canales/motor.ts, migración 0150): firma,
 * traduce y le pasa el mensaje. El motor decide si es una consulta (GUIA,
 * CATALOGO, PEDIR…) o si le toca al alta por SMS de la 0145, que sigue
 * funcionando igual: la conversación la lleva `at_sms_recibir` y, al
 * confirmar, se crea el usuario en `auth` (el hash de la clave lo gobierna
 * GoTrue y no nosotros).
 *
 * Un mismo mensaje del gateway se atiende una sola vez (por `messageId`): el
 * reintento de un «SI» no crea dos pedidos.
 *
 * ── Quién puede llamar ────────────────────────────────────────────────────
 * El gateway firma cada webhook: HMAC-SHA256 de `id + payload + timestamp` con
 * un secreto compartido, en la cabecera `x-signature`. Sin
 * `SMSGATE_WEBHOOK_SECRET` configurado esta ruta devuelve 503 y no mira el
 * cuerpo: una puerta que crea cuentas no puede quedar abierta porque falte una
 * variable de entorno. Y se rechaza lo que venga con más de cinco minutos de
 * retraso, para que un mensaje grabado no se pueda repetir mañana.
 *
 * ── Qué NO hace ───────────────────────────────────────────────────────────
 * No contesta el SMS. La respuesta se encola en `at_message_outbox` desde la
 * base y sale por el mismo celular, como cualquier otro mensaje de la
 * plataforma: un segundo camino de salida sería un segundo sitio donde se
 * pierden mensajes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El cuerpo del webhook del gateway, en lo que nos sirve. */
interface WebhookSms {
  id?: string;
  event?: string;
  payload?: {
    messageId?: string;
    message?: string;
    phoneNumber?: string;
    receivedAt?: string;
  };
}

/** Topes. El gateway reenvía de a uno, así que esto es para un abuso, no para el uso. */
const MENSAJES_POR_MINUTO = 60;

/** Un webhook más viejo que esto no se atiende: huele a repetición. */
const VENTANA_FIRMA_MS = 5 * 60 * 1000;

/** Clave de 32+ bytes que comparten el celular y esta ruta. */
function secreto(): string | null {
  const s = process.env.SMSGATE_WEBHOOK_SECRET;
  return s && s.length >= 16 ? s : null;
}

/**
 * La firma del gateway. Se compara en tiempo constante: comparar con `===`
 * filtra, por lo que tarda, cuántos caracteres del principio acertó quien
 * prueba — y con eso se adivina una firma byte a byte.
 */
function firmaValida(
  crudo: string,
  cabecera: string | null,
  marcaDeTiempo: string | null,
  id: string,
  clave: string
): boolean {
  if (!cabecera || !marcaDeTiempo) return false;

  const cuandoSeg = Number(marcaDeTiempo);
  if (!Number.isFinite(cuandoSeg)) return false;
  if (Math.abs(Date.now() - cuandoSeg * 1000) > VENTANA_FIRMA_MS) return false;

  const esperada = createHmac("sha256", clave)
    .update(`${id}${crudo}${marcaDeTiempo}`)
    .digest("hex");

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(cabecera.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const clave = secreto();
  if (!clave) {
    // Ni se lee el cuerpo. Mientras no haya secreto, esta puerta no existe.
    return fallo(
      "La entrada de SMS no está configurada en este entorno.",
      503
    );
  }

  const freno = frenar("sms-entrante", "gateway", MENSAJES_POR_MINUTO);
  if (!freno.pasa) {
    return fallo("Demasiados mensajes seguidos.", 429);
  }

  const crudo = await request.text();

  let cuerpo: WebhookSms;
  try {
    cuerpo = JSON.parse(crudo) as WebhookSms;
  } catch {
    return fallo("Cuerpo ilegible.", 400);
  }

  if (
    !firmaValida(
      crudo,
      request.headers.get("x-signature"),
      request.headers.get("x-timestamp"),
      cuerpo.id ?? "",
      clave
    )
  ) {
    // Sin detalle: a quien prueba firmas no se le dice en qué falló.
    return fallo("No autorizado.", 401);
  }

  const telefono = cuerpo.payload?.phoneNumber?.trim();
  const texto = cuerpo.payload?.message ?? "";
  if (!telefono) {
    // Un evento sin remitente (un acuse de entrega, por ejemplo) no es para
    // nosotros, pero tampoco es un fallo del gateway: 200 y a otra cosa.
    return ok({ atendido: false });
  }

  try {
    const r = await procesar(fuenteSupabase(clienteDeServicio()), {
      canal: "sms",
      telefono,
      texto,
      // El id del SMS es la llave de idempotencia; el del evento, si no viene.
      proveedorId: cuerpo.payload?.messageId ?? cuerpo.id ?? null,
    });
    // Las respuestas ya quedaron en at_message_outbox: salen por el celular.
    return ok({
      atendido: r.ruta === "motor" || r.ruta === "alta",
      ruta: r.ruta,
      creado: r.creado ?? false,
      rol: r.rol ?? null,
    });
  } catch (e) {
    if ((e as { codigo?: string }).codigo === "PT429") {
      // Un número que escribe de más. 200 para que el gateway no reintente,
      // y sin respuesta: contestarle sería seguirle el juego.
      return ok({ atendido: false, frenado: true });
    }
    // El mensaje quedó sin marcar como atendido: el reintento lo vuelve a
    // intentar entero (y el alta que falló al crear el usuario se remata).
    console.error("[sms-entrante] no se pudo atender", (e as Error).message);
    return fallo("No se pudo atender el mensaje.", 502);
  }
}

/**
 * El gateway comprueba la URL antes de guardarla. Un GET que responde 200 le
 * basta, y no dice nada de lo que hay detrás.
 */
export async function GET() {
  return ok({ servicio: "sms-entrante" });
}
