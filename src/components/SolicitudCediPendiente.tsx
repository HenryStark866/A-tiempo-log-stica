"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Eye, FileUp, LoaderCircle, TriangleAlert, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FACILITY_DOCS, FACILITY_DOC_LABELS } from "@/lib/constants";
import { signedFacilityDocUrl, uploadFacilityDoc } from "@/lib/facilityDocs";
import { formatDateTime } from "@/lib/utils";
import type { FacilityDocType, FacilityDocument, Profile } from "@/lib/types";

/**
 * Lo que ve quien pidió afiliar un CEDI mientras espera aprobación: nada de
 * la app —no hay CEDI todavía— salvo esto. Vive dentro del mismo bloque de
 * AppShell que ya mostraba "cuenta pendiente", solo que aquí sí hay algo que
 * hacer en vez de únicamente esperar.
 */
export function SolicitudCediPendiente({ profile }: { profile: Profile }) {
  const [docs, setDocs] = useState<FacilityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<FacilityDocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_facility_documents")
      .select("*")
      .eq("applicant_id", profile.id);
    setDocs((data as FacilityDocument[]) ?? []);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(docType: FacilityDocType, file: File) {
    setError(null);
    setBusy(docType);
    try {
      await uploadFacilityDoc(profile.id, docType, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el documento");
    } finally {
      setBusy(null);
    }
  }

  async function ver(path: string) {
    const url = await signedFacilityDocUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("No se pudo abrir el documento");
  }

  const porTipo = new Map(docs.map((d) => [d.doc_type, d]));
  const faltantes = FACILITY_DOCS.filter((d) => porTipo.get(d.value)?.status !== "aprobado");
  const todoSubido = docs.length === FACILITY_DOCS.length;

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 py-10 transition-colors duration-300">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <Warehouse className="mx-auto mb-3 size-10 text-[#ff812c]" />
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-white">
            Solicitud de {profile.business_name || "tu CEDI"}
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            {profile.proposed_city ? `${profile.proposed_city} · ` : ""}
            {todoSubido
              ? "Ya subiste todo. A Tiempo está revisando tu solicitud."
              : "Sube estos 5 documentos para que A Tiempo pueda revisar tu solicitud."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
            <p className="text-center text-[14px] font-medium text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="size-7 animate-spin text-[#ff812c]" />
          </div>
        ) : (
          <div className="space-y-3">
            {FACILITY_DOCS.map((doc) => {
              const actual = porTipo.get(doc.value);
              const subiendo = busy === doc.value;
              return (
                <div
                  key={doc.value}
                  className="rounded-2xl bg-[#FFFFFF] p-4 shadow-sm dark:bg-[#2C2C2E]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {FACILITY_DOC_LABELS[doc.value]}
                        </p>
                        {actual && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              actual.status === "aprobado"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : actual.status === "rechazado"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {actual.status === "aprobado"
                              ? "Aprobado"
                              : actual.status === "rechazado"
                                ? "Rechazado"
                                : "En revisión"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{doc.hint}</p>
                      {actual?.status === "rechazado" && actual.review_notes && (
                        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-rose-600 dark:text-rose-400">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                          <span>{actual.review_notes} — vuelve a subirlo corregido.</span>
                        </p>
                      )}
                      {actual?.status === "pendiente" && (
                        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                          <Clock className="size-4 shrink-0" /> Subido el {formatDateTime(actual.uploaded_at)}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {actual && (
                        <button
                          onClick={() => ver(actual.file_path)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[14px] font-medium text-slate-700 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200"
                        >
                          <Eye className="size-4" /> Ver
                        </button>
                      )}
                      <input
                        ref={(el) => {
                          inputs.current[doc.value] = el;
                        }}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(doc.value, f);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => inputs.current[doc.value]?.click()}
                        disabled={subiendo}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff812c] px-4 text-[14px] font-bold text-[#1C1C1E] active:scale-[0.98] disabled:opacity-60"
                      >
                        {subiendo ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <FileUp className="size-4" />
                        )}
                        {actual ? "Reemplazar" : "Subir"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && faltantes.length > 0 && docs.length === FACILITY_DOCS.length && (
          <p className="mt-4 text-center text-[13px] text-slate-500 dark:text-slate-400">
            Todo subido. A Tiempo revisa cada documento antes de aprobar la solicitud completa.
          </p>
        )}
      </div>
    </div>
  );
}
