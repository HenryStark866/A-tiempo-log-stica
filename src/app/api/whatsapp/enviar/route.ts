import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarPorWhatsApp } from "@/lib/whatsapp";

/**
 * POST /api/whatsapp/enviar   { guideId }
 *
 * Manda el código de entrega de un pedido por el WhatsApp de la operación, sin
 * que nadie tenga que abrir la aplicación y pegar el texto.
 *
 * ── Por qué pasa por aquí y no por el navegador ────────────────────────────
 * La llave del gateway no puede salir al cliente, y el texto del código tampoco
 * debería: quien lo tenga puede firmar una entrega. Aquí el navegador solo dice
 * QUÉ pedido, y el servidor se encarga del resto.
 *
 * ── El orden importa ───────────────────────────────────────────────────────
 * Primero se manda y solo después se marca como enviado. Al revés —marcar y
 * luego mandar— dejaría códigos que la base cree entregados y que nadie
 * recibió: y en cuanto un código figura como enviado, el mensajero empieza a
 * exigírselo al comprador. La salvaguarda de la migración 0022 se apoya justo
 * en eso.
 *
 * Si el puente no responde, esto NO es un error de la app: se devuelve el
 * motivo y la pantalla ofrece el envío manual de siempre, que sigue intacto.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, motivo: "Tu sesión venció." }, { status: 401 });
  }

  let guideId: string | undefined;
  try {
    ({ guideId } = await request.json());
  } catch {
    /* cuerpo ilegible: se trata igual que si faltara el dato */
  }
  if (!guideId) {
    return NextResponse.json({ ok: false, motivo: "Falta el pedido." }, { status: 400 });
  }

  // Esta función ya valida que quien llama sea del CEDI y devuelve el mensaje
  // que estaba en cola. Si el rol no da, revienta aquí y no llegamos a enviar.
  const { data, error } = await supabase.rpc("at_delivery_code_whatsapp", {
    p_guide_id: guideId,
  });

  if (error) {
    return NextResponse.json({ ok: false, motivo: error.message }, { status: 400 });
  }

  // Los nombres son los que devuelve at_delivery_code_whatsapp: message_id y
  // phone, no id y to_phone (que son los de la tabla at_message_outbox).
  const mensaje = data as { message_id: string; phone: string | null; body: string } | null;
  if (!mensaje?.phone || !mensaje.body) {
    return NextResponse.json(
      { ok: false, motivo: "Ese pedido no tiene teléfono o no hay código en cola." },
      { status: 400 }
    );
  }

  const envio = await enviarPorWhatsApp(mensaje.phone, mensaje.body);
  if (!envio.ok) {
    // 200 a propósito: no es un fallo de la aplicación, es que el puente no
    // está disponible. La pantalla lo distingue por `ok` y ofrece el manual.
    return NextResponse.json({ ok: false, motivo: envio.motivo, puedeManual: true });
  }

  const { error: errorMarca } = await supabase.rpc("at_delivery_code_marcar_enviado", {
    p_message_id: mensaje.message_id,
    p_provider: "whatsapp-openwa",
  });

  if (errorMarca) {
    // El mensaje SÍ salió. Que no se haya podido anotar es un problema menor,
    // pero hay que decirlo: si no, alguien lo manda otra vez.
    return NextResponse.json({
      ok: true,
      aviso:
        "El mensaje salió, pero no se pudo anotar como enviado. Revisa la lista antes de volver a mandarlo.",
    });
  }

  return NextResponse.json({ ok: true });
}
