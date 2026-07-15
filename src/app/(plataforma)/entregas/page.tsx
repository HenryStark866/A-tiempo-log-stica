"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MapPin, Phone, PlayCircle, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCOP } from "@/lib/utils";
import type { Guide, GuideStatus } from "@/lib/types";

export default function MyRoutePage() {
  const profile = useProfile();
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [modal, setModal] = useState<{ guide: Guide; action: "entregada" | "novedad" } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_guides")
      .select("*, at_clients(business_name), at_zones(name)")
      .eq("courier_id", profile.id)
      .in("status", ["zonificada", "en_ruta", "novedad"])
      .order("status")
      .order("updated_at");
    setGuides((data as Guide[]) ?? []);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function change(guideId: string, to: GuideStatus, n?: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: guideId,
      p_new_status: to,
      p_note: n || null,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    setModal(null);
    setNote("");
    load();
  }

  const zonificadas = (guides ?? []).filter((g) => g.status === "zonificada");
  const enRuta = (guides ?? []).filter((g) => g.status === "en_ruta");
  const novedades = (guides ?? []).filter((g) => g.status === "novedad");

  return (
    <>
      <PageHeader
        title="Mi ruta"
        subtitle="Fase 4: gestión de ruta en última milla — tu carga digital del día"
      />

      {msg && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          {msg}
        </p>
      )}

      {guides === null ? (
        <Loading />
      ) : guides.length === 0 ? (
        <Card>
          <Empty label="No tienes paquetes asignados. El CEDI te cargará guías zonificadas." />
        </Card>
      ) : (
        <div className="space-y-6">
          {[
            { title: `Por iniciar (${zonificadas.length})`, list: zonificadas },
            { title: `En ruta (${enRuta.length})`, list: enRuta },
            { title: `Novedades reportadas (${novedades.length})`, list: novedades },
          ].map(
            (sec) =>
              sec.list.length > 0 && (
                <div key={sec.title}>
                  <h2 className="mb-3 font-bold text-navy-900">{sec.title}</h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sec.list.map((g) => (
                      <Card key={g.id} className="p-5">
                        <div className="mb-2 flex items-center justify-between">
                          <Link href={`/guias/${g.id}`} className="font-bold text-brand-600 hover:underline">
                            {g.guide_number}
                          </Link>
                          <StatusBadge status={g.status} />
                        </div>
                        <p className="font-semibold text-navy-900">{g.recipient_name}</p>
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                          {g.recipient_address} · {g.at_zones?.name ?? ""}
                        </p>
                        {g.recipient_phone && (
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone className="size-4 text-slate-400" /> {g.recipient_phone}
                          </p>
                        )}
                        {g.is_cod && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">
                            Recaudar: {formatCOP(g.cod_amount)}
                          </p>
                        )}
                        <div className="mt-4 flex gap-2">
                          {g.status === "zonificada" && (
                            <Button className="flex-1" disabled={busy} onClick={() => change(g.id, "en_ruta")}>
                              <PlayCircle className="size-4" /> Iniciar ruta
                            </Button>
                          )}
                          {g.status === "en_ruta" && (
                            <>
                              <Button
                                className="flex-1"
                                disabled={busy}
                                onClick={() => setModal({ guide: g, action: "entregada" })}
                              >
                                <CheckCircle2 className="size-4" /> Entregar
                              </Button>
                              <Button
                                variant="danger"
                                disabled={busy}
                                onClick={() => setModal({ guide: g, action: "novedad" })}
                              >
                                <TriangleAlert className="size-4" />
                              </Button>
                            </>
                          )}
                          {g.status === "novedad" && (
                            <p className="text-xs text-slate-500">
                              Lleva el paquete de vuelta al CEDI para su evaluación (intento{" "}
                              {g.delivery_attempts}/2).
                            </p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {modal && (
        <Modal
          title={
            modal.action === "entregada"
              ? `Confirmar entrega — ${modal.guide.guide_number}`
              : `Reportar novedad — ${modal.guide.guide_number}`
          }
          onClose={() => setModal(null)}
        >
          {modal.action === "entregada" && modal.guide.is_cod && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Esta guía es contraentrega: confirma que recaudaste{" "}
              {formatCOP(modal.guide.cod_amount)} (efectivo o digital).
            </p>
          )}
          <Field label={modal.action === "entregada" ? "Observación (opcional)" : "Motivo de la novedad"}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder={
                modal.action === "entregada"
                  ? "Ej: recibido por el portero"
                  : "Ej: destinatario ausente, dirección errada, rechazo…"
              }
            />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || (modal.action === "novedad" && !note.trim())}
              onClick={() => change(modal.guide.id, modal.action, note)}
            >
              Confirmar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
