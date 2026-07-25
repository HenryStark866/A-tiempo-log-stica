"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Upload,
  Download,
  Search,
  Trash2,
  Pencil,
  Plus,
  CircleCheck,
  TriangleAlert,
  Loader2,
  X,
  Phone,
  MapPin,
  ChevronDown,
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
import { resolveZone } from "@/lib/zones";
import type { Recipient, SyncRecipientsResult, Zone } from "@/lib/types";

const CHUNK = 400;

const PLANTILLA = [
  "nombre,telefono,direccion,complemento,ciudad,notas",
  '"María Restrepo",3001234567,"Cra 43 #10-25","apto 501 torre 2",Envigado,"Dejar en portería"',
  '"Juan Osorio",3109876543,"Cl 50 #38-14","barrio Castilla",Medellín,',
].join("\n");

const FORM_VACIO = {
  full_name: "",
  phone: "",
  address: "",
  city: "Medellín",
  notes: "",
};

export default function RecipientsPage() {
  const { clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [query, setQuery] = useState("");

  // Alta/edición manual
  const [editing, setEditing] = useState<Recipient | "nuevo" | null>(null);
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Recipient | null>(null);

  // Importación (colapsada: es una acción ocasional, no el centro de la pantalla)
  const [importAbierto, setImportAbierto] = useState(false);
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
      .order("full_name")
      .limit(1000);
    setRecipients((data as Recipient[]) ?? []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, []);

  // ── Alta y edición manual ────────────────────────────────────────────
  function abrirNuevo() {
    setEditing("nuevo");
    setForm({ ...FORM_VACIO });
    setFormError(null);
  }

  function abrirEdicion(r: Recipient) {
    setEditing(r);
    setForm({
      full_name: r.full_name,
      phone: r.phone ?? "",
      address: r.address,
      city: r.city,
      notes: r.notes ?? "",
    });
    setFormError(null);
  }

  const zonaDelForm = useMemo(
    () => resolveZone(zones, form.city, form.address),
    [zones, form.city, form.address]
  );

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setGuardando(true);
    setFormError(null);
    const supabase = createClient();

    const payload = {
      client_id: clientId,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim(),
      city: form.city.trim() || "Medellín",
      notes: form.notes.trim() || null,
      zone_id: zonaDelForm.zone?.id ?? null,
    };

    const { error } =
      editing === "nuevo"
        ? await supabase.from("at_recipients").insert(payload)
        : await supabase.from("at_recipients").update(payload).eq("id", (editing as Recipient).id);

    setGuardando(false);
    if (error) {
      // El índice único (comercio + nombre + dirección) evita duplicados.
      setFormError(
        error.code === "23505"
          ? "Ya tienes un destinatario con ese nombre y esa dirección."
          : error.message
      );
      return;
    }
    setEditing(null);
    load();
  }

  async function confirmarBorrado() {
    if (!borrando) return;
    const supabase = createClient();
    const { error } = await supabase.from("at_recipients").delete().eq("id", borrando.id);
    setBorrando(null);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  // ── Importación ──────────────────────────────────────────────────────
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      // Se decodifica desde bytes: Excel en español exporta ANSI, no UTF-8.
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
      // Se pasan las filas para poder detectar el teléfono por contenido.
      setMapping(guessMapping(h, r));
    };
    reader.onerror = () => setError("No se pudo leer el archivo.");
    reader.readAsArrayBuffer(file);
  }

  const faltantes = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  const filasValidas = useMemo(() => {
    if (faltantes.length > 0) return 0;
    const nameCol = mapping.full_name!;
    const addrCol = mapping.address!;
    return rows.filter((r) => r[nameCol]?.trim() && r[addrCol]?.trim()).length;
  }, [rows, mapping, faltantes.length]);

  function direccionPreview(r: CsvRow): string {
    return [mapping.address ? r[mapping.address] : "", mapping.address_2 ? r[mapping.address_2] : ""]
      .filter(Boolean)
      .join(" ");
  }

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
      setProgress({ done: i, total });
      const { data, error } = await supabase.rpc("at_sync_recipients", {
        p_rows: payload.slice(i, i + CHUNK),
      });
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

  const sinTelefono = (recipients ?? []).filter((r) => !r.phone).length;

  if (cargandoComercio) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[15px]">Preparando tu comercio…</p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-5 font-sans">
      {/* Encabezado con las dos acciones reales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Mis clientes
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {recipients === null
              ? "Cargando…"
              : `${recipients.length} guardado(s) · se autocompletan al crear una guía`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setImportAbierto((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 min-h-[48px] text-[15px] font-semibold text-slate-700 dark:text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
          >
            <Upload className="w-4 h-4" /> Importar
            <ChevronDown className={`w-4 h-4 transition-transform ${importAbierto ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={abrirNuevo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff812c] hover:bg-[#ff812c]/90 px-5 min-h-[48px] text-[15px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </div>

      {(error || errorComercio) && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
          <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{error ?? errorComercio}</p>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 p-4">
          <CircleCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[14px] text-emerald-700 dark:text-emerald-400">
            <strong>{result.creados}</strong> nuevo(s), <strong>{result.actualizados}</strong> actualizado(s)
            {result.omitidos > 0 && <>, <strong>{result.omitidos}</strong> omitido(s) por datos incompletos</>}.
          </p>
        </div>
      )}

      {sinTelefono > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4">
          <TriangleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[14px] text-amber-700 dark:text-amber-400">
            <strong>{sinTelefono}</strong> destinatario(s) sin teléfono. Sin número el mensajero no
            puede avisar que llegó, y la entrega se cae más seguido.
          </p>
        </div>
      )}

      {/* Importador: colapsado por defecto */}
      {importAbierto && (
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm p-5 space-y-4 transition-colors duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPickFile}
              className="block flex-1 text-[15px] text-slate-600 dark:text-slate-400
                file:mr-4 file:rounded-xl file:border-0 file:bg-[#ff812c] file:px-5 file:py-3
                file:text-[15px] file:font-bold file:text-[#1C1C1E] hover:file:bg-[#ff812c]/90 file:cursor-pointer"
            />
            <button
              onClick={descargarPlantilla}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 min-h-[44px] text-[14px] font-semibold text-slate-600 dark:text-slate-300 active:scale-[0.98] transition-transform"
            >
              <Download className="w-4 h-4" /> Plantilla
            </button>
          </div>

          {headers.length > 0 && (
            <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
              <p className="text-[14px] text-slate-600 dark:text-slate-400">
                <strong className="text-slate-900 dark:text-white">{fileName}</strong> · {rows.length} fila(s).
                Confirma a qué corresponde cada columna:
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
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
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

              {!mapping.phone && (
                <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4">
                  <Phone className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[14px] text-amber-700 dark:text-amber-400">
                    No encontramos la columna del teléfono. Elígela arriba: sin número el mensajero
                    no puede avisar que llegó.
                  </p>
                </div>
              )}

              {faltantes.length > 0 ? (
                <div className="flex items-start gap-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <TriangleAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[14px] text-rose-700 dark:text-rose-400">
                    Falta indicar: <strong>{faltantes.map((f) => RECIPIENT_FIELD_LABELS[f]).join(" y ")}</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Se sincronizarán <strong className="text-slate-900 dark:text-white">{filasValidas}</strong> destinatario(s).
                    {rows.length - filasValidas > 0 &&
                      ` ${rows.length - filasValidas} fila(s) se omitirán por venir sin nombre o sin dirección.`}
                  </p>

                  <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-left text-[14px] min-w-[620px]">
                      <thead className="bg-[#F2F2F7] dark:bg-[#1C1C1E]">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Nombre</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Teléfono</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Dirección completa</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Ciudad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2.5 text-slate-900 dark:text-white">{mapping.full_name ? r[mapping.full_name] : "—"}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{mapping.phone ? r[mapping.phone] || "—" : "—"}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{direccionPreview(r) || "—"}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{mapping.city ? r[mapping.city] || "Medellín" : "Medellín"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 5 && (
                      <p className="px-4 py-2 text-[13px] text-slate-400 dark:text-slate-500">… y {rows.length - 5} fila(s) más</p>
                    )}
                  </div>

                  <button
                    onClick={sincronizar}
                    disabled={busy || filasValidas === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff812c] hover:bg-[#ff812c]/90 px-6 min-h-[52px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>{busy && progress ? `Sincronizando ${progress.done}/${progress.total}…` : "Sincronizar"}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, dirección o teléfono…"
          className="w-full min-h-[48px] pl-11 pr-4 bg-[#FFFFFF] dark:bg-[#2C2C2E] border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-[#ff812c] transition-all"
        />
      </div>

      {/* Listado con información completa */}
      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-colors duration-300">
        {recipients === null ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando…</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">
              {recipients.length === 0
                ? "Todavía no tienes clientes guardados"
                : "Ninguno coincide con la búsqueda"}
            </p>
            {recipients.length === 0 && (
              <button
                onClick={abrirNuevo}
                className="mt-2 inline-flex items-center gap-2 text-[15px] font-semibold text-[#ff812c] active:opacity-70"
              >
                <Plus className="w-4 h-4" /> Agregar el primero
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtrados.map((r) => {
              const zr = resolveZone(zones, r.city, r.address);
              const zonaNombre = r.at_zones?.name ?? zr.zone?.name ?? null;
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 sm:px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[16px] font-semibold text-slate-900 dark:text-white truncate">
                      {r.full_name}
                    </p>

                    <p className="flex items-start gap-1.5 text-[14px] text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-1 text-slate-400" />
                      <span>
                        {r.address}
                        <span className="text-slate-400 dark:text-slate-500"> · {r.city}</span>
                      </span>
                    </p>

                    <p className="flex items-center gap-1.5 text-[14px]">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} className="text-slate-600 dark:text-slate-300 hover:text-[#ff812c]">
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Sin teléfono</span>
                      )}
                    </p>

                    {r.notes && (
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 italic">{r.notes}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {zonaNombre ? (
                        <span className="inline-flex items-center rounded-full bg-[#ff812c]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#ff812c]">
                          {zonaNombre}
                        </span>
                      ) : zr.status === "por_confirmar" ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-[12px] font-medium text-slate-500 dark:text-slate-300">
                          Zona por confirmar
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-400">
                          Fuera de cobertura
                        </span>
                      )}
                      {r.times_used > 0 && (
                        <span className="text-[12px] text-slate-400 dark:text-slate-500">
                          {r.times_used} guía(s)
                        </span>
                      )}
                      {r.external_id && (
                        <span className="text-[12px] text-slate-400 dark:text-slate-500">
                          ID {r.external_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => abrirEdicion(r)}
                      title="Editar"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#ff812c] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setBorrando(r)}
                      title="Borrar"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal alta / edición */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">
                {editing === "nuevo" ? "Nuevo cliente" : `Editar ${(editing as Recipient).full_name}`}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={guardar} className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                <Campo label="Nombre" requerido>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Nombre de quien recibe"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </Campo>
                <Campo label="Teléfono">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="3001234567"
                    inputMode="tel"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </Campo>
                <Campo label="Dirección" requerido>
                  <input
                    required
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Cra 43 #10-25 apto 501 barrio Manila"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </Campo>
                <Campo label="Ciudad">
                  <input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </Campo>
                <Campo label="Notas" ultimo>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Dejar en portería"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </Campo>
              </div>

              {/* Zona resuelta en vivo, con su tarifa */}
              <div className="rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 py-3 shadow-sm">
                {zonaDelForm.zone ? (
                  <p className="text-[14px]">
                    <span className="font-semibold text-[#ff812c]">{zonaDelForm.zone.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {" "}· tarifa {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(zonaDelForm.zone.delivery_rate)}
                    </span>
                  </p>
                ) : zonaDelForm.status === "por_confirmar" ? (
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Estamos en tu ciudad, pero no reconocimos el sector. El CEDI confirma la zona al
                    recibir el paquete. Si agregas el barrio a la dirección la detectamos sola.
                  </p>
                ) : (
                  <p className="text-[14px] text-amber-700 dark:text-amber-400">
                    Esa ciudad está fuera de nuestra cobertura actual.
                  </p>
                )}
              </div>

              {formError && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{formError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 flex items-center justify-center bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-[2] flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {guardando && <Loader2 className="w-5 h-5 animate-spin" />}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación de borrado */}
      {borrando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setBorrando(null)}
        >
          <div
            className="w-full max-w-sm bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="mx-auto mb-3 w-9 h-9 text-rose-500" />
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
              ¿Borrar a {borrando.full_name}?
            </h3>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
              Se quita de tu lista. Las guías ya creadas a su nombre no se tocan.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setBorrando(null)}
                className="flex-1 min-h-[48px] rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] font-semibold text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBorrado}
                className="flex-1 min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-white active:scale-[0.98] transition-transform"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  label,
  children,
  requerido,
  ultimo,
}: {
  label: string;
  children: React.ReactNode;
  requerido?: boolean;
  ultimo?: boolean;
}) {
  return (
    <div
      className={`flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors ${
        ultimo ? "" : "border-b border-gray-100 dark:border-gray-800"
      }`}
    >
      <label className="w-[95px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">
        {label}
        {requerido && <span className="text-[#ff812c]"> *</span>}
      </label>
      {children}
    </div>
  );
}
