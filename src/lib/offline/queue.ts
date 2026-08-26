/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA COLA DE ACCIONES SIN CONEXIÓN
 *
 * Tres oficios andan sin señal de verdad: el mensajero en la calle, el CEDI en
 * una bodega donde el wifi falla, el comercio con mal servicio. Los tres
 * necesitan lo mismo — que tocar un botón no dependa de tener señal en ese
 * instante exacto — así que hay una sola cola, no tres.
 *
 * Cómo funciona:
 *  1. Cada acción (iniciar ruta, confirmar entrega, recibir un lote…) se
 *     intenta contra el servidor de una. Si la red responde, no toca esta
 *     cola para nada.
 *  2. Si falla por falta de señal, la acción se guarda aquí con todo lo que
 *     necesita para repetirse después, y la pantalla actúa como si ya
 *     hubiera pasado (estado optimista): el mensajero sigue trabajando.
 *  3. En cuanto vuelve la conexión —evento `online`, o el sondeo de
 *     refuerzo— se reprocesa la cola en el orden en que se creó.
 *  4. Si el servidor la rechaza de verdad (la guía ya cambió de estado, ya no
 *     es tuya, algo que no es "no hay señal"), se marca como conflicto y se
 *     queda ahí, visible, en vez de reintentarse sola para siempre o
 *     borrarse en silencio: quien la creó decide si la descarta.
 *
 * Qué NO entra aquí: nada que dependa de ver el estado más reciente de otra
 * persona en el momento (asignar un mensajero, ver la flota en el mapa). Eso
 * es exactamente lo que no tiene sentido resolver a ciegas sin señal.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/lib/supabase/client";
import { uploadDeliveryEvidence } from "@/lib/evidence";
import * as db from "./db";

export type TipoAccion =
  | "iniciar_ruta"
  | "confirmar_entrega"
  | "reportar_novedad"
  | "recibir_guia"
  | "recibir_lote"
  | "crear_guia"
  | "solicitar_recogida"
  | "iniciar_recogida"
  | "confirmar_recogida";

export interface AccionEnCola {
  id: string;
  tipo: TipoAccion;
  payload: unknown;
  /** Para mostrarlo en la lista de pendientes sin ir a buscar la guía. */
  resumen: string;
  creadoEn: string;
  conflicto?: string;
}

// ── Payloads de cada tipo de acción ─────────────────────────────────────

export interface PayloadIniciarRuta {
  guideId: string;
}
export interface PayloadConfirmarEntrega {
  guideId: string;
  signatureName: string | null;
  note: string | null;
  deliveryCode: string | null;
  /** La foto va tal cual el archivo que se tomó: se sube recién al sincronizar. */
  evidencia: { blob: Blob; nombre: string } | null;
}
export interface PayloadReportarNovedad {
  guideId: string;
  note: string | null;
}
export interface PayloadRecibirGuia {
  guideId: string;
  guideNumber: string;
}
export interface PayloadRecibirLote {
  token: string;
}
export interface PayloadCrearGuia {
  /** Va tal cual como lo arma /pedidos/nueva: una fila lista para insertar. */
  fila: Record<string, unknown>;
}
export interface PayloadSolicitarRecogida {
  args: Record<string, unknown>;
}
export interface PayloadIniciarRecogida {
  pickupId: string;
}
export interface PayloadConfirmarRecogida {
  pickupId: string;
  guideIds: string[];
  note: string | null;
  /** Para el resumen del panel; el servidor no lo necesita. */
  comercio: string | null;
}

/**
 * Distingue "no hubo señal" de "el servidor dijo que no".
 *
 * supabase-js no diferencia las dos cosas con un campo propio: un fallo de
 * red llega como un TypeError de fetch sin `code`; un rechazo de negocio
 * (RLS, una excepción de un RPC) llega con estructura de error de Postgres.
 * Un `code` (aunque sea el genérico de Postgres) es la señal de que sí hubo
 * respuesta del servidor, y por lo tanto de que no es un problema de señal.
 */
export function esFalloDeRed(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; message?: string; name?: string };
  if (e.code) return false;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    e.name === "TypeError"
  );
}

