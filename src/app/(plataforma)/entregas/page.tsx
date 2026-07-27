"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, MapPin, Navigation, Phone, PlayCircle, TriangleAlert, Loader2, Package, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { StatusBadge } from "@/components/StatusBadge";
import { PositionReporter } from "@/components/PositionReporter";
import { formatCOP } from "@/lib/utils";
import { uploadDeliveryEvidence } from "@/lib/evidence";
import {
  NAV_HANDOFF_ENABLED,
  NAV_PROVIDER_LABELS,
  buildNavUrl,
  getNavProvider,
  orderRoute,
  saveNavProvider,
  type NavProvider,
} from "@/lib/nav";
import type { Guide } from "@/lib/types";

export default function MyRoutePage() {
  const profile = useProfile();
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [modal, setModal] = useState<{ guide: Guide; action: "entregada" | "novedad" } | null>(null);
  const [note, setNote] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [deliveryCode, setDeliveryCode] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [navProvider, setNavProvider] = useState<NavProvider | null>(null);

  function closeModal() {
    setModal(null);
    setNote("");
    setSignatureName("");
    setDeliveryCode("");
    setEvidenceFile(null);
  }

  useEffect(() => {
    setNavProvider(getNavProvider());
  }, []);

  function chooseProvider(p: NavProvider) {
    saveNavProvider(p);
    setNavProvider(p);
  }

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

  const zonificadas = orderRoute((guides ?? []).filter((g) => g.status === "zonificada"));
  const enRuta = orderRoute((guides ?? []).filter((g) => g.status === "en_ruta"));
  const novedades = (guides ?? []).filter((g) => g.status === "novedad");

  // Abre la pestaña de forma síncrona (dentro del gesto del usuario) y le pone
  // destino solo si el cambio de estado en el servidor fue exitoso.
  function openNavWindow(): Window | null {
    if (!NAV_HANDOFF_ENABLED || !navProvider) return null;
    return window.open("", "_blank");
  }

  function navigateTo(w: Window | null, g: Guide | null) {
    if (!w) return;
    if (g && navProvider) w.location.href = buildNavUrl(navProvider, g.recipient_address, g.recipient_city);
    else w.close();
  }

  async function startRoute(g: Guide) {
    const w = openNavWindow();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: g.id,
      p_new_status: "en_ruta",
      p_note: null,
    });
    setBusy(false);
    if (error) {
      navigateTo(w, null);
      setMsg(error.message);
    } else {
      navigateTo(w, g);
    }
    load();
  }

  async function startFullRoute() {
    if (zonificadas.length === 0) return;
    const w = openNavWindow();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    let failed = false;
    for (const g of zonificadas) {
      const { error } = await supabase.rpc("at_change_guide_status", {
        p_guide_id: g.id,
        p_new_status: "en_ruta",
        p_note: null,
      });
      if (error) {
        setMsg(error.message);
        failed = true;
        break;
      }
    }
    setBusy(false);
    navigateTo(w, failed ? null : zonificadas[0]);
    load();
  }

  async function confirmModalAction() {
    if (!modal) return;

    if (modal.action === "novedad") {
      setBusy(true);
      setMsg(null);
      const supabase = createClient();
      const { error } = await supabase.rpc("at_change_guide_status", {
        p_guide_id: modal.guide.id,
        p_new_status: "novedad",
        p_note: note || null,
      });
      setBusy(false);
      if (error) setMsg(error.message);
      closeModal();
      load();
      return;
    }

    // Entrega: sube evidencia primero (si hay foto) y confirma con el RPC dedicado,
    // que exige la foto cuando la guía es contraentrega.
    const next = enRuta.filter((x) => x.id !== modal.guide.id)[0] ?? null;
    const w = next ? openNavWindow() : null;
    setBusy(true);
    setMsg(null);
    try {
      let evidenceUrl: string | null = null;
      if (evidenceFile) {
        setUploading(true);
        evidenceUrl = await uploadDeliveryEvidence(modal.guide.id, evidenceFile);
        setUploading(false);
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("at_confirm_delivery", {
        p_guide_id: modal.guide.id,
        p_evidence_url: evidenceUrl,
        p_signature_name: signatureName || null,
        p_note: note || null,
        p_delivery_code: deliveryCode || null,
      });
      if (error) {
        navigateTo(w, null);
        setMsg(error.message);
      } else {
        navigateTo(w, next);
        closeModal();
      }
    } catch (err) {
      navigateTo(w, null);
      setMsg(err instanceof Error ? err.message : "No se pudo subir la evidencia");
    } finally {
      setUploading(false);
      setBusy(false);
      load();
    }
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Mi ruta</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Fase 4: gestión de ruta en última milla — tu carga digital del día
        </p>
      </div>

      {/* Ubicación en vivo para que el comercio pueda seguir su paquete */}
      <PositionReporter />

      {NAV_HANDOFF_ENABLED && (
        <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-4 sm:p-5 shadow-sm transition-colors duration-300 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-slate-900 dark:text-white">Navegador preferido</p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
              {navProvider
                ? `Cada parada se abrirá automáticamente en ${NAV_PROVIDER_LABELS[navProvider]}.`
                : "Elige tu app de mapas para guiarte parada a parada."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl p-1">
              {(Object.keys(NAV_PROVIDER_LABELS) as NavProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => chooseProvider(p)}
                  className={`min-h-[40px] px-4 rounded-lg text-[14px] font-semibold transition-all active:scale-95 ${
                    navProvider === p
                      ? "bg-[#ff812c] text-[#1C1C1E] shadow-sm"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {NAV_PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
            {zonificadas.length > 0 && (
              <button
                disabled={busy}
                onClick={startFullRoute}
                className="min-h-[48px] px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
                <span>Iniciar ruta ({zonificadas.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

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
                    {sec.list.map((g, i) => (
                      <div key={g.id} className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 shadow-sm transition-colors duration-300 flex flex-col">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {NAV_HANDOFF_ENABLED && g.status === "en_ruta" && (
                              <span className="shrink-0 w-7 h-7 rounded-full bg-[#ff812c]/10 text-[#ff812c] text-[13px] font-bold flex items-center justify-center">
                                {i + 1}
                              </span>
                            )}
                            <Link href={`/guias/${g.id}`} className="text-[17px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity truncate">
                              {g.guide_number}
                            </Link>
                          </div>
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
                              onClick={() => startRoute(g)}
                              className="w-full min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
                            >
                              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                              <span>Iniciar ruta</span>
                            </button>
                          )}

                          {g.status === "en_ruta" && (
                            <>
                              {NAV_HANDOFF_ENABLED && navProvider && (
                                <a
                                  href={buildNavUrl(navProvider, g.recipient_address, g.recipient_city)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-900 dark:text-white hover:opacity-90 active:scale-[0.98] transition-all"
                                >
                                  <Navigation className="w-5 h-5 text-[#ff812c]" />
                                  <span>Navegar</span>
                                </a>
                              )}
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
                onClick={closeModal}
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

              {modal.action === "entregada" && (
                <div className="space-y-4">
                  {/* Primero el código: es lo que prueba la entrega, y sin él
                      el servidor rechaza. Va arriba para que el mensajero lo
                      pida antes de soltar el paquete, no después. */}
                  <div className="space-y-2">
                    <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      Código del comprador <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={deliveryCode}
                      onChange={(e) =>
                        setDeliveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000000"
                      className="w-full min-h-[60px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-center text-[28px] font-bold tracking-[0.3em] text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none transition-all"
                    />
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      Pídele al comprador los 6 dígitos que le llegaron por mensaje.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      Foto de evidencia {modal.guide.is_cod && <span className="text-rose-500">*</span>}
                    </label>
                    <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-2xl bg-[#F2F2F7] dark:bg-[#1C1C1E] cursor-pointer active:opacity-80 transition-opacity">
                      <Camera className="w-5 h-5 text-[#ff812c] shrink-0" />
                      <span className="text-[15px] text-slate-700 dark:text-slate-300 truncate">
                        {evidenceFile ? evidenceFile.name : "Tomar o adjuntar foto del paquete entregado"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      Nombre de quien recibe (opcional)
                    </label>
                    <input
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      placeholder="Ej: Carlos Restrepo (portero)"
                      className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
                    />
                  </div>
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
                  onClick={closeModal}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  disabled={
                    busy ||
                    (modal.action === "novedad" && !note.trim()) ||
                    (modal.action === "entregada" && modal.guide.is_cod && !evidenceFile)
                  }
                  onClick={confirmModalAction}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : uploading ? "Subiendo…" : "Confirmar"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
