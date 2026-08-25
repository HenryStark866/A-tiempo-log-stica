"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Lock,
  MessageCircle,
  PhoneOff,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { GuideStatus } from "@/lib/types";

interface CodeRow {
  guide_id: string;
  guide_number: string;
  status: GuideStatus;
  recipient_name: string;
  recipient_phone: string | null;
  attempts: number;
  locked: boolean;
  verificado: boolean;
  created_at: string;
  algun_envio_ok: boolean;
  todos_fallaron: boolean;
  ultimo_error: string | null;
}

/**
 * WhatsApp quiere el número pelado: sin «+», sin espacios y con indicativo.
 * Los teléfonos llegan como los escribió el comercio («313 546 7802»).
 */
function aWhatsapp(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  if (d.length === 12 && d.startsWith("57")) return d;
  // Un número con indicativo de otro país ya viene completo.
  if (d.length > 10) return d;
  return null;
}

export default function DeliveryCodesPage() {
  const profile = useProfile();
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Qué guía está esperando el «ya lo envié». Se guarda el id del mensaje
  // porque es lo que hay que marcar, y la guía para saber en qué fila pintar
  // el botón de confirmar.
  const [porConfirmar, setPorConfirmar] = useState<{
    guideId: string;
    messageId: string;
  } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_delivery_code_report");
    if (error) setError(error.message);
    setRows((data as CodeRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Abre WhatsApp con el chat del comprador y el mensaje listo. No marca nada:
   * eso lo hace el botón de confirmar, porque desde aquí no hay forma de saber
   * si la persona llegó a pulsar «enviar» o cerró la ventana.
   */
  /**
   * Envío automático por el puente de WhatsApp de la operación.
   *
   * Todo ocurre en el servidor (/api/whatsapp/enviar): el navegador solo dice
   * QUÉ pedido. Ni la llave del puente ni el texto del código —que es lo que
   * firma una entrega— pasan por aquí.
   *
   * Si el puente no está disponible NO se trata como error de la app: se
   * muestra el motivo y queda el botón de siempre para mandarlo a mano. El
   * equipo del puente puede estar apagado, y la operación no puede depender de
   * eso.
   */
  async function enviarAutomatico(guideId: string) {
    setBusy(guideId);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId }),
      });
      const r = (await res.json()) as {
        ok: boolean;
        motivo?: string;
        aviso?: string;
        puedeManual?: boolean;
      };
      setBusy(null);

      if (r.ok) {
        if (r.aviso) setError(r.aviso);
        load();
        return;
      }
      setError(
        r.puedeManual
          ? `${r.motivo} Puedes mandarlo a mano con el botón de al lado.`
          : (r.motivo ?? "No se pudo enviar.")
      );
    } catch {
      setBusy(null);
      setError("No se pudo hablar con el servidor. Mándalo a mano por ahora.");
    }
  }

  async function abrirWhatsapp(guideId: string) {
    setBusy(guideId);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_delivery_code_whatsapp", {
      p_guide_id: guideId,
    });
    setBusy(null);
    if (error) {
      setError(error.message);
      return;
    }

    const msg = data as { message_id: string; phone: string; body: string };
    const numero = aWhatsapp(msg.phone);
    if (!numero) {
      setError(
        `El teléfono «${msg.phone}» no tiene un formato que WhatsApp entienda. Corrígelo en la guía.`
      );
      return;
    }

    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(msg.body)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setPorConfirmar({ guideId, messageId: msg.message_id });
  }

  async function confirmarEnviado() {
    if (!porConfirmar) return;
    setBusy(porConfirmar.guideId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_delivery_code_marcar_enviado", {
      p_message_id: porConfirmar.messageId,
    });
    setBusy(null);
    setPorConfirmar(null);
    if (error) setError(error.message);
    else load();
  }

  async function reenviar(guideId: string) {
    setBusy(guideId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_resend_delivery_code", { p_guide_id: guideId });
    setBusy(null);
    if (error) setError(error.message);
    else load();
  }

  if (!["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role)) {
    return (
      <>
        <PageHeader title="Códigos de entrega" />
        <Card>
          <p className="p-6 text-center text-slate-500 dark:text-slate-400">No tienes acceso a esta sección.</p>
        </Card>
      </>
    );
  }

  if (!rows) return <Loading />;

  // `todos_fallaron` es «no salió el mensaje», por el motivo que sea: puede ser
  // un teléfono mal escrito, pero también un rechazo del proveedor o una cola
  // que se anuló. Decirle «sin teléfono» a todo mandaba a pedirle al comercio
  // un dato que en la mayoría de los casos ya estaba bien.
  //
  // Se excluyen las entregadas: si el paquete ya llegó, que el código no
  // saliera es historia, no una tarea. Dejarlas dentro llenaba el aviso de
  // «requieren tu atención» con guías cerradas hace semanas.
  const noSalieron = rows.filter(
    (r) => r.todos_fallaron && !r.verificado && r.status !== "entregada"
  );
  const bloqueados = rows.filter((r) => r.locked && !r.verificado);
  const entregados = rows.filter((r) => r.verificado);

  return (
    <>
      <PageHeader
        title="Códigos de entrega"
        subtitle={`${entregados.length} verificadas · ${bloqueados.length} bloqueadas · ${noSalieron.length} sin enviar`}
      />

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-center text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {(noSalieron.length > 0 || bloqueados.length > 0) && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Requieren tu atención</p>
            <p className="text-amber-700 dark:text-amber-400">
              {noSalieron.length > 0 &&
                `${noSalieron.length} guía(s) con el mensaje sin salir: el comprador no tiene el código todavía. Revisa el teléfono en la guía —el error de cada una está debajo— y reenvía. `}
              {bloqueados.length > 0 &&
                `${bloqueados.length} código(s) bloqueado(s) por intentos fallidos: reenvía para generar uno nuevo.`}
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty label="Todavía no hay códigos emitidos. Se generan al asignarle la guía a un mensajero en el CEDI." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.guide_id}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/pedidos/${r.guide_id}`}
                      className="font-semibold text-slate-900 hover:underline dark:text-white"
                    >
                      {r.guide_number}
                    </Link>
                    <StatusBadge status={r.status} />
                    {r.verificado ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <BadgeCheck className="size-3" /> Código verificado
                      </span>
                    ) : r.locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                        <Lock className="size-3" /> Bloqueado
                      </span>
                    ) : r.todos_fallaron ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <PhoneOff className="size-3" /> No se pudo enviar
                      </span>
                    ) : r.algun_envio_ok ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        <Send className="size-3" /> Enviado
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/[0.12] dark:text-slate-300">
                        En cola de envío
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {r.recipient_name} · {r.recipient_phone || "sin teléfono"} · emitido{" "}
                    {formatDateTime(r.created_at)}
                    {r.attempts > 0 && !r.verificado && ` · ${r.attempts} intento(s) fallido(s)`}
                  </p>
                  {r.ultimo_error && !r.algun_envio_ok && (
                    <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{r.ultimo_error}</p>
                  )}
                </div>

                {!r.verificado && r.status !== "entregada" && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {porConfirmar?.guideId === r.guide_id ? (
                      // Solo aparece tras abrir WhatsApp: confirma que salió y,
                      // con eso, el código pasa a exigírsele al mensajero.
                      <Button disabled={busy === r.guide_id} onClick={confirmarEnviado}>
                        <Check className="size-4" />
                        Ya lo envié
                      </Button>
                    ) : (
                      !r.algun_envio_ok && (
                        <>
                          {/* El automático primero: es el camino corto. Sale
                              por el WhatsApp de la operación sin que nadie
                              abra nada. Si el puente está caído, avisa y queda
                              el de al lado. */}
                          <Button
                            disabled={busy === r.guide_id}
                            onClick={() => enviarAutomatico(r.guide_id)}
                            title="Enviar el código por el WhatsApp de la operación"
                          >
                            <Send className="size-4" />
                            Enviar
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy === r.guide_id}
                            onClick={() => abrirWhatsapp(r.guide_id)}
                            title="Abrir WhatsApp y mandarlo a mano"
                          >
                            <MessageCircle className="size-4" />
                            A mano
                          </Button>
                        </>
                      )
                    )}
                    <Button
                      variant="secondary"
                      disabled={busy === r.guide_id}
                      onClick={() => reenviar(r.guide_id)}
                    >
                      <RefreshCw
                        className={busy === r.guide_id ? "size-4 animate-spin" : "size-4"}
                      />
                      Reenviar
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 px-1 text-sm text-slate-500 dark:text-slate-400">
        <strong>WhatsApp</strong> abre el chat del comprador con el mensaje ya escrito: sale desde
        el número de la empresa y no cuesta nada. Confirma con <strong>Ya lo envié</strong> solo si
        de verdad lo mandaste — al confirmarlo, el mensajero empieza a exigir ese código, y si el
        comprador no lo tiene la entrega se traba en la puerta.{" "}
        <strong>Reenviar</strong> genera un código nuevo y anula el anterior.
      </p>
      <p className="mt-2 px-1 text-sm text-slate-500 dark:text-slate-400">
        El código no se muestra en esta pantalla ni en ninguna otra: viaja directo al mensaje. En la
        base está como hash, así que ni consultándola se puede leer. El mensajero es el único que
        nunca lo ve — su trabajo es pedírselo a quien recibe el paquete.
      </p>
    </>
  );
}