/** Lo que se ve en el panel de pendientes: una frase, no un objeto técnico. */
function resumenDe(tipo: TipoAccion, payload: unknown): string {
  switch (tipo) {
    case "iniciar_ruta":
      return "Iniciar ruta";
    case "confirmar_entrega":
      return "Confirmar entrega";
    case "reportar_novedad":
      return "Reportar novedad";
    case "recibir_guia":
      return `Recibir ${(payload as PayloadRecibirGuia).guideNumber}`;
    case "recibir_lote":
      return "Recibir lote del comercio";
    case "crear_guia":
      return `Nueva guía · ${(payload as PayloadCrearGuia).fila.recipient_name ?? ""}`;
    case "solicitar_recogida":
      return "Solicitar recogida";
    case "iniciar_recogida":
      return "Salir a recoger";
    case "confirmar_recogida": {
      const p = payload as PayloadConfirmarRecogida;
      const n = p.guideIds.length;
      return `Recogida en ${p.comercio ?? "el comercio"} · ${n} paquete${n === 1 ? "" : "s"}`;
    }
  }
}

export async function encolar(tipo: TipoAccion, payload: unknown): Promise<AccionEnCola> {
  const accion: AccionEnCola = {
    id: crypto.randomUUID(),
    tipo,
    payload,
    resumen: resumenDe(tipo, payload),
    creadoEn: new Date().toISOString(),
  };
  await db.put(accion);
  return accion;
}

export function listar(): Promise<AccionEnCola[]> {
  return db.listarTodo<AccionEnCola>();
}

export function descartar(id: string): Promise<void> {
  return db.eliminar(id);
}

// ── Ejecutores: el mismo camino que ya usaba cada pantalla ──────────────

/**
 * ¿El servidor rechazó esto porque YA existía?
 *
 * Es el caso de «se ejecutó y no me enteré»: la petición llegó, se guardó, y la
 * respuesta se perdió en el camino de vuelta. Al reintentar, el índice único
 * sobre client_request_id la rechaza con 23505. No es un error: es la prueba de
 * que el trabajo ya está hecho, así que la acción se da por cumplida.
 */
function esDuplicado(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "23505" ||
    /duplicate key|client_request_id/i.test(e.message ?? "")
  );
}

/**
 * ¿El servidor rechazó esto porque el trabajo YA está hecho?
 *
 * Las recogidas no se pueden reintentar a ciegas como una inserción: al
 * reproducir una confirmación que sí llegó, `at_confirm_pickup` responde
 * «esta recogida ya está completada». Eso no es un fallo —es la prueba de que
 * funcionó— pero sin distinguirlo la cola lo trataría como error y estaría
 * reintentándolo eternamente, con el mensajero viendo un pendiente que nunca
 * baja.
 *
 * Se mira el texto porque la excepción viene de un `raise` de PL/pgSQL y todas
 * llegan con el mismo código (P0001): no hay nada más fino a lo que agarrarse.
 */
function yaEstabaHecho(error: unknown): boolean {
  const m = (error as { message?: string } | null)?.message ?? "";
  return /ya está (completada|cancelada|en_curso|en curso)/i.test(m);
}

