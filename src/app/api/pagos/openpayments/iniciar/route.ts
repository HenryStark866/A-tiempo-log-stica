import { randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { ok, fallo } from "@/lib/api/respuesta";
import { frenar } from "@/lib/api/freno";
import {
  resolverBilletera,
  crearCobro,
  cotizar,
  pedirPermisoDePago,
} from "@/lib/pagos/openpayments";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/pagos/openpayments/iniciar — armar el pago y mandar a autorizar
 *
 * Primer tramo de los dos que tiene un pago de Open Payments. Aquí se arma
 * todo —cobro, cotización, permiso— y se devuelve a dónde hay que mandar al
 * comprador. El segundo tramo es `/volver`, cuando él regrese de autorizar.
 *
 * ── Qué se comprueba, y por qué cada cosa ────────────────────────────────
 *
 *   · Hay sesión. Un pago anónimo no se puede reclamar después.
 *   · El pedido es suyo. No lo comprueba este código: lo comprueba RLS. La
 *     consulta va con el cliente de la persona, y la política de la 0146 hace
 *     que un pedido ajeno simplemente no exista para ella.
 *   · El comercio tiene billetera VERIFICADA. Cobrarle a alguien contra una
 *     dirección que nadie resolvió contra la red es la forma más fácil de
 *     mandar dinero a ninguna parte.
 *
 * ── La moneda sale de la billetera del comercio ──────────────────────────
 * Hoy los importes de las tablas `at_` son números sin moneda, y eran pesos
 * porque todos los comercios estaban en Medellín. Aquí se toma la moneda de
 * la billetera verificada del comercio: un comercio cotiza en SU moneda, que
 * es lo que hace cualquiera. El cambio lo resuelve la red en la cotización, y
 * es el número que hay que enseñarle al comprador antes de que autorice.
 *
 * Esto es un paso, no la solución: el día que un mismo comercio venda en dos
 * monedas, la moneda tendrá que estar en la fila y no en el comercio (ver
 * docs/open-payments.md, punto 4).
 *
 * ── Lo que esta ruta guarda ──────────────────────────────────────────────
 * La fila de `at_pagos_op` (migración 0148) con la URI de continuación y su
 * token. Se guarda ANTES de devolverle el enlace al comprador: si se guardara
 * después, un fallo en medio dejaría a la persona autorizando un pago que
 * nosotros ya no sabríamos rematar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Pagos que una misma persona puede armar por minuto. */
const PAGOS_POR_MINUTO = 6;

/** Cuánto vale una cotización antes de volver a pedirla. Igual que la 0148. */
const VIGENCIA_MIN = 60;

interface Cuerpo {
  guia?: string;
  billeteraPagador?: string;
}

/** De pesos (o euros) con decimales al entero con escala que pide el estándar. */
function aImporteEntero(monto: number, escala: number): string {
  return Math.round(monto * 10 ** escala).toString();
}

export async function POST(request: NextRequest) {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return fallo("Cuerpo ilegible.", 400);
  }

  const guia = cuerpo.guia?.trim();
  const billeteraPagador = cuerpo.billeteraPagador?.trim();

  if (!guia || !billeteraPagador) {
    return fallo("Falta el pedido o tu dirección de billetera.", 400);
  }
  if (!billeteraPagador.startsWith("https://")) {
    return fallo(
      "Una dirección de billetera es una URL que empieza por https://",
      400
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fallo("Tu sesión venció.", 401);
  }

  if (!frenar("op-iniciar", `uid:${user.id}`, PAGOS_POR_MINUTO).pasa) {
    return fallo("Vas muy rápido. Espera un momento y vuelve a intentarlo.", 429);
  }

  // RLS decide si este pedido es suyo. Si no lo es, no hay fila.
  const { data: pedido, error: errorPedido } = await supabase
    .from("at_guides")
    .select("id, guide_number, client_id, cod_amount, declared_value, status")
    .eq("id", guia)
    .maybeSingle();

  if (errorPedido || !pedido) {
    return fallo("No encontramos ese pedido.", 404);
  }

  const monto = Number(pedido.cod_amount) > 0
    ? Number(pedido.cod_amount)
    : Number(pedido.declared_value);

  if (!(monto > 0)) {
    return fallo("Ese pedido no tiene nada por cobrar.", 409);
  }

  // La billetera del comercio NO la puede leer el comprador (la 0147 revocó
  // esas columnas), y hace bien: puestas juntas serían un directorio de a
  // quién cobrarle. La lee la máquina, que es quien va a usarla.
  const servicio = clienteDeServicio();
  const { data: comercio } = await servicio
    .from("at_clients")
    .select("business_name, wallet_address, wallet_asset_code, wallet_verified_at")
    .eq("id", pedido.client_id)
    .maybeSingle();

  if (!comercio?.wallet_address || !comercio.wallet_verified_at) {
    return fallo(
      "Este comercio todavía no tiene billetera verificada para recibir pagos.",
      409
    );
  }

  const yaPagado = await servicio
    .from("at_pagos_op")
    .select("id")
    .eq("guide_id", pedido.id)
    .eq("estado", "pagado")
    .maybeSingle();

  if (yaPagado.data) {
    return fallo("Este pedido ya está pagado.", 409);
  }

  try {
    // La escala la manda la red, no nosotros: COP suele ser 2 y hay monedas
    // con 0 y con 9. Tomarla de la billetera evita cobrar cien veces de más.
    const destino = await resolverBilletera(comercio.wallet_address);

    const importe = {
      value: aImporteEntero(monto, destino.assetScale),
      assetCode: destino.assetCode,
      assetScale: destino.assetScale,
    };

    const cobro = await crearCobro({
      billeteraDestino: comercio.wallet_address,
      importe,
      descripcion: `Pedido ${pedido.guide_number}`,
      referencia: { guia: pedido.guide_number },
    });

    const cotizacion = await cotizar({
      billeteraPagador,
      cobro: cobro.id,
    });

    const nonce = randomBytes(24).toString("base64url");
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      new URL(request.url).origin;

    const permiso = await pedirPermisoDePago({
      billeteraPagador,
      debitAmount: cotizacion.debitAmount,
      receiveAmount: cotizacion.receiveAmount,
      urlDeRegreso: `${base}/api/pagos/openpayments/volver`,
      nonce,
    });

    const { error: errorGuardar } = await servicio.from("at_pagos_op").insert({
      guide_id: pedido.id,
      estado: "autorizando",
      billetera_pagador: billeteraPagador,
      billetera_destino: comercio.wallet_address,
      cobro_url: cobro.id,
      cotizacion_url: cotizacion.id,
      debit_value: cotizacion.debitAmount.value,
      debit_asset_code: cotizacion.debitAmount.assetCode,
      debit_asset_scale: cotizacion.debitAmount.assetScale,
      receive_value: cotizacion.receiveAmount.value,
      receive_asset_code: cotizacion.receiveAmount.assetCode,
      receive_asset_scale: cotizacion.receiveAmount.assetScale,
      nonce,
      as_nonce: permiso.asNonce,
      auth_server: permiso.authServer,
      continuar_uri: permiso.continuar.uri,
      continuar_token: permiso.continuar.token,
      expira_at: new Date(Date.now() + VIGENCIA_MIN * 60_000).toISOString(),
    });

    if (errorGuardar) {
      console.error("[op-iniciar] no se pudo guardar el permiso", errorGuardar.message);
      // Mejor no mandarlo a autorizar que mandarlo a autorizar un pago que
      // después no podríamos rematar.
      return fallo("No se pudo preparar el pago. Vuelve a intentarlo.", 502);
    }

    return ok({
      autorizar: permiso.redirect,
      // Lo que va a ver el comprador ANTES de autorizar: de aquí sale tanto,
      // allá llega tanto. La diferencia es el cambio más lo que cobre la red.
      cambio: {
        sale: cotizacion.debitAmount,
        llega: cotizacion.receiveAmount,
        comercio: comercio.business_name,
      },
      vence_en_minutos: VIGENCIA_MIN,
    });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "desconocido";
    console.error("[op-iniciar] la red de Open Payments falló", motivo);
    return fallo(
      "No pudimos preparar el pago con tu billetera. Revisa la dirección e inténtalo de nuevo.",
      502
    );
  }
}
