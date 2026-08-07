import { NextRequest, NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { createClient } from "@/lib/supabase/server";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "production",
});

export async function POST(req: NextRequest) {
  try {
    const { invoice_id, amount } = await req.json();

    if (!invoice_id || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "invoice_id y amount son requeridos" }, { status: 400 });
    }

    // Verificar que el usuario autenticado realmente es el dueño de esta factura
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Validar que la factura existe y pertenece a un cliente vinculado a este usuario
    const { data: invoice, error: invoiceError } = await supabase
      .from("at_invoices")
      .select("id, total, status, client_id, invoice_number")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }

    if (invoice.status === "pagada" || invoice.status === "anulada") {
      return NextResponse.json(
        { error: "Esta factura ya fue pagada o está anulada" },
        { status: 409 }
      );
    }

    const productId = process.env.POLAR_PRODUCT_ID;
    if (!productId) {
      return NextResponse.json(
        { error: "POLAR_PRODUCT_ID no configurado en el servidor" },
        { status: 500 }
      );
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

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[polar/checkout] Error:", err);
    const message = err instanceof Error ? err.message : "Error al crear sesión de pago";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
