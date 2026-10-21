import { timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { frenar } from "@/lib/api/freno";
import { ok, fallo } from "@/lib/api/respuesta";
import { consultarCobro } from "@/lib/pagos/openpayments";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/pagos/openpayments/conciliar — ¿llegó de verdad?
 *
 * Saber que un pago salió no es saber que llegó. `volver` crea el outgoing
 * payment y marca la fila `pagado`, y ahí se acababa la historia: si el remate
 * fallaba justo al enterarse, la fila se quedaba en `autorizando` a propósito
 * —marcarla fallida invitaría a cobrar dos veces— y nadie la volvía a mirar
 * nunca. Esta ruta es quien la vuelve a mirar: le pregunta a la billetera de
 * quien cobra cuánto tiene de verdad, y escribe esa respuesta en la fila.
 *
 * ── Quién puede llamar ───────────────────────────────────────────────────
 * El cron, no una persona. Se autentica con un secreto compartido en
 * `x-conciliar-secreto`, comparado en tiempo constante por el mismo motivo que
 * la firma del gateway de SMS: un `===` filtra, por lo que tarda, cuántos
 * caracteres acertó quien prueba. Sin `OP_CONCILIAR_SECRETO` configurado
 * devuelve 503 y no mira nada más — una ruta que lee tokens de pago no puede
 * quedar abierta porque falte una variable de entorno.
 *
 * ── Por qué hay un tope ──────────────────────────────────────────────────
 * Cada fila es una llamada a la red —permiso más lectura— y la instancia es
 * pequeña. Un barrido sin tope es exactamente la forma del incidente del
 * 2026-09-08 (ver 0112_el_buzon_no_se_atasca_ni_tumba_la_base.sql), donde un
 * trabajo que no terminaba en un minuto se apiló hasta dejar la base sin
 * aceptar conexiones. El tope se topa además dentro de `at_op_por_conciliar`:
 * quien llama puede pedir menos, nunca más.
 *
 * ── Qué NO decide ────────────────────────────────────────────────────────
 * Si lo recibido no cuadra con lo cotizado, la fila queda en `discrepancia` y
 * ahí se para. No se inventa un cobro parcial ni se reparte la diferencia: eso
 * lo mira una persona. Y un cobro que no se pudo consultar no se marca
 * fallido nunca — null no es «no llegó nada», es «no se pudo preguntar».
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Barridos por minuto. El cron llama una vez; esto es para un abuso. */
const BARRIDOS_POR_MINUTO = 10;

/** Cuántos pagos se revisan por llamada si quien llama no dice otra cosa. */
const TOPE_POR_OMISION = 25;

/** Lo que `at_op_por_conciliar` devuelve de cada fila. */
interface PagoPorConciliar {
  id: string;
  cobro_url: string;
  billetera_destino: string;
  estado: string;
  receive_value: string;
  receive_asset_code: string;
  receive_asset_scale: number;
  conciliaciones: number;
}

/** Clave de 16+ caracteres que comparten el cron y esta ruta. */
function secreto(): string | null {
  const s = process.env.OP_CONCILIAR_SECRETO;
  return s && s.length >= 16 ? s : null;
}

function secretoValido(cabecera: string | null, clave: string): boolean {
  if (!cabecera) return false;
  const a = Buffer.from(clave, "utf8");
  const b = Buffer.from(cabecera.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const clave = secreto();
  if (!clave) {
    // Ni se lee el cuerpo. Mientras no haya secreto, esta puerta no existe.
    return fallo("La conciliación de pagos no está configurada en este entorno.", 503);
  }

  if (!frenar("op-conciliar", "cron", BARRIDOS_POR_MINUTO).pasa) {
    return fallo("Demasiados barridos seguidos.", 429);
  }

  if (!secretoValido(request.headers.get("x-conciliar-secreto"), clave)) {
    // Sin detalle: a quien prueba secretos no se le dice en qué falló.
    return fallo("No autorizado.", 401);
  }

  const pedido = Number(new URL(request.url).searchParams.get("tope"));
  const tope = Number.isFinite(pedido) && pedido > 0 ? Math.floor(pedido) : TOPE_POR_OMISION;

  const servicio = clienteDeServicio();

  const { data, error } = await servicio.rpc("at_op_por_conciliar", { p_tope: tope });

  if (error) {
    console.error("[op-conciliar] at_op_por_conciliar falló", error.message);
    return fallo("No se pudo listar lo que falta conciliar.", 502);
  }

  const pagos = (data ?? []) as PagoPorConciliar[];

  let conciliados = 0;
  let discrepancias = 0;
  let enVuelo = 0;
  let sinRespuesta = 0;

  for (const pago of pagos) {
    const ahora = new Date().toISOString();

    try {
      const estado = await consultarCobro({
        cobro: pago.cobro_url,
        billeteraDestino: pago.billetera_destino,
      });

      // Lo que la red dice que se esperaba tiene que ser lo que el comprador
      // vio. Si no lo es, algo tocó el cobro después de crearlo y eso no se
      // resuelve solo: no se compara con `Number` a propósito, los importes
      // del estándar son entero más escala y aquí no entra coma flotante.
      const esperadoCuadra =
        estado.esperado !== null &&
        estado.esperado.value === pago.receive_value &&
        estado.esperado.assetCode === pago.receive_asset_code &&
        estado.esperado.assetScale === pago.receive_asset_scale;

      const anotado = {
        recibido_value: estado.recibido.value,
        recibido_asset_code: estado.recibido.assetCode,
        recibido_asset_scale: estado.recibido.assetScale,
        cobro_completado: estado.completado,
        conciliado_at: ahora,
        conciliaciones: pago.conciliaciones + 1,
      };

      if (estado.discrepancia || !esperadoCuadra) {
        await servicio
          .from("at_pagos_op")
          .update({
            ...anotado,
            estado: "discrepancia",
            motivo_fallo:
              `Lo cobrado no cuadra con lo cotizado: llegaron ` +
              `${estado.recibido.value} ${estado.recibido.assetCode} ` +
              `(escala ${estado.recibido.assetScale}) y se esperaban ` +
              `${pago.receive_value} ${pago.receive_asset_code} ` +
              `(escala ${pago.receive_asset_scale}).`,
          })
          .eq("id", pago.id);
        discrepancias++;
        continue;
      }

      if (estado.cubierto) {
        // El dinero está en la cuenta de quien cobra. Eso es lo que se quería
        // saber, y no se espera a `completed`: esa bandera la pone la
        // billetera de destino cuando quiere, y el importe ya está entero.
        await servicio
          .from("at_pagos_op")
          .update({
            ...anotado,
            estado: "conciliado",
            // Una fila que se quedó en `autorizando` nunca llegó a sellar la
            // hora del pago: se sella ahora, que es cuando se supo.
            pagado_at: ahora,
            // Si quedaba token de continuación, ya no sirve para nada y sigue
            // siendo un token portador.
            continuar_token: null,
          })
          .eq("id", pago.id);
        conciliados++;
        continue;
      }

      // Todavía no llegó todo. Entrar de menos no es discrepancia: un cobro a
      // medio llenar es lo normal mientras el pago está en vuelo. Se anota lo
      // que hay, se deja el estado como está y se vuelve a preguntar — hasta
      // el tope de intentos que fija la 0149.
      await servicio.from("at_pagos_op").update(anotado).eq("id", pago.id);
      enVuelo++;
    } catch (fallaDeRed) {
      const motivo = fallaDeRed instanceof Error ? fallaDeRed.message : "desconocido";
      console.error("[op-conciliar] no se pudo consultar el cobro", {
        pago: pago.id,
        motivo,
      });

      // Se cuenta el intento para que el reintento tenga holgura y el tope
      // acabe frenando, pero NO se escribe `recibido_value`: sin respuesta de
      // la red no hay prueba de nada, y `at_op_vencer_pagos()` exige esa
      // prueba antes de dar un pago por fallido.
      await servicio
        .from("at_pagos_op")
        .update({ conciliado_at: ahora, conciliaciones: pago.conciliaciones + 1 })
        .eq("id", pago.id);
      sinRespuesta++;
    }
  }

  return ok({
    revisados: pagos.length,
    conciliados,
    discrepancias,
    en_vuelo: enVuelo,
    sin_respuesta: sinRespuesta,
  });
}
