import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { frenar } from "@/lib/api/freno";
import { ok, fallo } from "@/lib/api/respuesta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/sms/entrante — el SMS que llega
 *
 * La puerta de entrada para quien no tiene internet. El celular Android de la
 * empresa (SMS Gateway for Android, el mismo que despacha los códigos de
 * entrega) reenvía aquí cada mensaje recibido, y la conversación —el menú, las
 * preguntas, el alta— la gobierna la base en `at_sms_recibir` (migración
 * 0145). Esta ruta hace solo las dos cosas que SQL no puede hacer:
 *
 *   1. Comprobar que quien llama es de verdad el celular y no cualquiera.
 *   2. Crear el usuario en `auth`, porque el hash de la clave lo gobierna
 *      GoTrue y no nosotros.
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

  const supabase = clienteDeServicio();

  const { data, error } = await supabase.rpc("at_sms_recibir", {
    p_telefono: telefono,
    p_texto: texto,
  });

  if (error) {
    console.error("[sms-entrante] at_sms_recibir falló", error.message);
    return fallo("No se pudo atender el mensaje.", 502);
  }

  const paso = (data ?? {}) as {
    crear?: boolean;
    alta_id?: string;
    rol?: string;
  };

  if (!paso.crear || !paso.alta_id) {
    // Conversación en curso: la base ya encoló la pregunta siguiente.
    return ok({ atendido: true, creado: false });
  }

  // ── Confirmó: toca crear la cuenta ──────────────────────────────────────
  // El teléfono es la identidad (no hay correo: quien llega por aquí puede no
  // tener uno). La clave es aleatoria y nadie la ve: a esta cuenta se entra
  // por código de un solo uso, no escribiéndola.
  const { data: creado, error: errorAlta } = await supabase.auth.admin.createUser({
    phone: telefono.replace(/[^0-9+]/g, ""),
    phone_confirm: true, // el SMS llegó DESDE ese número: el número está probado
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { alta: "sms", rol_pedido: paso.rol ?? "comprador" },
  });

  if (errorAlta || !creado?.user) {
    console.error("[sms-entrante] no se pudo crear el usuario", errorAlta?.message);
    // La conversación se queda en 'listo': cuando se arregle lo de abajo, el
    // siguiente SI la remata sin volver a preguntarle nada a la persona.
    return fallo("No se pudo crear la cuenta.", 502);
  }

  const { error: errorRemate } = await supabase.rpc("at_sms_confirmar_alta", {
    p_alta_id: paso.alta_id,
    p_user_id: creado.user.id,
  });

  if (errorRemate) {
    console.error("[sms-entrante] at_sms_confirmar_alta falló", errorRemate.message);
    return fallo("La cuenta quedó a medias.", 502);
  }

  return ok({ atendido: true, creado: true, rol: paso.rol ?? null });
}

/**
 * El gateway comprueba la URL antes de guardarla. Un GET que responde 200 le
 * basta, y no dice nada de lo que hay detrás.
 */
export async function GET() {
  return ok({ servicio: "sms-entrante" });
}
