// A TIEMPO LOGÍSTICA — trae los pedidos de Shopify y los vuelve guías.
//
// Vive aquí y no en la app porque el Admin API token de Shopify lee pedidos y
// datos personales de toda la tienda. Si la llamada saliera del navegador, el
// token viajaría hasta allá. Aquí corre en el servidor de Supabase, que le
// inyecta SUPABASE_SERVICE_ROLE_KEY sin que nadie tenga que configurarla.
//
// QUIÉN PUEDE LLAMARLA: se identifica al usuario con SU propio JWT y se
// resuelve su client_id con SU sesión, no con la clave de servicio. Así un
// comercio no puede pedir la sincronización de otro cambiando un parámetro:
// simplemente no existe tal parámetro, el client_id sale de quién es.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SHOPIFY_API = "2024-10";
const MAX_PEDIDOS = 250;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShopifyAddress {
  name?: string;
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  phone?: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  phone?: string | null;
  note?: string | null;
  financial_status?: string | null;
  total_outstanding?: string | null;
  current_total_price?: string | null;
  total_price?: string | null;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  customer?: { phone?: string | null } | null;
}

function nombreDe(a: ShopifyAddress | null | undefined): string {
  if (!a) return "";
  return (a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ")).trim();
}

/** Shopify separa la dirección en dos líneas; la guía la lleva en una sola. */
function direccionDe(a: ShopifyAddress | null | undefined): string {
  if (!a) return "";
  return [a.address1, a.address2].filter((x) => x && x.trim()).join(" ").trim();
}

/**
 * ¿El pedido se cobra al entregar?
 *
 * En Shopify, un pedido contraentrega queda con financial_status 'pending' y
 * un saldo en total_outstanding. Los que ya se pagaron en línea llegan como
 * 'paid' o 'partially_refunded' y no se le cobran al comprador otra vez: eso
 * sería cobrar dos veces, que es el error caro de esta integración.
 */
function recaudoDe(o: ShopifyOrder): { cod: boolean; monto: number } {
  const pagado = ["paid", "refunded", "partially_refunded"].includes(
    (o.financial_status ?? "").toLowerCase()
  );
  if (pagado) return { cod: false, monto: 0 };

  const saldo = Number(o.total_outstanding ?? "0");
  const total = Number(o.current_total_price ?? o.total_price ?? "0");
  const monto = saldo > 0 ? saldo : total;
  return { cod: monto > 0, monto };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return Response.json({ error: "Falta la sesión" }, { status: 401, headers: cors });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Con la sesión del usuario: quién es y a qué comercio pertenece.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });

  const { data: userData } = await comoUsuario.auth.getUser();
  if (!userData?.user) {
    return Response.json({ error: "Sesión inválida" }, { status: 401, headers: cors });
  }

  const { data: perfil } = await comoUsuario
    .from("at_profiles")
    .select("client_id, role")
    .eq("id", userData.user.id)
    .single();

  if (!perfil?.client_id || perfil.role !== "cliente") {
    return Response.json(
      { error: "Solo un comercio sincroniza su tienda" },
      { status: 403, headers: cors }
    );
  }
  const clientId = perfil.client_id as string;

  // A partir de aquí, con la clave de servicio: es lo único que puede leer
  // la tabla de conexiones.
  const admin = createClient(url, service);

  const { data: conn } = await admin
    .from("at_shopify_connections")
    .select("shop_domain, access_token, active")
    .eq("client_id", clientId)
    .single();

  if (!conn || !conn.active) {
    return Response.json(
      { error: "Este comercio no tiene una tienda conectada" },
      { status: 400, headers: cors }
    );
  }

  try {
    // Solo lo que falta despachar: los ya enviados o cancelados no son guías
    // nuevas. `any` en status incluye los pagados y los pendientes de pago.
    const endpoint =
      `https://${conn.shop_domain}/admin/api/${SHOPIFY_API}/orders.json` +
      `?status=open&fulfillment_status=unshipped&limit=${MAX_PEDIDOS}`;

    const res = await fetch(endpoint, {
      headers: {
        "X-Shopify-Access-Token": conn.access_token,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const detalle =
        res.status === 401 || res.status === 403
          ? "Shopify rechazó el token. Revísalo o genera uno nuevo con permiso de lectura de pedidos."
          : `Shopify respondió ${res.status}`;
      await admin.rpc("at_shopify_mark_sync", { p_client_id: clientId, p_error: detalle });
      return Response.json({ error: detalle }, { status: 502, headers: cors });
    }

    const { orders } = (await res.json()) as { orders: ShopifyOrder[] };

    let creadas = 0;
    let repetidas = 0;
    const incompletos: string[] = [];

    for (const o of orders ?? []) {
      const dir = o.shipping_address ?? o.billing_address ?? null;
      const { cod, monto } = recaudoDe(o);

      const { data: resultado } = await admin.rpc("at_shopify_upsert_order", {
        p_client_id: clientId,
        p_order_id: String(o.id),
        p_name: nombreDe(dir),
        p_phone: dir?.phone ?? o.phone ?? o.customer?.phone ?? null,
        p_address: direccionDe(dir),
        p_city: dir?.city ?? "",
        p_is_cod: cod,
        p_amount: monto,
        p_notes: [o.name, o.note].filter(Boolean).join(" · "),
      });

      if (resultado === "creado") creadas++;
      else if (resultado === "repetido") repetidas++;
      // Un pedido sin dirección de envío no puede ser una guía. Se nombra para
      // que el comercio sepa cuál revisar, en vez de descubrir que "faltan
      // pedidos" sin saber cuáles.
      else incompletos.push(o.name);
    }

    await admin.rpc("at_shopify_mark_sync", {
      p_client_id: clientId,
      p_error: null,
      p_creadas: creadas,
    });

    return Response.json(
      { creadas, repetidas, incompletos, revisados: orders?.length ?? 0 },
      { headers: cors }
    );
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await admin.rpc("at_shopify_mark_sync", { p_client_id: clientId, p_error: detalle });
    return Response.json({ error: detalle }, { status: 500, headers: cors });
  }
});
