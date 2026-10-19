// A TIEMPO LOGÍSTICA — despacha el buzón de mensajes (códigos de entrega).
//
// Lee at_message_outbox y manda por SMS y WhatsApp. Va aparte de la base a
// propósito: si el proveedor se cae o se demora, el CEDI sigue despachando y
// el mensaje se reintenta después. Nunca al revés.
//
// DESPLIEGUE. Basta con UNO de los caminos de salida. En orden de preferencia:
//
//   · WhatsApp Cloud API de Meta (recomendado: oficial, sin servidor propio):
//       supabase secrets set WHATSAPP_TOKEN=EAAG...            (token permanente)
//       supabase secrets set WHATSAPP_PHONE_ID=1234567890
//     y una plantilla `codigo_entrega` aprobada (categoría UTILITY, 2 huecos:
//     pedido y código). Paso a paso en docs/whatsapp-cloud-api.md.
//   · Twilio (para SMS, y como respaldo del canal WhatsApp):
//       supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx
//       supabase secrets set TWILIO_AUTH_TOKEN=xxxx
//       supabase secrets set TWILIO_SMS_FROM=+57300xxxxxxx
//   · El puente propio OpenWA (si algún día se monta un servidor para él):
//       supabase secrets set OPENWA_API_URL=https://…
//       supabase secrets set OPENWA_API_KEY=…
//       supabase secrets set OPENWA_SESSION_NAME=walle
//
// No hace falta configurar ningún secreto más: la función comprueba la
// cabecera `x-at-cron` contra el vault de la propia base. Con `verify_jwt`, la
// llave anónima —que viaja en el navegador de cualquiera— bastaría para
// invocarla y forzar el vaciado en bucle, así que esa puerta es lo único que
// la protege (ver migraciones 0102 y 0103).
//
// Meta no deja escribir texto libre a alguien que no ha escrito primero: por
// eso el canal `whatsapp` sale por PLANTILLA (Cloud API) y el SMS por texto
// (Twilio). Se encola una fila de cada canal por código y basta con que una
// llegue. Los parámetros de la plantilla vienen de at_message_outbox.template_params
// (migración 0113), no del texto de `body`.

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

/**
 * WhatsApp Cloud API de Meta — la vía oficial y la preferida para el canal
 * `whatsapp`. Es una llamada HTTPS a graph.facebook.com: sin servidor
 * intermedio, sin riesgo de que bloqueen el número. Ver docs/whatsapp-cloud-api.md.
 *
 * La versión del Graph API va en variable para poder subirla sin redesplegar
 * el día que Meta jubile la actual.
 */
const WA_CLOUD_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WA_CLOUD_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const WA_CLOUD_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") || "codigo_entrega";
const WA_CLOUD_LANG = Deno.env.get("WHATSAPP_LANG") || "es";
const WA_CLOUD_VERSION = Deno.env.get("WHATSAPP_API_VERSION") || "v22.0";
const hayCloud = !!(WA_CLOUD_TOKEN && WA_CLOUD_PHONE_ID);

/**
 * SMS por un celular Android propio, con la app de código abierto «SMS Gateway
 * for Android» (sms-gate.app). El teléfono manda los SMS con su propia SIM: no
 * hay cobro por mensaje, solo el plan del celular. Es la vía preferida para el
 * canal `sms`; Twilio queda de respaldo si algún día se configura.
 *
 * Por omisión se habla con el servidor en la nube de la app (gratuito: el
 * teléfono se conecta a él y recoge los envíos). Si se monta un servidor
 * privado, basta con cambiar SMSGATE_URL. Usuario y clave salen de la sección
 * «Cloud server» de la app.
 */
const SMSGATE_URL = (Deno.env.get("SMSGATE_URL") || "https://api.sms-gate.app/3rdparty/v1")
  .replace(/\/+$/, "");
