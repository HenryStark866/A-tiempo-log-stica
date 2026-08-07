import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[polar/webhook] POLAR_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(body, headers, webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn("[polar/webhook] Firma inválida:", err.message);
      return NextResponse.json({ error: "Firma inválida" }, { status: 403 });
    }
    throw err;
  }

  // Solo procesamos pagos confirmados
  if (event.type !== "order.created") {
    return NextResponse.json({ received: true });
  }

  const metadata = (event.data as { metadata?: Record<string, string> }).metadata ?? {};
  const invoiceId = metadata["invoice_id"];

  if (!invoiceId) {
    console.warn("[polar/webhook] order.created sin invoice_id en metadata");
    return NextResponse.json({ received: true });
  }

  try {
    const supabase = await createClient();

    // Marcar la factura directamente como pagada (pago automático verificado por Polar)
    const { error } = await supabase
      .from("at_invoices")
      .update({
        status: "pagada",
        paid_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .neq("status", "pagada"); // Idempotente: no doble-procesar

    if (error) {
      console.error("[polar/webhook] Error actualizando factura:", error);
      return NextResponse.json({ error: "Error al actualizar factura" }, { status: 500 });
    }

    // También registrar el pago en at_invoice_payments para tener historial
    const orderId = (event.data as { id?: string }).id ?? "";
    const amount = (event.data as { amount?: number }).amount ?? 0;

    await supabase.from("at_invoice_payments").insert({
      invoice_id: invoiceId,
      amount: amount / 100, // Polar usa centavos
      method: "Polar",
      reference: orderId,
      status: "verificado",
      receipt_path: null,
      reported_by: null, // Pago automático, sin usuario que lo reporte
    });

    console.log(`[polar/webhook] Factura ${invoiceId} marcada como pagada (orden ${orderId})`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[polar/webhook] Error inesperado:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
