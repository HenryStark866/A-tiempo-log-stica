import { NextResponse, type NextRequest } from "next/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { fallo } from "@/lib/api/respuesta";
import { frenar, actorDe } from "@/lib/api/freno";
import { rematarPago, verificarRegreso } from "@/lib/pagos/openpayments";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/pagos/openpayments/volver — el comprador autorizó y regresó
 *
 * Segundo tramo del pago. Su billetera lo devuelve aquí con tres datos en la
 * URL: el `nonce` que pusimos nosotros, el `interact_ref` del permiso y un
 * `hash`. Con eso se encuentra la fila de `at_pagos_op`, se canjea el permiso
 * por un token y se crea el pago.
 *
 * ── Por qué aquí no hay sesión ───────────────────────────────────────────
 * Quien llega a esta URL viene de redirección desde otro sitio, y puede
 * llegar en otro navegador —autorizó en el móvil lo que empezó en el
 * escritorio—. Pedir sesión dejaría pagos autorizados sin rematar. Lo que
 * autoriza no es la sesión: es el `hash`, que solo puede calcular quien
 * conoce los dos nonces, y uno de ellos nunca salió de nuestra base.
 *
 * Por eso el hash se comprueba SIEMPRE y antes de tocar la red. Sin eso,
 * cualquiera que adivine esta URL nos hace intentar remates en balde, que es
 * un ataque gratis contra el servidor de autorización del otro lado.
 *
 * ── Qué pasa si se llama dos veces ───────────────────────────────────────
 * La primera deja la fila en `pagado`; las siguientes no encuentran ninguna
 * en `autorizando` y terminan ahí mismo, sin tocar la red. El estándar
 * tampoco cobraría dos veces —un `interact_ref` es de un solo uso—, pero no
 * hace falta llegar a preguntárselo.
 *
 * ── Qué devuelve ─────────────────────────────────────────────────────────
 * Una redirección, no JSON: al otro lado de esta URL hay una persona con un
 * navegador abierto, no un programa. El JSON de error queda para cuando la
 * llamada viene tan mal que no se sabe a dónde mandarla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Regresos por minuto desde una misma IP. Uno de verdad llega una sola vez. */
const REGRESOS_POR_MINUTO = 20;

function aDonde(request: NextRequest, parametros: Record<string, string>): NextResponse {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  const destino = new URL(`${base}/rastreo`);
  for (const [clave, valor] of Object.entries(parametros)) {
    destino.searchParams.set(clave, valor);
  }
  return NextResponse.redirect(destino, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  if (!frenar("op-volver", actorDe(request), REGRESOS_POR_MINUTO).pasa) {
    return fallo("Demasiadas vueltas seguidas.", 429);
  }

  const url = new URL(request.url);
  const nonce = url.searchParams.get("nonce")?.trim();
  const interactRef = url.searchParams.get("interact_ref")?.trim();
  const hash = url.searchParams.get("hash")?.trim();

  if (!nonce || !interactRef || !hash) {
    // Sin estos tres no se puede ni saber de qué pago habla.
    return fallo("Este enlace está incompleto.", 400);
  }

  const servicio = clienteDeServicio();

  const { data: pago } = await servicio
    .from("at_pagos_op")
    .select(
      "id, estado, as_nonce, auth_server, continuar_uri, continuar_token, billetera_pagador, cotizacion_url, expira_at, guide_id"
    )
    .eq("nonce", nonce)
    .maybeSingle();

  if (!pago) {
    return aDonde(request, { op: "fallo", motivo: "no-existe" });
  }

  if (pago.estado === "pagado") {
    // Ya estaba. Volver a entrar al enlace no es un error para quien lo hace.
    return aDonde(request, { op: "listo" });
  }

  if (pago.estado !== "autorizando" || !pago.continuar_uri || !pago.continuar_token) {
    return aDonde(request, { op: "fallo", motivo: "vencido" });
  }

  if (new Date(pago.expira_at).getTime() < Date.now()) {
    await servicio
      .from("at_pagos_op")
      .update({
        estado: "fallido",
        motivo_fallo: "La cotizacion vencio antes de volver de autorizar.",
      })
      .eq("id", pago.id);
    return aDonde(request, { op: "fallo", motivo: "vencido" });
  }

  if (
    !verificarRegreso({
      nonce,
      asNonce: pago.as_nonce,
      interactRef,
      authServer: pago.auth_server,
      hash,
    })
  ) {
    // No se marca la fila como fallida: el pago legítimo puede estar todavía
    // por llegar, y un hash malo es de quien prueba, no de quien pagó.
    console.error("[op-volver] hash de regreso inválido", { pago: pago.id });
    return fallo("No autorizado.", 401);
  }

  try {
    const hecho = await rematarPago({
      continuarUri: pago.continuar_uri,
      continuarToken: pago.continuar_token,
      interactRef,
      billeteraPagador: pago.billetera_pagador,
      cotizacion: pago.cotizacion_url,
      referencia: { pago: pago.id },
    });

    await servicio
      .from("at_pagos_op")
      .update({
        estado: "pagado",
        interact_ref: interactRef,
        pago_url: hecho.id,
        pagado_at: new Date().toISOString(),
        // El token ya se gastó. Guardado no sirve para nada y sigue siendo un
        // token portador: se borra.
        continuar_token: null,
      })
      .eq("id", pago.id);

    return aDonde(request, { op: "listo" });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "desconocido";
    console.error("[op-volver] no se pudo rematar el pago", motivo);

    // Queda en `autorizando` a propósito: el pago pudo haberse creado al otro
    // lado y lo que falló fue enterarnos. Marcarlo fallido aquí invitaría a
    // cobrar dos veces. Lo resuelve la conciliación (docs/open-payments.md).
    await servicio
      .from("at_pagos_op")
      .update({ interact_ref: interactRef, motivo_fallo: motivo.slice(0, 300) })
      .eq("id", pago.id);

    return aDonde(request, { op: "fallo", motivo: "sin-remate" });
  }
}
