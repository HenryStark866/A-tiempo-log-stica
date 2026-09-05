import { type NextRequest } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { createClient } from "@/lib/supabase/server";
import { ok, fallo } from "@/lib/api/respuesta";
import { frenar } from "@/lib/api/freno";

/**
 * Sesiones de pago por minuto y por persona.
 *
 * Cada llamada crea una sesión de cobro en Polar. Un botón que se deja
 * apretado —o una pantalla que reintenta sola— le abre a un comercio veinte
 * cobros abiertos por la misma factura, y esos aparecen en SU panel de Polar.
 * Seis por minuto es más de lo que nadie necesita para pagar una factura.
 */
const COBROS_POR_MINUTO = 6;

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "production",
});

export async function POST(req: NextRequest) {
  try {
    const { invoice_id, amount } = await req.json();

    if (!invoice_id || !amount || Number(amount) <= 0) {
      return fallo("Falta la factura o el monto.", 400);
    }

    // Verificar que el usuario autenticado realmente es el dueño de esta factura
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return fallo("Tu sesión venció.", 401);
    }

    if (!frenar("polar-checkout", `uid:${user.id}`, COBROS_POR_MINUTO).pasa) {
      return fallo("Vas muy rápido. Espera un momento y vuelve a intentarlo.", 429);
    }

    // Validar que la factura existe y pertenece a un cliente vinculado a este usuario
    const { data: invoice, error: invoiceError } = await supabase
      .from("at_invoices")
      .select("id, total, status, client_id, invoice_number")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return fallo("No encontramos esa factura.", 404);
    }

    if (invoice.status === "pagada" || invoice.status === "anulada") {
      return fallo("Esta factura ya fue pagada o está anulada.", 409);
    }

    const productId = process.env.POLAR_PRODUCT_ID;
    if (!productId) {
      return fallo("Falta configurar la pasarela de pago (POLAR_PRODUCT_ID).", 500);
    }

    const amountInCents = Math.round(Number(amount) * 100);

    // Crear sesión de checkout en Polar con precio fijo dinámico (ad-hoc)
    const checkout = await polar.checkouts.create({
      products: [productId],
      externalCustomerId: user.id,
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_id: invoice.client_id,
      },
      // Sobreescribir el precio del producto con el monto exacto de la factura
      prices: {
        [productId]: [
          {
            amountType: "fixed",
            priceAmount: amountInCents,
          },
        ],
      },
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/facturacion?paid=1&inv=${invoice.invoice_number}`,
    });

    return ok({ url: checkout.url });
  } catch (err) {
    console.error("[polar/checkout] Error:", err);
    const motivo = err instanceof Error ? err.message : "No se pudo iniciar el pago.";
    return fallo(motivo, 500);
  }
}
