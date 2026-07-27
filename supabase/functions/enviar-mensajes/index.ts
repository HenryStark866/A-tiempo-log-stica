// A TIEMPO LOGÍSTICA — despacha el buzón de mensajes (códigos de entrega).
//
// Lee at_message_outbox y manda por SMS y WhatsApp. Va aparte de la base a
// propósito: si el proveedor se cae o se demora, el CEDI sigue despachando y
// el mensaje se reintenta después. Nunca al revés.
//
// DESPLIEGUE (requiere una cuenta de Twilio; sin las credenciales la función
// no envía nada y lo dice en el log, no falla a medias):
//
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
//   supabase secrets set TWILIO_AUTH_TOKEN=xxxx
//   supabase secrets set TWILIO_SMS_FROM=+57300xxxxxxx
//   supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
//   supabase functions deploy enviar-mensajes
//
// Y para que corra sola cada minuto, un cron en la base:
//   select cron.schedule('enviar-mensajes', '* * * * *', $$
//     select net.http_post(
//       url := '<url-del-proyecto>/functions/v1/enviar-mensajes',
//       headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
//     ) $$);
//
// WhatsApp por Twilio exige una plantilla aprobada por Meta para escribir
// primero a alguien. Mientras no esté aprobada, ese canal va a fallar y el SMS
// va a pasar: por eso se encolan los dos y basta con que uno llegue.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const SMS_FROM = Deno.env.get("TWILIO_SMS_FROM");
const WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");

const MAX_INTENTOS = 3;
const LOTE = 50;

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

Deno.serve(async () => {
  if (!SID || !TOKEN) {
    console.warn("Sin credenciales de Twilio: no se envía nada.");
    return Response.json({ enviados: 0, motivo: "sin credenciales" }, { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

  for (const m of pendientes ?? []) {
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

    try {
      const sid = await enviarTwilio(to, m.body, m.channel);
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

  return Response.json({ enviados: ok, fallidos, revisados: pendientes?.length ?? 0 });
});
