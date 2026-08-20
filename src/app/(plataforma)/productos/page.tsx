"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tag,
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
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMyClient } from "@/components/useMyClient";
import { useProfile } from "@/components/ProfileContext";
import {
  leerTabla,
  FORMATOS_ACEPTADOS,
  FORMATOS_LEGIBLES,
  guessProductMapping,
  toProductPayload,
  PRODUCT_FIELD_LABELS,
  PRODUCT_REQUIRED_FIELDS,
  type CsvRow,
  type ProductField,
} from "@/lib/csv";
import { formatCOP, cn, normalizarBusqueda } from "@/lib/utils";
import type { Product, SyncRecipientsResult } from "@/lib/types";

const CHUNK = 400;

const PLANTILLA = [
  "producto,sku,precio,descripcion",
  '"Vestido flores","VF-001","$ 89.900","Talla S, algodón"',
  '"Bolso cuero","BC-014","145000","Cuero natural, negro"',
].join("\n");

const FORM_VACIO = { name: "", sku: "", price: "", description: "" };

export default function ProductsPage() {
  const { clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();
  const fileRef = useRef<HTMLInputElement>(null);
  // Subir el catálogo completo por archivo es decisión del dueño del comercio,
  // no de quien trabaja para él: reemplaza de golpe lo que ya había. La base
  // ya lo bloquea (at_sync_products exige rol cliente), pero sin esconder
  // aquí el botón el asesor llegaba hasta el final —elegía el archivo, mapeó
  // las columnas— para toparse con un error genérico al sincronizar. Crear
  // productos uno por uno sí es suyo: ver el botón «Nuevo» más abajo.
  const esAsesor = useProfile().role === "asesor";

  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState("");

  /**
   * Los que se acaban de crear en esta sesión, del más nuevo al más viejo.
   *
   * La lista viene ordenada por nombre, así que un producto nuevo caía en
   * cualquier parte de una lista de cientos: se guardaba bien, pero no se veía
   * nada y parecía que no había pasado. Estos suben al principio y quedan
   * marcados hasta que se recargue la pantalla.
   */
  const [recienAgregados, setRecienAgregados] = useState<string[]>([]);
  const listaRef = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState<Product | "nuevo" | null>(null);
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Product | null>(null);

  const [importAbierto, setImportAbierto] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ProductField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncRecipientsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("at_products")
      .select("*")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("name")
      .limit(2000);
    setProducts((data as Product[]) ?? []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function abrirNuevo() {
    setEditing("nuevo");
    setForm({ ...FORM_VACIO });
    setFormError(null);
  }

  function abrirEdicion(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      price: String(p.price ?? 0),
      description: p.description ?? "",
    });
    setFormError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setGuardando(true);
    setFormError(null);
    const supabase = createClient();

    const payload = {
      client_id: clientId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      price: Number(form.price.replace(/[^\d.]/g, "")) || 0,
      description: form.description.trim() || null,
    };

    const { data, error } =
      editing === "nuevo"
        ? await supabase.from("at_products").insert(payload).select("id").single()
        : await supabase
            .from("at_products")
            .update(payload)
            .eq("id", (editing as Product).id)
            .select("id")
            .single();

    setGuardando(false);
    if (error) {
      setFormError(
        error.code === "23505"
          ? "Ya tienes un producto con ese SKU o ese nombre."
          : error.message
      );
      return;
    }

    const esNuevo = editing === "nuevo";
    setEditing(null);
    await load();

    if (esNuevo && data?.id) {
      setRecienAgregados((r) => [data.id, ...r.filter((x) => x !== data.id)]);
      // Una búsqueda activa puede estar escondiendo justo lo que se acabó de
      // crear, y entonces el trabajo parece haberse perdido.
      setQuery("");
      // El teclado y el modal dejaron la página a media altura: se sube a la
      // lista para que lo nuevo quede a la vista sin tener que buscarlo.
      requestAnimationFrame(() =>
        listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }

  async function confirmarBorrado() {
    if (!borrando) return;
    const supabase = createClient();
    const { error } = await supabase.from("at_products").delete().eq("id", borrando.id);
    setBorrando(null);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  // `leerTabla` decide el formato por el CONTENIDO del archivo —no por su
  // extensión— y devuelve siempre lo mismo: encabezados y filas. Lo que lanza
  // ya viene redactado para la persona, así que se pinta tal cual.
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const { headers: h, rows: r } = await leerTabla(file);
      if (h.length === 0 || r.length === 0) {
        setError("El archivo no tiene filas legibles. Revisa que la primera fila sean los encabezados.");
        setHeaders([]);
        setRows([]);
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guessProductMapping(h));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      setHeaders([]);
      setRows([]);
    }
  }

  const faltantes = PRODUCT_REQUIRED_FIELDS.filter((f) => !mapping[f]);

  const filasValidas = useMemo(() => {
    if (faltantes.length > 0) return 0;
    const c = mapping.name!;
    return rows.filter((r) => r[c]?.trim()).length;
  }, [rows, mapping, faltantes.length]);

  async function sincronizar() {
    if (faltantes.length > 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const supabase = createClient();
    const payload = toProductPayload(rows, mapping);
    const acumulado: SyncRecipientsResult = { creados: 0, actualizados: 0, omitidos: 0 };

    for (let i = 0; i < payload.length; i += CHUNK) {
      const { data, error } = await supabase.rpc("at_sync_products", {
        p_rows: payload.slice(i, i + CHUNK),
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        load();
        return;
      }
      const r = data as SyncRecipientsResult;
      acumulado.creados += r.creados;
      acumulado.actualizados += r.actualizados;
      acumulado.omitidos += r.omitidos;
    }

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
    a.download = "plantilla-productos-yam.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtrados = useMemo(() => {
    const s = normalizarBusqueda(query.trim());
    const base = (products ?? []).filter((p) => {
      if (!s) return true;
      return (
        normalizarBusqueda(p.name).includes(s) ||
        normalizarBusqueda(p.sku ?? "").includes(s) ||
        normalizarBusqueda(p.description ?? "").includes(s)
      );
    });
    if (recienAgregados.length === 0) return base;

    // Los recién creados primero, en el orden en que se crearon. El resto
    // conserva el orden alfabético que trae la consulta.
    const posicion = (id: string) => {
      const i = recienAgregados.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...base].sort((a, b) => posicion(a.id) - posicion(b.id));
  }, [products, query, recienAgregados]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Productos</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {products === null
              ? "Cargando…"
              : `${products.length} producto(s) · su precio prellena el valor a recaudar`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!esAsesor && (
            <button
              onClick={() => setImportAbierto((v) => !v)}
              className="inline-flex items-center justify-center gap-2 rounded-xl atl-superficie px-4 min-h-[48px] text-[15px] font-semibold text-slate-700 dark:text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
            >
              <Upload className="w-4 h-4" /> Importar
              <ChevronDown className={`w-4 h-4 transition-transform ${importAbierto ? "rotate-180" : ""}`} />
            </button>
          )}
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
            {result.omitidos > 0 && <>, <strong>{result.omitidos}</strong> omitido(s) por venir sin nombre</>}.
          </p>
        </div>
      )}

      {importAbierto && !esAsesor && (
        <section className="atl-superficie rounded-3xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept={FORMATOS_ACEPTADOS}
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

          {/* Decir qué se acepta ahorra el viaje de elegir un archivo para que
              lo rechacen. El texto sale de la misma constante que alimenta el
              `accept`, así que no pueden decir cosas distintas. */}
          <p className="-mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            {FORMATOS_LEGIBLES}. La primera fila tiene que ser la de los encabezados.
          </p>

          {headers.length > 0 && (
            <div className="space-y-4 border-t border-slate-900/[0.06] dark:border-white/[0.08] pt-4">
              <p className="text-[14px] text-slate-600 dark:text-slate-400">
                <strong className="text-slate-900 dark:text-white">{fileName}</strong> · {rows.length} fila(s).
                Las columnas que no asignes se guardan igual, no se pierde nada.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(PRODUCT_FIELD_LABELS) as ProductField[]).map((field) => (
                  <div key={field} className="flex items-center gap-3 bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-3 min-h-[52px]">
                    <label className="flex-1 text-[14px] text-slate-600 dark:text-slate-400">
                      {PRODUCT_FIELD_LABELS[field]}
                      {PRODUCT_REQUIRED_FIELDS.includes(field) && <span className="text-[#ff812c] font-bold"> *</span>}
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
                ))}
              </div>

              {faltantes.length > 0 ? (
                <div className="flex items-start gap-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <TriangleAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[14px] text-rose-700 dark:text-rose-400">
                    Falta indicar el <strong>nombre del producto</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Se sincronizarán <strong className="text-slate-900 dark:text-white">{filasValidas}</strong> producto(s).
                  </p>
                  <button
                    onClick={sincronizar}
                    disabled={busy || filasValidas === 0}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff812c] hover:bg-[#ff812c]/90 px-6 min-h-[52px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>Sincronizar</span>
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, SKU o descripción…"
          className="w-full min-h-[48px] pl-11 pr-4 atl-superficie border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-[#ff812c] transition-all"
        />
      </div>

      {/* Translúcida y con blur (probado en vivo: /90 sin blur no se
          notaba). El formulario de edición y el importador se quedan
          opacos — son donde se lee y escribe con cuidado. */}
      <div ref={listaRef} className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-3xl shadow-sm overflow-hidden scroll-mt-24">
        {products === null ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando…</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <Tag className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">
              {products.length === 0 ? "Todavía no tienes productos" : "Ninguno coincide con la búsqueda"}
            </p>
            {products.length === 0 && (
              <button onClick={abrirNuevo} className="mt-2 inline-flex items-center gap-2 text-[15px] font-semibold text-[#ff812c]">
                <Plus className="w-4 h-4" /> Agregar el primero
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
            {filtrados.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-start gap-3 px-4 sm:px-5 py-4 transition-colors",
                  recienAgregados.includes(p.id) && "bg-[#ff812c]/5"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[16px] font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-[16px] font-bold text-[#ff812c] shrink-0 tabular-nums">{formatCOP(p.price)}</p>
                  </div>
                  {p.description && (
                    <p className="mt-1 text-[14px] leading-snug text-slate-600 dark:text-slate-300 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  {/* SKU y columnas extra del CSV como etiquetas: antes eran
                      texto suelto del mismo color y se leían como una frase
                      corrida. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {recienAgregados.includes(p.id) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#ff812c] px-2 py-0.5 text-[11px] font-bold text-[#1C1C1E]">
                        <CircleCheck className="w-3 h-3" /> Recién agregado
                      </span>
                    )}
                    {p.sku && (
                      <span className="rounded-md bg-[#F2F2F7] dark:bg-[#1C1C1E] px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        SKU {p.sku}
                      </span>
                    )}
                    {Object.entries(p.extra ?? {}).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-md bg-[#F2F2F7] dark:bg-[#1C1C1E] px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        {k}: <span className="font-medium text-slate-600 dark:text-slate-300">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => abrirEdicion(p)}
                    title="Editar"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#ff812c] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setBorrando(p)}
                    title="Borrar"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-900/[0.06] dark:border-white/[0.08] shrink-0">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">
                {editing === "nuevo" ? "Nuevo producto" : `Editar ${(editing as Product).name}`}
              </h2>
              <button onClick={() => setEditing(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={guardar} className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08]">
                  <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">
                    Producto <span className="text-[#ff812c]">*</span>
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Vestido flores"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08]">
                  <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">SKU</label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="VF-001"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08]">
                  <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Precio</label>
                  <span className="text-slate-400 mr-1">$</span>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="89900"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-start px-4 py-2 min-h-[52px]">
                  <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0 mt-3">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Talla S, algodón"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 text-slate-900 dark:text-white resize-none"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{formError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setEditing(null)} className="flex-1 flex items-center justify-center atl-superficie text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando} className="flex-[2] flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60">
                  {guardando && <Loader2 className="w-5 h-5 animate-spin" />}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {borrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setBorrando(null)}>
          <div className="w-full max-w-sm atl-superficie rounded-3xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <Trash2 className="mx-auto mb-3 w-9 h-9 text-rose-500" />
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">¿Borrar {borrando.name}?</h3>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
              Las guías ya creadas con este producto no se tocan.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setBorrando(null)} className="flex-1 min-h-[48px] rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] font-semibold text-slate-700 dark:text-slate-300">
                Cancelar
              </button>
              <button onClick={confirmarBorrado} className="flex-1 min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-white">
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