async function ejecutar(accion: AccionEnCola): Promise<void> {
  const supabase = createClient();

  switch (accion.tipo) {
    case "iniciar_ruta": {
      const p = accion.payload as PayloadIniciarRuta;
      const { error } = await supabase.rpc("at_change_guide_status", {
        p_guide_id: p.guideId,
        p_new_status: "en_ruta",
        p_note: null,
      });
      if (error) throw error;
      return;
    }
    case "confirmar_entrega": {
      const p = accion.payload as PayloadConfirmarEntrega;
      let evidenceUrl: string | null = null;
      if (p.evidencia) {
        const file = new File([p.evidencia.blob], p.evidencia.nombre, {
          type: p.evidencia.blob.type,
        });
        evidenceUrl = await uploadDeliveryEvidence(p.guideId, file);
      }
      const { error } = await supabase.rpc("at_confirm_delivery", {
        p_guide_id: p.guideId,
        p_evidence_url: evidenceUrl,
        p_signature_name: p.signatureName,
        p_note: p.note,
        p_delivery_code: p.deliveryCode,
      });
      if (error) throw error;
      return;
    }
    case "reportar_novedad": {
      const p = accion.payload as PayloadReportarNovedad;
      const { error } = await supabase.rpc("at_change_guide_status", {
        p_guide_id: p.guideId,
        p_new_status: "novedad",
        p_note: p.note,
      });
      if (error) throw error;
      return;
    }
    case "recibir_guia": {
      const p = accion.payload as PayloadRecibirGuia;
      const { error } = await supabase.rpc("at_change_guide_status", {
        p_guide_id: p.guideId,
        p_new_status: "en_cedi",
        p_note: "Escaneo de recepción en bodega",
      });
      if (error) throw error;
      return;
    }
    case "recibir_lote": {
      const p = accion.payload as PayloadRecibirLote;
      const { error } = await supabase.rpc("at_receive_pickup", { p_token: p.token });
      if (error) throw error;
      return;
    }
    case "crear_guia": {
      const p = accion.payload as PayloadCrearGuia;
      // El id de la acción viaja como identificador de la petición. Si esta
      // misma ya se ejecutó —porque llegó al servidor y la respuesta se
      // perdió de vuelta—, el índice único la rechaza y eso es exactamente lo
      // que queremos: significa que el pedido YA existe.
      const { error } = await supabase
        .from("at_guides")
        .insert({ ...p.fila, client_request_id: accion.id });
      if (error) {
        if (esDuplicado(error)) return; // ya se había creado: nada que hacer
        throw error;
      }
      return;
    }
    case "iniciar_recogida": {
      const p = accion.payload as PayloadIniciarRecogida;
      const { error } = await supabase.rpc("at_start_pickup", { p_pickup_id: p.pickupId });
      if (error) {
        if (yaEstabaHecho(error)) return;
        throw error;
      }
      return;
    }
    case "confirmar_recogida": {
      const p = accion.payload as PayloadConfirmarRecogida;
      const { error } = await supabase.rpc("at_confirm_pickup", {
        p_pickup_id: p.pickupId,
        p_guide_ids: p.guideIds,
        p_note: p.note,
      });
      if (error) {
        if (yaEstabaHecho(error)) return;
        throw error;
      }
      return;
    }
    case "solicitar_recogida": {
      const p = accion.payload as PayloadSolicitarRecogida;
      // Aquí no hace falta atrapar el duplicado: la función devuelve la
      // recogida que ya existía en vez de crear otra (migración 0099).
      const { error } = await supabase.rpc("at_request_pickup", {
        ...p.args,
        p_request_id: accion.id,
      });
      if (error) throw error;
      return;
    }
  }
}

export interface ResultadoSincronizacion {
  sincronizadas: number;
  conConflicto: number;
  /** true si se detuvo por falta de señal (hay que reintentar más tarde, no es culpa de nadie). */
  sinSenal: boolean;
}

/**
 * Reprocesa la cola en orden. Una acción que choca con el servidor (RLS, una
 * regla de negocio, la guía ya no está donde se dejó) se marca y se salta:
 * no bloquea las demás, que pueden ser de una guía totalmente distinta. Una
 * acción que falla por falta de señal detiene todo el intento — seguir
 * probando una por una sin conexión es I/O gastado en algo que ya se sabe
 * que va a fallar, y además desordenaría cuál se marca como "sin señal" y
 * cuál como "conflicto" cuando en realidad ninguna tuvo su oportunidad real.
 */
export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const pendientes = await listar();
  let sincronizadas = 0;
  let conConflicto = 0;

  for (const accion of pendientes) {
    if (accion.conflicto) continue; // espera a que la persona decida

    try {
      await ejecutar(accion);
      await db.eliminar(accion.id);
      sincronizadas++;
    } catch (error) {
      if (esFalloDeRed(error)) {
        return { sincronizadas, conConflicto, sinSenal: true };
      }
      const mensaje = error instanceof Error ? error.message : "El servidor rechazó esta acción";
      await db.put({ ...accion, conflicto: mensaje });
      conConflicto++;
    }
  }

  return { sincronizadas, conConflicto, sinSenal: false };
}
