"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Lock, PhoneOff, RefreshCw, Send, TriangleAlert } from "lucide-react";
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

export default function DeliveryCodesPage() {
  const profile = useProfile();
  const [rows, setRows] = useState<CodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_delivery_code_report");
    if (error) setError(error.message);
    setRows((data as CodeRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reenviar(guideId: string) {
    setBusy(guideId);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_resend_delivery_code", { p_guide_id: guideId });
    setBusy(null);
    if (error) setError(error.message);
    else load();
  }

  if (!["admin", "coordinador", "operario"].includes(profile.role)) {
    return (
      <>
        <PageHeader title="Códigos de entrega" />
        <Card>
          <p className="p-6 text-center text-slate-500">No tienes acceso a esta sección.</p>
        </Card>
      </>
    );
  }

  if (!rows) return <Loading />;

  const sinTelefono = rows.filter((r) => r.todos_fallaron && !r.verificado);
  const bloqueados = rows.filter((r) => r.locked && !r.verificado);
  const entregados = rows.filter((r) => r.verificado);

  return (
    <>
      <PageHeader
        title="Códigos de entrega"
        subtitle={`${entregados.length} verificadas · ${bloqueados.length} bloqueadas · ${sinTelefono.length} sin teléfono`}
      />

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-center text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {(sinTelefono.length > 0 || bloqueados.length > 0) && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Requieren tu atención</p>
            <p className="text-amber-700 dark:text-amber-400">
              {sinTelefono.length > 0 &&
                `${sinTelefono.length} guía(s) sin teléfono del destinatario: el comprador nunca recibió el código y el mensajero no va a poder entregar. Pídele el número al comercio y reenvía. `}
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
                      href={`/guias/${r.guide_id}`}
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
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
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
                  <Button
                    variant="secondary"
                    disabled={busy === r.guide_id}
                    onClick={() => reenviar(r.guide_id)}
                  >
                    <RefreshCw className={busy === r.guide_id ? "size-4 animate-spin" : "size-4"} />
                    Reenviar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 px-1 text-sm text-slate-500 dark:text-slate-400">
        El código nunca se muestra aquí ni en ninguna pantalla: solo existe en el mensaje que
        recibió el comprador. Reenviar genera uno nuevo y anula el anterior. Mientras no haya
        proveedor de mensajería conectado, el código no se le exige al mensajero: la exigencia se
        activa sola, guía por guía, en cuanto el mensaje empiece a salir.
      </p>
    </>
  );
}
