// A TIEMPO LOGÍSTICA — trae los pedidos de Shopify y los vuelve guías.
//
// Vive aquí y no en la app porque el Admin API token de Shopify lee pedidos y
// datos personales de toda la tienda. Si la llamada saliera del navegador, el
// token viajaría hasta allá. Aquí corre en el servidor de Supabase, que le
// inyecta SUPABASE_SERVICE_ROLE_KEY sin que nadie tenga que configurarla.
//
// ── DOS PUERTAS DE ENTRADA ────────────────────────────────────────────────
//
// 1. EL RELOJ (cron, cada 15 minutos). Recorre TODAS las tiendas conectadas.
//    Es la que hace que los pedidos «lleguen solos», que es lo que la pantalla
//    de Mi comercio lleva prometiendo desde que se escribió: decía «se
//    sincroniza sola» cuando en realidad había que apretar un botón — y el
//    botón vive en una pantalla que el asesor ni siquiera tiene en su menú.
//
//    Se identifica con una cabecera x-at-cron contra el secreto del vault. Si
//    no coincide, esta puerta queda cerrada: vale más que la sincronización
//    automática no arranque a que quede un endpoint abierto que le sincroniza
//    la tienda a cualquiera.
//
// 2. UNA PERSONA. Se identifica con SU propio JWT y su comercio sale de quién
//    es, no de un parámetro: así un comercio no puede pedir la sincronización
//    de otro. Vale para el dueño y para sus asesores; los asesores son quienes
//    gestionan los domicilios del día a día.
//
// Conectar la tienda —o sea, pegar el token— sigue siendo solo del dueño. Eso
// no se toca aquí: es una credencial de su negocio, no una tarea de operación.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SHOPIFY_API = "2024-10";
const MAX_PEDIDOS = 250;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-at-cron",
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

interface Conexion {
  client_id: string;
  shop_domain: string;
  access_token: string;
}

interface Resultado {
  creadas: number;
  repetidas: number;
  incompletos: string[];
  revisados: number;
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

/**
 * Sincroniza UNA tienda. Es el cuerpo que antes estaba suelto en el handler;
 * se sacó aparte para que el reloj pueda recorrer todas las tiendas llamándolo
 * en bucle sin duplicar la lógica —y sin que las dos versiones se separen con
 * el tiempo, que es como se acaba cobrando distinto según quién sincronice—.
 */
async function sincronizarComercio(
  admin: SupabaseClient,
  conn: Conexion
): Promise<Resultado> {
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
    await admin.rpc("at_shopify_mark_sync", { p_client_id: conn.client_id, p_error: detalle });
    throw new Error(detalle);
  }

  const { orders } = (await res.json()) as { orders: ShopifyOrder[] };

  let creadas = 0;
  let repetidas = 0;
  const incompletos: string[] = [];

  for (const o of orders ?? []) {
    const dir = o.shipping_address ?? o.billing_address ?? null;
    const { cod, monto } = recaudoDe(o);

    const { data: resultado } = await admin.rpc("at_shopify_upsert_order", {
      p_client_id: conn.client_id,
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
    p_client_id: conn.client_id,
    p_error: null,
    p_creadas: creadas,
  });

  // Avisar al equipo del comercio. Sin esto los pedidos «llegan solos» pero
  // nadie se entera de que llegaron, que para el caso es no haberlos traído.
  if (creadas > 0) {
    await admin.rpc("at_avisar_pedidos_de_shopify", {
      p_client_id: conn.client_id,
      p_creadas: creadas,
    });
  }

  return { creadas, repetidas, incompletos, revisados: orders?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  // ── Puerta 1: el reloj ──────────────────────────────────────────────────
  //
  // Se comprueba contra el VAULT, no contra un secreto de Edge Functions.
  // Aquí estaba el fallo que dejó esta sincronización muerta durante meses:
  // `AT_CRON_SECRET` nunca se configuró, así que este bloque respondía 401
  // cada quince minutos y los pedidos de Shopify no entraban solos. Nadie lo
  // vio porque el cron «corría» sin quejarse y el 401 solo quedaba en
  // `net._http_response`, que no mira nadie.
  //
  // Un secreto que hay que copiar a mano entre dos sistemas se desincroniza
  // tarde o temprano. Ahora solo hay una copia (ver migración 0103).
  const vieneDelCron = req.headers.get("x-at-cron");

  if (vieneDelCron) {
    const { data: autorizado } = await admin.rpc("at_cron_secreto_valido", {
      p_secreto: vieneDelCron,
    });
    if (autorizado !== true) {
      return Response.json({ error: "No autorizado" }, { status: 401, headers: cors });
    }

    const { data: conexiones } = await admin
      .from("at_shopify_connections")
      .select("client_id, shop_domain, access_token")
      .eq("active", true);

    let creadas = 0;
    const fallaron: string[] = [];

    for (const conn of (conexiones ?? []) as Conexion[]) {
      try {
        const r = await sincronizarComercio(admin, conn);
        creadas += r.creadas;
      } catch {
        // Una tienda con el token vencido no puede dejar sin sincronizar a las
        // demás. El motivo ya quedó guardado en su propia conexión por
        // sincronizarComercio, así que aquí solo se anota cuál falló.
        fallaron.push(conn.shop_domain);
      }
    }

    return Response.json(
      { tiendas: conexiones?.length ?? 0, creadas, fallaron },
      { headers: cors }
    );
  }

  // ── Puerta 2: una persona ───────────────────────────────────────────────
  const auth = req.headers.get("Authorization");
  if (!auth) {
    return Response.json({ error: "Falta la sesión" }, { status: 401, headers: cors });
  }

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
    .select("client_id, role, active")
    .eq("id", userData.user.id)
    .single();

  // El asesor entra igual que el dueño: es quien gestiona los domicilios. Se
  // comprueba `active` porque a quien su jefe suspendió no se le sincroniza la
  // tienda de un negocio en el que ya no trabaja.
  if (!perfil?.client_id || !perfil.active || !["cliente", "asesor"].includes(perfil.role)) {
    return Response.json(
      { error: "Solo el comercio sincroniza su tienda" },
      { status: 403, headers: cors }
    );
  }

  const { data: conn } = await admin
    .from("at_shopify_connections")
    .select("client_id, shop_domain, access_token, active")
    .eq("client_id", perfil.client_id as string)
    .single();

  if (!conn || !conn.active) {
    return Response.json(
      { error: "Este comercio no tiene una tienda conectada" },
      { status: 400, headers: cors }
    );
  }

  try {
    const r = await sincronizarComercio(admin, conn as Conexion);
    return Response.json(r, { headers: cors });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    return Response.json({ error: detalle }, { status: 502, headers: cors });
  }
});
