// A TIEMPO LOGÍSTICA — despacha el buzón de mensajes (códigos de entrega).
//
// Lee at_message_outbox y manda por SMS y WhatsApp. Va aparte de la base a
// propósito: si el proveedor se cae o se demora, el CEDI sigue despachando y
// el mensaje se reintenta después. Nunca al revés.
//
// DESPLIEGUE. Basta con UNO de los dos caminos de salida:
//
//   · El puente propio (recomendado, sin coste por mensaje):
//       supabase secrets set OPENWA_API_URL=https://…
//       supabase secrets set OPENWA_API_KEY=…
//       supabase secrets set OPENWA_SESSION_NAME=walle
//   · Twilio (respaldo, y el único para SMS):
//       supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
//       supabase secrets set TWILIO_AUTH_TOKEN=xxxx
//       supabase secrets set TWILIO_SMS_FROM=+57300xxxxxxx
//
// No hace falta configurar ningún secreto más: la función comprueba la
// cabecera `x-at-cron` contra el vault de la propia base. Con `verify_jwt`, la
// llave anónima —que viaja en el navegador de cualquiera— bastaría para
// invocarla y forzar el vaciado en bucle, así que esa puerta es lo único que
// la protege (ver migraciones 0102 y 0103).
//
// WhatsApp por Twilio exige una plantilla aprobada por Meta para escribir
// primero a alguien. Mientras no esté aprobada, ese canal va a fallar y el SMS
// va a pasar: por eso se encolan los dos y basta con que uno llegue. El puente
// propio no tiene esa limitación — usa una sesión de WhatsApp de verdad.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const SMS_FROM = Deno.env.get("TWILIO_SMS_FROM");
const WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

/**
 * El puente de WhatsApp propio (OpenWA), que es por donde salen los códigos.
 *
 * Convive con Twilio a propósito y no lo reemplaza: WhatsApp por Twilio exige
 * una plantilla aprobada por Meta para escribir primero a alguien, y mientras
 * eso no exista ese canal falla siempre. El puente propio usa una sesión de
 * WhatsApp de verdad, así que puede escribir sin plantilla — pero depende de
 * un servidor nuestro que puede estar caído. Teniendo los dos, cada canal cae
 * en quien mejor lo sirve: WhatsApp por el puente, SMS por Twilio.
 */
const WA_URL = Deno.env.get("OPENWA_API_URL")?.replace(/\/+$/, "");
const WA_LLAVE = Deno.env.get("OPENWA_API_KEY");
const WA_SESION = Deno.env.get("OPENWA_SESSION_NAME") || "walle";
const hayPuente = !!(WA_URL && WA_LLAVE);

const MAX_INTENTOS = 3;
const LOTE = 50;

/**
 * Cuánto vive un mensaje antes de darse por caducado.
 *
 * Un código de entrega sirve hasta que el mensajero toca la puerta; después no
 * es que sobre, es que confunde. Sin este límite, la cola es una bomba de
 * relojería: el día que se configure un canal, TODO lo acumulado sale de
 * golpe. Y lo acumulado eran códigos de paquetes ya entregados —uno de hace
 * siete días—, o sea gente recibiendo «este es el código de tu paquete» por
 * algo que ya tiene en casa.
 *
 * Doce horas es generoso para una operación que recoge y entrega el mismo día.
 */
const CADUCA_TRAS_HORAS = 12;

/**
 * Normaliza a E.164 colombiano. Los números llegan como los escribió el
 * comercio ("313 546 7802", "3135467802"), y el proveedor los rechaza si no
 * van con indicativo.
 */
function aE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("3")) return `+57${d}`;
  if (d.length === 12 && d.startsWith("57")) return `+${d}`;
  if (raw.trim().startsWith("+")) return `+${d}`;
  return null;
}

/**
 * WhatsApp identifica a cada quien por un «chat id», no por un teléfono:
 * `573196070176@c.us`. Un número colombiano de diez dígitos viene sin
 * indicativo y hay que ponérselo, o el mensaje se va a un número que no existe.
 */
function aChatId(e164: string): string {
  const digitos = e164.replace(/\D/g, "");
  return `${digitos}@c.us`;
}

