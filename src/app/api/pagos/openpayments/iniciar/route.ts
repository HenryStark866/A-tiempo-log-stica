import { randomBytes } from "node:crypto";
import { type NextRequest } from "next/server";
import { clienteDeLaPersona } from "@/lib/supabase/portador";
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
 * ── La moneda del pedido, y por qué esto se niega a cobrar en euros ──────
 * Los importes de las tablas `at_` son números SIN moneda, y son pesos porque
 * hasta hoy todos los comercios estaban en Medellín. Un `cod_amount` de
 * 50.000 contra una billetera en euros no son 50.000 euros: son ~11, y
 * etiquetar ese número con la moneda de la billetera es pedir cuatro mil
 * veces el precio. Por eso aquí se comprueba, y si la billetera del comercio
 * cobra en otra cosa que `MONEDA_IMPLICITA` la ruta NO cobra: contesta que no
 * puede y se queda quieta.
 *
 * Es un cerrojo, no una solución. La solución es moneda por fila —el plan
 * está en docs/multimoneda.md— y mientras no exista, la única salida honesta
 * es no cobrar: un cobro cuatro mil veces mayor no se descubre revisando
 * logs, se descubre cuando alguien reclama su dinero.
 *
 * El cambio de divisas sí funciona, y es lo que distingue a YAM: lo resuelve
 * la cotización entre la billetera del COMPRADOR y la del comercio. Alguien
 * con euros le paga a un comercio que cobra en pesos, y la red hace el
 * cambio. Lo que falta es lo otro: que el comercio pueda poner su precio en
 * su propia moneda.
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

/**
 * La moneda en la que están escritos los importes de las tablas `at_`, sin
 * que ninguna columna lo diga. Mientras siga siendo una suposición y no un
 * dato, esta ruta no cobra contra una billetera que cobre en otra cosa.
 */
const MONEDA_IMPLICITA = "COP";

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

  // Cookies si viene del navegador, `Authorization: Bearer` si viene de la
  // app del teléfono. En los dos casos manda RLS.
  const supabase = await clienteDeLaPersona(request);
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
    .select(
      "business_name, wallet_address, wallet_asset_code, wallet_verified_at, billing_currency"
    )
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

    // El cerrojo de la moneda (ver la cabecera). Tienen que coincidir LAS
    // TRES: lo que dice la red ahora mismo, la copia que guardamos al
    // verificar la billetera, y la moneda en la que están escritos los
    // precios de ese comercio. Que la red no cuadre con la copia significa
    // que el comercio cambió su billetera de moneda y nadie se enteró, y ese
    // caso tiene que frenar igual que el otro.
    const monedas = new Set([
      destino.assetCode,
      comercio.wallet_asset_code ?? destino.assetCode,
      comercio.billing_currency ?? MONEDA_IMPLICITA,
    ]);

    if (monedas.size > 1 || destino.assetCode !== MONEDA_IMPLICITA) {
      console.error("[op-iniciar] las monedas no cuadran", {
        comercio: pedido.client_id,
        red: destino.assetCode,
        guardada: comercio.wallet_asset_code,
        precios: comercio.billing_currency,
      });
      return fallo(
        monedas.size > 1
          ? "La moneda de la billetera de este comercio no coincide con la " +
              "de sus precios. No podemos cobrarte hasta que lo corrijan, " +
              "para no cobrarte de más."
          : `Este comercio cobra en ${destino.assetCode} y los precios de la ` +
              "plataforma todavía están en pesos. No podemos cobrarte hasta " +
              "que eso quede resuelto, para no cobrarte de más.",
        409
      );
    }

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
