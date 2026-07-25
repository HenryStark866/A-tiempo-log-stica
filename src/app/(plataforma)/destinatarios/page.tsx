"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Upload,
  Download,
  Search,
  Trash2,
  CircleCheck,
  TriangleAlert,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMyClient } from "@/components/useMyClient";
import {
  parseCsv,
  decodeCsvBytes,
  guessMapping,
  toRecipientPayload,
  RECIPIENT_FIELD_LABELS,
  REQUIRED_FIELDS,
  type CsvRow,
  type RecipientField,
} from "@/lib/csv";
import type { Recipient, SyncRecipientsResult } from "@/lib/types";

const CHUNK = 400; // filas por llamada, para no mandar un payload gigante

const PLANTILLA = [
  "nombre,telefono,direccion,complemento,ciudad,notas",
  '"María Restrepo",3001234567,"Cra 43 #10-25","apto 501 torre 2",Envigado,"Dejar en portería"',
  '"Juan Osorio",3109876543,"Cl 50 #38-14","barrio Castilla",Medellín,',
].join("\n");

export default function RecipientsPage() {
  // Autoaprovisiona el comercio si la cuenta todavía no lo tiene enlazado.
  const { clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [query, setQuery] = useState("");

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<RecipientField, string>>>({});

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SyncRecipientsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("at_recipients")
      .select("*, at_zones(name)")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("times_used", { ascending: false })
      .order("full_name")
      .limit(1000);
    setRecipients((data as Recipient[]) ?? []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      // Se decodifica desde bytes: Excel en español exporta ANSI, no UTF-8, y
      // leerlo como UTF-8 destruye tildes y ñ.
      const texto = decodeCsvBytes(reader.result as ArrayBuffer);
      const { headers: h, rows: r } = parseCsv(texto);
      if (h.length === 0 || r.length === 0) {
        setError("El archivo no tiene filas legibles. Revisa que sea un CSV con encabezados.");
        setHeaders([]);
        setRows([]);
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guessMapping(h));
    };
    reader.onerror = () => setError("No se pudo leer el archivo.");
    reader.readAsArrayBuffer(file);
  }

  const faltantes = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  // Cuántas filas quedarían fuera por no tener nombre o dirección.
  const filasValidas = useMemo(() => {
    if (faltantes.length > 0) return 0;
    const nameCol = mapping.full_name!;
    const addrCol = mapping.address!;
    return rows.filter((r) => r[nameCol]?.trim() && r[addrCol]?.trim()).length;
  }, [rows, mapping, faltantes.length]);

  async function sincronizar() {
    if (faltantes.length > 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const supabase = createClient();
    const payload = toRecipientPayload(rows, mapping);
    const total = payload.length;
    const acumulado: SyncRecipientsResult = { creados: 0, actualizados: 0, omitidos: 0 };

    for (let i = 0; i < total; i += CHUNK) {
      const lote = payload.slice(i, i + CHUNK);
      setProgress({ done: i, total });
      const { data, error } = await supabase.rpc("at_sync_recipients", { p_rows: lote });
      if (error) {
        setError(error.message);
        setBusy(false);
        setProgress(null);
        load();
        return;
      }
      const r = data as SyncRecipientsResult;
      acumulado.creados += r.creados;
      acumulado.actualizados += r.actualizados;
      acumulado.omitidos += r.omitidos;
    }

    setProgress(null);
    setBusy(false);
    setResult(acumulado);
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  async function eliminar(id: string) {
    const supabase = createClient();
    // Baja lógica: si el destinatario ya tiene guías, conviene conservar el histórico.
    const { error } = await supabase.from("at_recipients").update({ active: false }).eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  function descargarPlantilla() {
    const blob = new Blob(["﻿" + PLANTILLA], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-destinatarios-atiempo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtrados = (recipients ?? []).filter((r) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return (
      r.full_name.toLowerCase().includes(s) ||
      r.address.toLowerCase().includes(s) ||
      (r.phone ?? "").includes(s) ||
      r.city.toLowerCase().includes(s)
    );
  });

  if (cargandoComercio) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[15px]">Preparando tu comercio…</p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Mis destinatarios</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Sincroniza tu base de compradores para crear guías sin volver a digitar los datos
          </p>
        </div>
        <button
          onClick={descargarPlantilla}
          className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 min-h-[48px] text-[15px] font-semibold text-slate-700 dark:text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
        >
          <Download className="w-4 h-4" /> Descargar plantilla
        </button>
      </div>

      {/* Importador */}
      <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm p-5 sm:p-6 space-y-5 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#ff812c]/10 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-[#ff812c]" />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Sincronizar base de datos</h2>
            <p className="text-[14px] text-slate-500 dark:text-slate-400">
              Sube un CSV exportado de tu tienda. Los que ya existan se actualizan, no se duplican.
            </p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onPickFile}
          className="block w-full text-[15px] text-slate-600 dark:text-slate-400
            file:mr-4 file:rounded-xl file:border-0 file:bg-[#ff812c] file:px-5 file:py-3
            file:text-[15px] file:font-bold file:text-[#1C1C1E] hover:file:bg-[#ff812c]/90 file:cursor-pointer"
        />

        {headers.length > 0 && (
          <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-5">
            <p className="text-[14px] text-slate-600 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white">{fileName}</strong> · {rows.length} fila(s)
              detectada(s). Confirma a qué corresponde cada columna:
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[]).map((field) => {
                const requerido = REQUIRED_FIELDS.includes(field);
                return (
                  <div key={field} className="flex items-center gap-3 bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-3 min-h-[52px]">
                    <label className="flex-1 text-[14px] text-slate-600 dark:text-slate-400">
                      {RECIPIENT_FIELD_LABELS[field]}
                      {requerido && <span className="text-[#ff812c] font-bold"> *</span>}
                    </label>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))
                      }
                      className="flex-1 min-w-0 bg-transparent text-[15px] py-2 text-slate-900 dark:text-white focus:outline-none"
                    >
                      <option value="">— sin usar —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {faltantes.length > 0 ? (
              <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4">
                <TriangleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[14px] text-amber-700 dark:text-amber-400">
                  Falta indicar: <strong>{faltantes.map((f) => RECIPIENT_FIELD_LABELS[f]).join(" y ")}</strong>.
                  Sin esos datos no se puede crear una guía.
                </p>
              </div>
            ) : (
              <p className="text-[14px] text-slate-500 dark:text-slate-400">
                Se sincronizarán <strong className="text-slate-900 dark:text-white">{filasValidas}</strong> destinatario(s).
                {rows.length - filasValidas > 0 && ` ${rows.length - filasValidas} fila(s) se omitirán por venir sin nombre o sin dirección.`}
              </p>
            )}

            {/* Vista previa */}
            {faltantes.length === 0 && (
              <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                <table className="w-full text-left text-[14px] min-w-[560px]">
                  <thead className="bg-[#F2F2F7] dark:bg-[#1C1C1E]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Nombre</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Teléfono</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Dirección</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Ciudad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 text-slate-900 dark:text-white">{mapping.full_name ? r[mapping.full_name] : "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{mapping.phone ? r[mapping.phone] || "—" : "—"}</td>
                        {/* Muestra la dirección ya fusionada con el complemento: es lo que se va a guardar. */}
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          {[mapping.address ? r[mapping.address] : "", mapping.address_2 ? r[mapping.address_2] : ""]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{mapping.city ? r[mapping.city] || "Medellín" : "Medellín"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="px-4 py-2 text-[13px] text-slate-400 dark:text-slate-500">
                    … y {rows.length - 5} fila(s) más
                  </p>
                )}
              </div>
            )}

            <button
              onClick={sincronizar}
              disabled={busy || faltantes.length > 0 || filasValidas === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff812c] hover:bg-[#ff812c]/90 px-6 min-h-[52px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              <span>
                {busy && progress
                  ? `Sincronizando ${progress.done}/${progress.total}…`
                  : "Sincronizar destinatarios"}
              </span>
            </button>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-4">
            <CircleCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[14px] text-emerald-700 dark:text-emerald-400">
              Listo: <strong>{result.creados}</strong> nuevo(s), <strong>{result.actualizados}</strong> actualizado(s)
              {result.omitidos > 0 && <>, <strong>{result.omitidos}</strong> omitido(s) por datos incompletos</>}.
            </p>
          </div>
        )}

        {(error || errorComercio) && (
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
            <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{error ?? errorComercio}</p>
          </div>
        )}
      </section>

      {/* Listado */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-slate-800 dark:text-white px-1">
            Guardados{" "}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              ({recipients?.length ?? "…"})
            </span>
          </h2>
          <div className="relative sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, dirección o teléfono…"
              className="w-full min-h-[48px] pl-11 pr-4 bg-[#FFFFFF] dark:bg-[#2C2C2E] border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-[#ff812c] transition-all"
            />
          </div>
        </div>

        <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-colors duration-300">
          {recipients === null ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[15px]">Cargando destinatarios…</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[16px] text-slate-500 dark:text-slate-400">
                {recipients.length === 0
                  ? "Todavía no has sincronizado destinatarios"
                  : "Ningún destinatario coincide con la búsqueda"}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtrados.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-slate-900 dark:text-white truncate">
                      {r.full_name}
                    </p>
                    <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {r.address} · {r.city}
                      {r.phone && ` · ${r.phone}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {r.at_zones?.name ? (
                        <span className="inline-flex items-center rounded-full bg-[#ff812c]/10 px-2.5 py-0.5 text-[12px] font-medium text-[#ff812c]">
                          {r.at_zones.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                          Fuera de cobertura
                        </span>
                      )}
                      {r.times_used > 0 && (
                        <span className="text-[12px] text-slate-400 dark:text-slate-500">
                          {r.times_used} guía(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => eliminar(r.id)}
                    title="Quitar de mis destinatarios"
                    className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
