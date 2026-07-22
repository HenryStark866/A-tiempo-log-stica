"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MapPin, Phone, PlayCircle, TriangleAlert, Loader2, Package, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
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
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Mi ruta</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Fase 4: gestión de ruta en última milla — tu carga digital del día
        </p>
      </div>

      {msg && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
          <p className="text-[14px] text-rose-600 dark:text-rose-400 font-medium">{msg}</p>
        </div>
      )}

      {guides === null ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[15px]">Cargando tu ruta…</p>
        </div>
      ) : guides.length === 0 ? (
        <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-8 flex flex-col items-center justify-center gap-3 shadow-sm transition-colors duration-300">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-[16px] text-slate-500 dark:text-slate-400 text-center max-w-sm">No tienes paquetes asignados. El CEDI te cargará guías zonificadas.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {[
            { title: `Por iniciar (${zonificadas.length})`, list: zonificadas },
            { title: `En ruta (${enRuta.length})`, list: enRuta },
            { title: `Novedades reportadas (${novedades.length})`, list: novedades },
          ].map(
            (sec) =>
              sec.list.length > 0 && (
                <section key={sec.title} className="space-y-3">
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white px-1">{sec.title}</h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sec.list.map((g) => (
                      <div key={g.id} className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 shadow-sm transition-colors duration-300 flex flex-col">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <Link href={`/guias/${g.id}`} className="text-[17px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity truncate">
                            {g.guide_number}
                          </Link>
                          <div className="shrink-0"><StatusBadge status={g.status} /></div>
                        </div>
                        
                        <p className="font-semibold text-[16px] text-slate-900 dark:text-white mb-2">{g.recipient_name}</p>
                        
                        <div className="space-y-1.5 mb-4">
                          <p className="flex items-start gap-2 text-[14px] text-slate-600 dark:text-slate-400">
                            <MapPin className="mt-0.5 w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
                            <span>{g.recipient_address} · {g.at_zones?.name ?? ""}</span>
                          </p>
                          {g.recipient_phone && (
                            <p className="flex items-center gap-2 text-[14px] text-slate-600 dark:text-slate-400">
                              <Phone className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" /> 
                              <span>{g.recipient_phone}</span>
                            </p>
                          )}
                        </div>

                        {g.is_cod && (
                          <div className="mt-auto mb-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5 border border-amber-100 dark:border-amber-500/20">
                            <p className="text-[14px] font-bold text-amber-800 dark:text-amber-500">
                              Recaudar: {formatCOP(g.cod_amount)}
                            </p>
                          </div>
                        )}

                        <div className="mt-auto pt-2 flex flex-col sm:flex-row gap-2">
                          {g.status === "zonificada" && (
                            <button 
                              disabled={busy} 
                              onClick={() => change(g.id, "en_ruta")}
                              className="w-full min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                            >
                              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                              <span>Iniciar ruta</span>
                            </button>
                          )}
                          
                          {g.status === "en_ruta" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => setModal({ guide: g, action: "entregada" })}
                                className="flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                                <span>Entregar</span>
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => setModal({ guide: g, action: "novedad" })}
                                className="w-full sm:w-[60px] min-h-[48px] rounded-xl flex items-center justify-center bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 shrink-0"
                              >
                                <TriangleAlert className="w-5 h-5" />
                              </button>
                            </>
                          )}
                          
                          {g.status === "novedad" && (
                            <div className="bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl p-3">
                              <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-snug">
                                Lleva el paquete de vuelta al CEDI para evaluación (intento {g.delivery_attempts}/2).
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
          )}
        </div>
      )}

      {/* Action Modal (Apple HIG Style Bottom Sheet/Alert) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white truncate pr-4">
                {modal.action === "entregada" ? "Confirmar entrega" : "Reportar novedad"}
              </h3>
              <button 
                onClick={() => setModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400">
                Guía: <span className="font-bold text-slate-900 dark:text-white">{modal.guide.guide_number}</span>
              </p>

              {modal.action === "entregada" && modal.guide.is_cod && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4 border border-amber-100 dark:border-amber-500/20">
                  <p className="text-[15px] font-bold text-amber-800 dark:text-amber-500 leading-snug">
                    Esta guía es contraentrega. Confirma el recaudo de {formatCOP(modal.guide.cod_amount)} (efectivo o digital).
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  {modal.action === "entregada" ? "Observación (opcional)" : "Motivo de la novedad"}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    modal.action === "entregada"
                      ? "Ej: recibido por el portero..."
                      : "Ej: destinatario ausente, dirección errada..."
                  }
                  className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl p-4 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  disabled={busy || (modal.action === "novedad" && !note.trim())}
                  onClick={() => change(modal.guide.id, modal.action, note)}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
