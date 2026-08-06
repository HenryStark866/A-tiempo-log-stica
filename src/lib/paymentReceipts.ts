import { createClient } from "@/lib/supabase/client";

const BUCKET = "at-payment-receipts";

/**
 * Sube el comprobante de un pago y reporta el pago en una sola operación.
 *
 * La carpeta es el id de quien reporta, y no es cosmético: tanto la política
 * de storage como at_report_invoice_payment exigen que el primer tramo de la
 * ruta sea su auth.uid(). Sin eso alguien podría adjuntar como suyo el
 * comprobante de otro.
 *
 * No se guarda URL firmada: un comprobante de pago es un documento sensible y
 * una URL de larga duración en la base es una fuga esperando a pasar. Se firma
 * al momento de mirarlo.
 */
export async function reportarPago(opciones: {
  usuarioId: string;
  invoiceId: string;
  monto: number;
  referencia?: string | null;
  metodo?: string | null;
  comprobante?: File | null;
}): Promise<void> {
  const supabase = createClient();
  let path: string | null = null;

  if (opciones.comprobante) {
    const ext = opciones.comprobante.name.split(".").pop()?.toLowerCase() || "jpg";
    path = `${opciones.usuarioId}/${opciones.invoiceId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, opciones.comprobante, { cacheControl: "3600", upsert: false });
    if (error) throw error;
  }

  const { error } = await supabase.rpc("at_report_invoice_payment", {
    p_invoice_id: opciones.invoiceId,
    p_amount: opciones.monto,
    p_reference: opciones.referencia || null,
    p_receipt_path: path,
    p_method: opciones.metodo || null,
  });
  if (error) throw error;
}

export async function urlComprobante(filePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 5);
  return error || !data ? null : data.signedUrl;
}
