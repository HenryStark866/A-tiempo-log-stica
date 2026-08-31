import { type NextRequest } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { ok, fallo } from "@/lib/api/respuesta";

/**
 * POST /api/polar/webhook
 *
 * Lo que Polar nos cuenta cuando alguien paga de verdad. Es la única fuente
 * que puede marcar una factura como pagada sin que nadie apriete nada.
 *
 * ── Quién llama, y por qué eso lo cambia todo ─────────────────────────────
 *
 * Aquí no hay persona: llega una petición desde los servidores de Polar, sin
 * cookie y sin sesión. Esta ruta usaba el cliente de sesión, así que corría
 * como `anon`, y RLS bloqueaba el `update`. Lo caro es CÓMO lo bloqueaba: un
 * update que RLS no deja pasar no da error, deja cero filas. La ruta escribía
 * «factura marcada como pagada» en el log y la factura seguía pendiente.
 * El comercio pagaba; la plataforma no se enteraba; alguien iba a cobrarle
 * otra vez.
 *
 * Por eso va con el cliente de servicio, que se salta RLS — y por eso el
 * `where` lo tiene que poner este archivo con cuidado: el `invoice_id` no
 * sale del cuerpo a secas, sale de los metadatos de un evento cuya FIRMA ya
 * se comprobó arriba. Sin esa firma, cualquiera podría mandarnos un id de
 * factura y darla por pagada.
 *
 * ── Y por eso se comprueba que de verdad cambió algo ──────────────────────
 *
 * `.select()` al final del update no es adorno: es lo que convierte «no pasó
 * nada» en un error visible. Era justo lo que faltaba.
 */
export async function POST(req: NextRequest) {
  const cuerpo = await req.text();
  const cabeceras = Object.fromEntries(req.headers.entries());

  const secreto = process.env.POLAR_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("[yam][polar] POLAR_WEBHOOK_SECRET no configurado");
    return fallo("Configuración incompleta", 500);
  }

  let evento: ReturnType<typeof validateEvent>;
  try {
    evento = validateEvent(cuerpo, cabeceras, secreto);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      // Esto no es ruido: si aparece seguido, o el secreto está desfasado o
      // alguien está probando a marcar facturas como pagadas.
      console.error("[yam][polar] firma inválida:", err.message);
      return fallo("Firma inválida", 403);
    }
    throw err;
  }

  // Solo los pagos confirmados. Del resto de eventos basta con acusar recibo:
  // si respondiéramos error, Polar los reintentaría para siempre.
  if (evento.type !== "order.created") return ok({ atendido: false });

  const metadatos = (evento.data as { metadata?: Record<string, string> }).metadata ?? {};
  const facturaId = metadatos["invoice_id"];

  if (!facturaId) {
    console.error("[yam][polar] order.created sin invoice_id en metadata");
    return ok({ atendido: false });
  }

  const ordenId = (evento.data as { id?: string }).id ?? "";
  // Polar cuenta en centavos. Esta división es la línea que decide cuánto se
  // le abona a un comercio: si se cae, se abona cien veces de menos.
  const monto = ((evento.data as { amount?: number }).amount ?? 0) / 100;

  try {
    const supabase = clienteDeServicio();

    const { data: cambiadas, error } = await supabase
      .from("at_invoices")
      .update({ status: "pagada", paid_at: new Date().toISOString() })
      .eq("id", facturaId)
      // Idempotente: Polar reintenta el mismo evento si no le contestamos a
      // tiempo, y una factura no se paga dos veces.
      .neq("status", "pagada")
      .select("id");

    if (error) {
      console.error("[yam][polar] no se pudo marcar la factura:", error.message);
      // 500 a propósito: que Polar lo reintente. Un pago que no se anota es
      // peor que un reintento de más.
      return fallo("Error al actualizar factura", 500);
    }

    if (!cambiadas?.length) {
      // O ya estaba pagada (reintento, todo bien) o ese id no existe (algo se
      // rompió y hay que mirarlo). Se anota y se acusa recibo: reintentarlo no
      // lo va a arreglar.
      console.warn(
        `[yam][polar] la factura ${facturaId} no cambió: ya estaba pagada o no existe (orden ${ordenId})`
      );
      return ok({ atendido: false, motivo: "sin cambios" });
    }

    // El historial va después del estado, y su fallo no revierte nada: la
    // factura pagada es el dato que gobierna; esta fila es la memoria de
    // cómo se pagó.
    const { error: errorHistorial } = await supabase.from("at_invoice_payments").insert({
      invoice_id: facturaId,
      amount: monto,
      method: "Polar",
      reference: ordenId,
      status: "verificado",
      receipt_path: null,
      // Pago automático: no hay persona que lo reporte.
      reported_by: null,
    });

    if (errorHistorial) {
      console.error(
        `[yam][polar] factura ${facturaId} pagada, pero sin fila en el historial: ${errorHistorial.message}`
      );
    }

    console.log(`[yam][polar] factura ${facturaId} pagada (orden ${ordenId})`);
    return ok({ atendido: true });
  } catch (err) {
    console.error("[yam][polar] error inesperado:", err);
    return fallo("Error interno", 500);
  }
}

// Node y no Edge: el SDK de Polar verifica la firma con `node:crypto`.
export const runtime = "nodejs";