async function enviarPorPuente(to: string, body: string): Promise<string> {
  const res = await fetch(
    `${WA_URL}/api/sessions/${WA_SESION}/messages/send-text`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": WA_LLAVE! },
      body: JSON.stringify({ chatId: aChatId(to), text: body }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) {
    const detalle = (await res.text()).slice(0, 200);
    throw new Error(`El puente respondió ${res.status}: ${detalle}`);
  }
  const json = await res.json().catch(() => ({}));
  return String(json?.id ?? json?.messageId ?? "puente");
}

async function enviarTwilio(to: string, body: string, canal: "sms" | "whatsapp") {
  const from = canal === "whatsapp" ? WA_FROM : SMS_FROM;
  if (!from) throw new Error(`Falta configurar el remitente de ${canal}`);

  const destino = canal === "whatsapp" ? `whatsapp:${to}` : to;
  const params = new URLSearchParams({ To: destino, From: from, Body: body });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${SID}:${TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `Error ${res.status} del proveedor`);
  return json.sid as string;
}

Deno.serve(async (req) => {
  /**
   * Quién puede pedir que se vacíe la cola.
   *
   * Solo el reloj, y se comprueba con un secreto compartido — el mismo patrón
   * que ya usa `shopify-sync`. Antes esta función no validaba NADA: con
   * `verify_jwt`, la llave anónima basta para invocarla, y esa llave viaja en
   * el navegador de cualquiera que abra la app. Cualquiera podía forzar el
   * vaciado en bucle y quemar la sesión de WhatsApp a base de peticiones.
   *
   * Se comprueba contra el VAULT, no contra un secreto de Edge Functions. Esa
   * segunda copia había que mantenerla igual a mano y nunca se puso: el cron
   * de Shopify llevaba meses respondiendo 401 por eso, sin que nadie lo viera.
   * Con una sola copia no hay nada que desincronizar.
   *
   * El secreto no sale de la base: se manda el candidato y vuelve un sí o un
   * no (`at_cron_secreto_valido`, migración 0103).
   */
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: autorizado } = await supabase.rpc("at_cron_secreto_valido", {
    p_secreto: req.headers.get("x-at-cron") ?? "",
  });
  if (autorizado !== true) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  // Basta con que UNO de los dos esté configurado. Antes exigía Twilio y se
  // rendía: con el puente propio funcionando, eso dejaba la cola sin vaciar.
  if (!hayPuente && !(SID && TOKEN)) {
    console.warn("Ni puente de WhatsApp ni Twilio configurados: no se envía nada.");
    return Response.json({ enviados: 0, motivo: "sin credenciales" }, { status: 200 });
  }

  const { data: pendientes, error } = await supabase
    .from("at_message_outbox")
    .select("*")
    .eq("status", "pendiente")
    .lt("attempts", MAX_INTENTOS)
    .order("created_at")
    .limit(LOTE);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let ok = 0;
  let fallidos = 0;

  let caducados = 0;

  for (const m of pendientes ?? []) {
    // Lo viejo no se manda: se archiva. Antes que el teléfono, porque un
    // mensaje caducado no merece ni que se le mire el número.
    const horas = (Date.now() - new Date(m.created_at).getTime()) / 3_600_000;
    if (horas > CADUCA_TRAS_HORAS) {
      await supabase
        .from("at_message_outbox")
        .update({
          status: "fallido",
          error: `Caducado: se encoló hace ${Math.round(horas)} h y ya no sirve`,
        })
        .eq("id", m.id);
      caducados++;
      continue;
    }

    const to = m.to_phone ? aE164(m.to_phone) : null;

    if (!to) {
      await supabase
        .from("at_message_outbox")
        .update({
          status: "fallido",
          error: `Teléfono inválido: "${m.to_phone ?? ""}"`,
          attempts: m.attempts + 1,
        })
        .eq("id", m.id);
      fallidos++;
      continue;
    }

    // WhatsApp por el puente propio si lo hay; lo demás, y el respaldo, por
    // Twilio. Si un canal no tiene por dónde salir se salta sin gastar
    // intento: no es un fallo del mensaje, es que falta configuración.
    const porPuente = m.channel === "whatsapp" && hayPuente;
    if (!porPuente && !(SID && TOKEN)) continue;

    try {
      const sid = porPuente
        ? await enviarPorPuente(to, m.body)
        : await enviarTwilio(to, m.body, m.channel);
      await supabase
        .from("at_message_outbox")
        .update({
          status: "enviado",
          provider_id: sid,
          sent_at: new Date().toISOString(),
          attempts: m.attempts + 1,
          error: null,
        })
        .eq("id", m.id);
      ok++;
    } catch (e) {
      const intentos = m.attempts + 1;
      // Solo se da por perdido al agotar los reintentos: una caída pasajera
      // del proveedor no debe quemar el mensaje.
      await supabase
        .from("at_message_outbox")
        .update({
          status: intentos >= MAX_INTENTOS ? "fallido" : "pendiente",
          error: e instanceof Error ? e.message : String(e),
          attempts: intentos,
        })
        .eq("id", m.id);
      fallidos++;
    }
  }

  return Response.json({
    enviados: ok,
    fallidos,
    caducados,
    revisados: pendientes?.length ?? 0,
  });
});