const SMSGATE_USER = Deno.env.get("SMSGATE_USER");
const SMSGATE_PASS = Deno.env.get("SMSGATE_PASS");
const hayCelular = !!(SMSGATE_USER && SMSGATE_PASS);

async function enviarPorCelular(to: string, body: string): Promise<string> {
  const res = await fetch(`${SMSGATE_URL}/message`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${SMSGATE_USER}:${SMSGATE_PASS}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [to] }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Celular SMS: ${json?.message ?? json?.error ?? `HTTP ${res.status}`}`);
  }
  // La app acepta el envío y lo pone en cola en el teléfono; el id sirve para
  // rastrearlo en la propia app si un comprador dice que no le llegó.
  return String(json?.id ?? "celular");
}

/**
 * Correo por Amazon SES, con las MISMAS credenciales SMTP que usa GoTrue para
 * confirmar cuentas (migración 0126). Es el canal que sale solo y casi gratis:
 * US$0,10 por cada mil, pagados con los créditos de AWS.
 */
const SMTP_HOST = Deno.env.get("SMTP_HOST");
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "587");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SMTP_FROM = Deno.env.get("SMTP_ADMIN_EMAIL") || "noreply@atiempologistica.com";
const hayCorreo = !!(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_HOST !== "localhost");

let transporte: { sendMail: (m: Record<string, unknown>) => Promise<{ messageId?: string }> } | null = null;

async function enviarPorCorreo(
  to: string,
  body: string,
  plantilla: { pedido?: string; codigo?: string } | null | undefined,
): Promise<string> {
  if (!transporte) {
    const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
    transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  const pedido = plantilla?.pedido ?? "";
  const codigo = plantilla?.codigo ?? "";
  const info = await transporte!.sendMail({
    from: `A Tiempo Logística <${SMTP_FROM}>`,
    to,
    subject: pedido ? `Tu código de entrega · Pedido ${pedido}` : "Tu código de entrega",
    text: body,
    html: codigo
      ? `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1c1c1e">
           <p style="margin:0 0 8px">Este es el código de tu paquete${pedido ? ` (pedido <b>${pedido}</b>)` : ""}:</p>
           <p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:16px 0">${codigo}</p>
           <p style="margin:0 0 8px">Dáselo al mensajero <b>solo cuando tengas tu pedido en las manos</b>.</p>
           <p style="color:#8e8e93;font-size:13px;margin-top:24px">A Tiempo Logística</p>
         </div>`
      : undefined,
  });
  return String(info?.messageId ?? "correo");
}

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

/**
 * WhatsApp por la Cloud API de Meta.
 *
 * Meta no permite texto libre a quien no ha escrito primero: se manda una
 * PLANTILLA aprobada y se rellenan sus huecos. `codigo_entrega` tiene dos:
 * {{1}} el número de pedido, {{2}} el código de seis dígitos. Vienen en
 * `template_params`, que llena at_issue_delivery_code (migración 0113).
 *
 * Devuelve el id del mensaje (wamid…) o lanza con el motivo de Meta, que la
 * bandeja de fallidos enseña tal cual al operario.
 */
async function enviarPorCloudApi(
  to: string,
  plantilla: { pedido: string; codigo: string },
): Promise<string> {
  const res = await fetch(
    `https://graph.facebook.com/${WA_CLOUD_VERSION}/${WA_CLOUD_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WA_CLOUD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        // Meta quiere solo dígitos con indicativo: +57 300… → 57300…
        to: to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: WA_CLOUD_TEMPLATE,
          language: { code: WA_CLOUD_LANG },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: plantilla.pedido },
                { type: "text", text: plantilla.codigo },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Cloud API: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return String(json?.messages?.[0]?.id ?? "cloud");
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

  // La cola se lee SIEMPRE, haya o no con qué enviar. Sin credenciales todavía
  // hay trabajo —archivar lo caducado— y saltárselo fue lo que tumbó la base el
  // 2026-09-08: un código que nadie recogió en 12 h no es que sobre, es que
  // mantiene vivo el reloj `at-enviar-mensajes`, que llama aquí cada dos
  // minutos mientras algo siga «pendiente». En un `t4g.nano` ese goteo
  // constante agota los workers. Ver la migración 0112.
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

  const ahora = Date.now();
  const esCaducado = (m: { created_at: string }) =>
    (ahora - new Date(m.created_at).getTime()) / 3_600_000 > CADUCA_TRAS_HORAS;

  // Paso 1 — no depende de credenciales: lo viejo se archiva, no se manda.
  for (const m of (pendientes ?? []).filter(esCaducado)) {
    const horas = Math.round((ahora - new Date(m.created_at).getTime()) / 3_600_000);
    await supabase
      .from("at_message_outbox")
      .update({
        status: "fallido",
        error: `Caducado: se encoló hace ${horas} h y ya no sirve`,
      })
      .eq("id", m.id);
    caducados++;
  }

  const frescos = (pendientes ?? []).filter((m) => !esCaducado(m));

  // Paso 2 — enviar. Si no hay canal, se termina aquí: la cola ya quedó sin
  // caducados, así que el reloj no vuelve a llamar en balde por lo de siempre.
  if (!hayCloud && !hayPuente && !hayCelular && !hayCorreo && !(SID && TOKEN)) {
    if (frescos.length > 0) {
      console.warn(
        `Sin canal configurado (ni Cloud API, ni puente, ni celular, ni correo, ni Twilio): ${frescos.length} mensaje(s) fresco(s) esperando.`,
      );
    }
    return Response.json(
      { enviados: 0, caducados, revisados: pendientes?.length ?? 0, motivo: "sin credenciales" },
      { status: 200 },
    );
  }

  for (const m of frescos) {
    // El correo va por su lado: no tiene teléfono que normalizar.
    if (m.channel === "email") {
      if (!hayCorreo) continue; // falta configuración: no se gasta intento
      try {
        const id = await enviarPorCorreo(m.to_email, m.body, m.template_params);
        await supabase
          .from("at_message_outbox")
          .update({
            status: "enviado",
            provider_id: id,
            sent_at: new Date().toISOString(),
            attempts: m.attempts + 1,
            error: null,
          })
          .eq("id", m.id);
        ok++;
      } catch (e) {
        const intentos = m.attempts + 1;
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

    // El canal `whatsapp` sale por la Cloud API si está configurada; si no,
    // por el puente propio. Todo lo demás —y el respaldo— por Twilio. Si un
    // canal no tiene por dónde salir se salta SIN gastar intento: no es un
    // fallo del mensaje, es que falta configuración, y gastarle intentos lo
    // mataría a los tres minutos sin que nadie hubiera intentado nada.
    //
    // La Cloud API necesita los parámetros de la plantilla. Si la fila es
    // vieja y no los trae (se encoló antes de la migración 0113), cae al
    // puente o a Twilio, que mandan el texto de `body`.
    const esWhatsApp = m.channel === "whatsapp";
    const plantilla = m.template_params as
      | { pedido?: string; codigo?: string }
      | null
      | undefined;
    const porCloud = esWhatsApp && hayCloud && !!plantilla?.codigo;
    const porPuente = esWhatsApp && !porCloud && hayPuente;
    // El SMS sale por el celular propio si está; si no, por Twilio.
    const porCelular = !esWhatsApp && hayCelular;
    if (!porCloud && !porPuente && !porCelular && !(SID && TOKEN)) continue;

    try {
      const sid = porCloud
        ? await enviarPorCloudApi(to, {
            pedido: String(plantilla?.pedido ?? ""),
            codigo: String(plantilla?.codigo),
          })
        : porPuente
        ? await enviarPorPuente(to, m.body)
        : porCelular
        ? await enviarPorCelular(to, m.body)
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
