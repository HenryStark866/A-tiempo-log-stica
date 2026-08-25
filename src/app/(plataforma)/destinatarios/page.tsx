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
import { useProfile } from "@/components/ProfileContext";
import {
  leerTabla,
  FORMATOS_ACEPTADOS,
  FORMATOS_LEGIBLES,
  guessMapping,
  guessProductMapping,
  toRecipientPayload,
  toProductPayload,
  RECIPIENT_FIELD_LABELS,
  REQUIRED_FIELDS,
  type CsvRow,
  type RecipientField,
} from "@/lib/csv";
import { lotesQueQuepan } from "@/lib/csv";
import { resolveZone } from "@/lib/zones";
import { reportarError } from "@/lib/observabilidad";
import type { Recipient, SyncRecipientsResult, Zone } from "@/lib/types";

// El tamaño de lote ya no se fija aquí: lo decide lotesQueQuepan() por peso
// del JSON, que es lo que de verdad limita una petición.

const PLANTILLA = [
  "nombre,telefono,direccion,complemento,ciudad,notas,producto,sku,precio,descripcion",
  '"María Restrepo",3001234567,"Cra 43 #10-25","apto 501 torre 2",Envigado,"Dejar en portería","Vestido flores","VF-001","$ 89.900","Talla S, algodón"',
  '"Juan Osorio",3109876543,"Cl 50 #38-14","barrio Castilla",Medellín,,"Bolso cuero","BC-014","145000","Cuero natural, negro"',
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
  // Subir la base completa de clientes por archivo es decisión del dueño del
  // comercio, no de quien trabaja para él: reemplaza de golpe lo que ya
  // había. La base ya lo bloquea (at_sync_recipients exige rol cliente), pero
  // sin esconder aquí el botón el asesor llegaba hasta el final —elegía el
  // archivo, mapeaba las columnas— para toparse con un error genérico al
  // sincronizar. Crear clientes uno por uno sí es suyo: ver el botón «Nuevo»
  // más abajo.
  const esAsesor = useProfile().role === "asesor";

  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [query, setQuery] = useState("");
  // "" = todas. El de cobertura guarda "con" | "por_confirmar" | "fuera" o el
  // id de una sub-zona concreta: son excluyentes entre sí, así que un solo
  // selector los cubre todos sin multiplicar controles en la barra.
  const [ciudadFiltro, setCiudadFiltro] = useState("");
  const [coberturaFiltro, setCoberturaFiltro] = useState("");

  // Selección múltiple para borrar en bloque.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [confirmarMasivo, setConfirmarMasivo] = useState(false);
  const [borrandoMasivo, setBorrandoMasivo] = useState(false);

  // Alta/edición manual
  const [editing, setEditing] = useState<Recipient | "nuevo" | null>(null);
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Recipient | null>(null);
  // El cliente que se parece al que se está creando. Mientras haya uno aquí,
  // el guardado está en pausa esperando que la persona decida.
  const [duplicado, setDuplicado] = useState<Recipient | null>(null);

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

  /**
   * ¿Ya existe este cliente?
   *
   * Dos criterios, y basta con que se cumpla uno:
   *
   *  · El mismo teléfono. Se comparan solo los dígitos, porque «300 111 2233»,
   *    «300-111-2233» y «3001112233» son el mismo número escrito por tres
   *    personas distintas. Un teléfono vacío no cuenta como coincidencia: casi
   *    la mitad de la base viene sin él, y si contara, todos serían duplicados
   *    de todos.
   *
   *  · Nombre + dirección + ciudad, los tres a la vez. Normalizados igual que
   *    en el buscador —minúsculas, sin tildes, espacios colapsados— para que
   *    «María Restrepo» y «maria  restrepo» no pasen por personas distintas.
   *
   * Solo mira la lista que ya está cargada, que es la misma que se ve en
   * pantalla. Con más de mil clientes el listado viene recortado y un duplicado
   * podría quedar fuera del alcance de esta comprobación; el índice único de la
   * base (comercio + nombre + dirección) sigue siendo el que no se escapa.
   */
  function buscarDuplicado(): Recipient | null {
    const norma = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    const soloDigitos = (s: string) => s.replace(/\D/g, "");

    const idActual = editing !== "nuevo" && editing ? editing.id : null;
    const telNuevo = soloDigitos(form.phone);
    const nombreNuevo = norma(form.full_name);
    const dirNueva = norma(form.address);
    const ciudadNueva = norma(form.city || "Medellín");

    return (
      (recipients ?? []).find((r) => {
        if (r.id === idActual) return false; // no es duplicado de sí mismo

        if (telNuevo.length >= 7 && soloDigitos(r.phone ?? "") === telNuevo) return true;

        return (
          norma(r.full_name) === nombreNuevo &&
          norma(r.address) === dirNueva &&
          norma(r.city) === ciudadNueva
        );
      }) ?? null
    );
  }

  /**
   * El guardado va en dos tiempos: primero se pregunta, después se escribe.
   *
   * `forzar` es lo que distingue «le di a Guardar» de «ya vi el aviso y aun así
   * quiero crearlo». Sin esa bandera, el modal de duplicado se volvería a abrir
   * sobre sí mismo en un bucle.
   */
  async function guardar(e: React.FormEvent, forzar = false) {
    e.preventDefault();
    if (!clientId) return;

    if (!forzar) {
      const parecido = buscarDuplicado();
      if (parecido) {
        setDuplicado(parecido);
        return; // el guardado queda en pausa; no se escribe nada todavía
      }
    }

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
    setDuplicado(null);
    if (error) {
      // El índice único (comercio + nombre + dirección) evita duplicados. Es la
      // última red: aquí se llega cuando la comprobación de arriba no lo vio,
      // por ejemplo con más de mil clientes cargados a medias.
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

  /** «Usar el que ya existe»: se abandona el nuevo y se abre el de siempre. */
  function usarExistente() {
    if (!duplicado) return;
    const existente = duplicado;
    setDuplicado(null);
    abrirEdicion(existente);
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
      // Se pasan las filas para poder detectar el teléfono por contenido.
      setMapping(guessMapping(h, r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      setHeaders([]);
      setRows([]);
    }
  }

  const faltantes = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  // Columnas del archivo que no quedaron asignadas a ningún campo. Si no hay
  // ninguna, el archivo simplemente no trae el dato que falta.
  const columnasLibres = useMemo(() => {
    const usadas = new Set(Object.values(mapping).filter(Boolean) as string[]);
    return headers.filter((h) => !usadas.has(h));
  }, [headers, mapping]);

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

    // Lotes por PESO, no por número de filas: 400 filas de un archivo ancho
    // son megabytes que no llegan. Ver lotesQueQuepan en lib/csv.ts.
    const lotes = lotesQueQuepan(payload);
    let hechas = 0;

    for (const lote of lotes) {
      setProgress({ done: hechas, total });
      const { data, error } = await supabase.rpc("at_sync_recipients", { p_rows: lote });

      if (error) {
        // Lo que ya entró, entró: cada lote es su propia transacción. Decirlo
        // importa —el comercio necesita saber si tiene media base cargada— y
        // volver a subir el MISMO archivo es seguro: la sincronización busca
        // por nombre+dirección y actualiza en vez de duplicar.
        reportarError(error, {
          origen: "importar destinatarios",
          filas: total,
          importadas: hechas,
          lote: lote.length,
        });
        setError(
          hechas > 0
            ? `Se importaron ${hechas} de ${total} y ahí se detuvo: ${error.message}. ` +
                `Vuelve a subir el mismo archivo para continuar; lo ya cargado no se duplica.`
            : `No se pudo importar: ${error.message}`
        );
        setBusy(false);
        setProgress(null);
        load();
        return;
      }

      const r = data as SyncRecipientsResult;
      acumulado.creados += r.creados;
      acumulado.actualizados += r.actualizados;
      acumulado.omitidos += r.omitidos;
      hechas += lote.length;
    }

    // Catálogo, si el archivo trae columnas de producto.
    //
    // Antes este bucle ignoraba el error: la pantalla decía que todo había ido
    // bien y el catálogo se quedaba vacío. El comercio se enteraba al ir a
    // despachar y no encontrar sus productos.
    const productMapping = guessProductMapping(headers);
    if (productMapping.name) {
      const productPayload = toProductPayload(rows, productMapping);
      for (const lote of lotesQueQuepan(productPayload)) {
        const { error } = await supabase.rpc("at_sync_products", { p_rows: lote });
        if (error) {
          reportarError(error, { origen: "importar productos desde destinatarios" });
          // Los compradores SÍ se cargaron: se dice lo que pasó y lo que no,
          // en vez de dar por fallida la importación entera.
          setError(
            `Los compradores se importaron bien, pero el catálogo de productos no: ` +
              `${error.message}. Puedes subirlo aparte desde la pantalla de Productos.`
          );
          break;
        }
      }
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
    a.download = "plantilla-clientes-jam.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * La zona de cada cliente, resuelta una sola vez.
   *
   * `resolveZone` recorre todos los sectores de todas las zonas buscando cuál
   * aparece en la dirección. Con mil clientes y diez sub-zonas de ~25 barrios
   * eso es un cuarto de millón de comparaciones, y desde que hay filtro de
   * cobertura haría falta dos veces por render: una para filtrar y otra para
   * pintar la etiqueta. Se calcula aquí y las dos la leen.
   */
  const zonaPorCliente = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof resolveZone>>();
    for (const r of recipients ?? []) mapa.set(r.id, resolveZone(zones, r.city, r.address));
    return mapa;
  }, [recipients, zones]);

  /** Las ciudades que de verdad hay en la lista, no un catálogo fijo. */
  const ciudades = useMemo(() => {
    const vistas = new Set<string>(
      (recipients ?? []).map((r) => r.city.trim()).filter((c) => c.length > 0)
    );
    // localeCompare con "es" para que Envigado vaya antes que Ítagüí y no al
    // revés: ordenar por punto de código pone las tildes al final.
    return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
  }, [recipients]);

  const filtrados = useMemo(() => {
    const s = query.trim().toLowerCase();
    return (recipients ?? []).filter((r) => {
      if (s) {
        const coincide =
          r.full_name.toLowerCase().includes(s) ||
          r.address.toLowerCase().includes(s) ||
          (r.phone ?? "").includes(s) ||
          r.city.toLowerCase().includes(s);
        if (!coincide) return false;
      }

      if (ciudadFiltro && r.city.trim() !== ciudadFiltro) return false;

      if (coberturaFiltro) {
        const zr = zonaPorCliente.get(r.id);
        // La zona guardada manda sobre la deducida: si el CEDI se la asignó a
        // mano, es la buena. Es el mismo criterio con el que se pinta la
        // etiqueta en la lista, para que filtrar y ver no se contradigan.
        const zonaId = r.zone_id ?? zr?.zone?.id ?? null;
        if (coberturaFiltro === "con") return zonaId !== null;
        if (coberturaFiltro === "por_confirmar") return zonaId === null && zr?.status === "por_confirmar";
        if (coberturaFiltro === "fuera") return zonaId === null && zr?.status === "fuera";
        return zonaId === coberturaFiltro;
      }

      return true;
    });
  }, [recipients, query, ciudadFiltro, coberturaFiltro, zonaPorCliente]);

  /**
   * La selección nunca sobrevive a un filtro que la esconda.
   *
   * Si al buscar se pudieran quedar seleccionados clientes que ya no están en
   * pantalla, «Eliminar seleccionados (7)» borraría cosas que la persona no
   * puede ver ni revisar. Se prefiere perder la selección a borrar a ciegas.
   */
  useEffect(() => {
    setSeleccion((prev) => {
      if (prev.size === 0) return prev;
      const visibles = new Set(filtrados.map((r) => r.id));
      const siguen = [...prev].filter((id) => visibles.has(id));
      return siguen.length === prev.size ? prev : new Set(siguen);
    });
  }, [filtrados]);

  const hayFiltros = query.trim() !== "" || ciudadFiltro !== "" || coberturaFiltro !== "";
  const todosVisiblesMarcados =
    filtrados.length > 0 && filtrados.every((r) => seleccion.has(r.id));

  function alternarCliente(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** «Seleccionar todos» son los de la vista actual, no los de la base. */
  function alternarTodosVisibles() {
    setSeleccion(todosVisiblesMarcados ? new Set() : new Set(filtrados.map((r) => r.id)));
  }

  async function borrarSeleccionados() {
    const ids = [...seleccion];
    if (ids.length === 0) return;
    setBorrandoMasivo(true);
    setError(null);
    const supabase = createClient();

    // Se borra por tandas: `in` viaja en la URL y con mil identificadores la
    // petición se pasa de largo y el servidor la rechaza entera.
    const TANDA = 200;
    for (let i = 0; i < ids.length; i += TANDA) {
      const { error } = await supabase
        .from("at_recipients")
        .delete()
        .in("id", ids.slice(i, i + TANDA));
      if (error) {
        setBorrandoMasivo(false);
        setConfirmarMasivo(false);
        setError(
          `Se borraron ${i} de ${ids.length}. El resto quedó sin borrar: ${error.message}`
        );
        setSeleccion(new Set());
        load();
        return;
      }
    }

    setBorrandoMasivo(false);
    setConfirmarMasivo(false);
    setSeleccion(new Set());
    load();
  }

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
            Clientes
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {recipients === null
              ? "Cargando…"
              : `${recipients.length} guardado(s) · se autocompletan al crear una guía`}
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
            {result.omitidos > 0 && <>, <strong>{result.omitidos}</strong> omitido(s) por datos incompletos</>}.
          </p>
        </div>
      )}

      {sinTelefono > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-4">
          <TriangleAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[14px] text-amber-700 dark:text-amber-400">
            <strong>{sinTelefono}</strong> cliente(s) sin teléfono. Sin número el mensajero no
            puede avisar que llegó, y la entrega se cae más seguido.
          </p>
        </div>
      )}

      {/* Importador: colapsado por defecto */}
      {importAbierto && !esAsesor && (
        <section className="atl-superficie rounded-3xl shadow-sm p-5 space-y-4 transition-colors duration-300">
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
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl atl-relleno  px-4 min-h-[44px] text-[14px] font-semibold text-slate-600 dark:text-slate-300 active:scale-[0.98] transition-transform"
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
                Confirma a qué corresponde cada columna. Las que dejes sin asignar{" "}
                <strong className="text-slate-900 dark:text-white">también se guardan</strong>: no se
                pierde nada de tu archivo.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(RECIPIENT_FIELD_LABELS) as RecipientField[]).map((field) => {
                  const requerido = REQUIRED_FIELDS.includes(field);
                  return (
                    <div key={field} className="flex items-center gap-3 atl-relleno  rounded-xl px-3 min-h-[52px]">
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
                    {columnasLibres.length === 0
                      ? "Tu archivo no trae columna de teléfono. Se importará sin número, pero así el mensajero no puede avisar que llegó."
                      : "No encontramos la columna del teléfono. Elígela arriba: sin número el mensajero no puede avisar que llegó."}
                  </p>
                </div>
              )}

              {faltantes.length > 0 ? (
                <div className="flex items-start gap-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <TriangleAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-[14px] text-rose-700 dark:text-rose-400 min-w-0">
                    <p>
                      Falta indicar:{" "}
                      <strong>{faltantes.map((f) => RECIPIENT_FIELD_LABELS[f]).join(" y ")}</strong>.
                    </p>
                    {/* Sin columnas libres, el problema está en el archivo y no en
                        el mapeo: decirlo evita que la persona busque un desplegable
                        que no la va a salvar. */}
                    {columnasLibres.length === 0 ? (
                      <p className="mt-1.5 leading-relaxed">
                        Tu archivo no trae esa información. Sus columnas son{" "}
                        <strong>{headers.join(", ")}</strong>. Agrégale una columna con
                        el nombre de quien recibe y vuelve a subirlo.
                      </p>
                    ) : (
                      <p className="mt-1.5 leading-relaxed">
                        Elígela arriba entre las columnas que quedan sin usar:{" "}
                        <strong>{columnasLibres.join(", ")}</strong>.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Se sincronizarán <strong className="text-slate-900 dark:text-white">{filasValidas}</strong> cliente(s).
                    {rows.length - filasValidas > 0 &&
                      ` ${rows.length - filasValidas} fila(s) se omitirán por venir sin nombre o sin dirección.`}
                  </p>

                  <div className="overflow-x-auto rounded-2xl border border-slate-900/[0.06] dark:border-white/[0.08]">
                    <table className="w-full text-left text-[14px] min-w-[620px]">
                      <thead className="atl-relleno ">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Nombre</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Teléfono</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Dirección completa</th>
                          <th className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Ciudad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
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

      {/* Buscador y filtros. En el teléfono se apilan; desde sm el buscador se
          queda con el ancho que sobra y los dos selectores caben al lado. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, dirección o teléfono…"
            className="w-full min-h-[48px] pl-11 pr-4 atl-superficie border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-[#ff812c] transition-all"
          />
        </div>

        <select
          value={ciudadFiltro}
          onChange={(e) => setCiudadFiltro(e.target.value)}
          aria-label="Filtrar por ciudad"
          className="min-h-[48px] sm:w-44 px-4 atl-superficie border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white focus:outline-none focus:border-[#ff812c] transition-all appearance-none cursor-pointer"
        >
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={coberturaFiltro}
          onChange={(e) => setCoberturaFiltro(e.target.value)}
          aria-label="Filtrar por cobertura o zona"
          className="min-h-[48px] sm:w-52 px-4 atl-superficie border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white focus:outline-none focus:border-[#ff812c] transition-all appearance-none cursor-pointer"
        >
          <option value="">Toda la cobertura</option>
          <option value="con">Con cobertura</option>
          <option value="por_confirmar">Zona por confirmar</option>
          <option value="fuera">Fuera de cobertura</option>
          {/* Las sub-zonas van después de los tres estados: son el detalle, no
              lo primero que se busca. Se listan por `name`; el día que la
              migración 0089 entre y `Zone` tenga `code`, aquí conviene mostrar
              «MED-SO · Medellín Sur-Occidente», que es como las nombra el CEDI. */}
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </div>

      {/* Seleccionar todos + cuántos se están viendo. Solo aparece cuando hay
          algo que seleccionar: en una lista vacía sería un control muerto. */}
      {recipients !== null && filtrados.length > 0 && !esAsesor && (
        <div className="flex items-center justify-between gap-3 px-1">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={todosVisiblesMarcados}
              onChange={alternarTodosVisibles}
              aria-label="Seleccionar todos los clientes visibles"
              className="w-5 h-5 shrink-0 accent-[#ff812c]"
            />
            <span className="text-[14px] text-slate-600 dark:text-slate-300">
              Seleccionar todos
            </span>
          </label>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {hayFiltros
              ? `${filtrados.length} de ${recipients.length}`
              : `${recipients.length} cliente(s)`}
          </p>
        </div>
      )}

      {/* Listado con información completa — translúcida y con blur (probado
          en vivo: /90 sin blur no se notaba). El formulario de edición y el
          importador de arriba se quedan opacos: son donde se lee y escribe
          con cuidado, no donde se echa un ojo. */}
      <div className="atl-superficie   rounded-3xl shadow-sm overflow-hidden transition-colors duration-300">
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
          <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
            {filtrados.map((r) => {
              // Ya resuelta arriba para todos los clientes: aquí solo se lee.
              const zr = zonaPorCliente.get(r.id) ?? resolveZone(zones, r.city, r.address);
              const zonaNombre = r.at_zones?.name ?? zr.zone?.name ?? null;
              const marcado = seleccion.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex items-start gap-3 px-4 sm:px-5 py-4 transition-colors ${
                    marcado ? "bg-[#ff812c]/[0.07]" : ""
                  }`}
                >
                  {!esAsesor && (
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarCliente(r.id)}
                      aria-label={`Seleccionar a ${r.full_name}`}
                      className="w-5 h-5 shrink-0 mt-1 accent-[#ff812c] cursor-pointer"
                    />
                  )}
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

                    {/* Todo lo demás que venía en el archivo del cliente */}
                    {Object.keys(r.extra ?? {}).length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                        {Object.entries(r.extra).map(([k, v]) => (
                          <span key={k} className="text-[12px] text-slate-400 dark:text-slate-500">
                            {k}: <span className="text-slate-600 dark:text-slate-300">{v}</span>
                          </span>
                        ))}
                      </div>
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
            className="w-full max-w-lg atl-relleno  rounded-3xl overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-900/[0.06] dark:border-white/[0.08] shrink-0">
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
              <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm">
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
              <div className="rounded-2xl atl-superficie px-4 py-3 shadow-sm">
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
                  className="flex-1 flex items-center justify-center atl-superficie text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
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

      {/* Posible duplicado. Va con z-[60] para quedar POR ENCIMA del formulario
          de alta, que es z-50: si saliera por debajo, el aviso quedaría oculto
          justo detrás de lo que está avisando. */}
      {duplicado && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setDuplicado(null)}
        >
          <div
            className="w-full max-w-sm atl-superficie rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10">
                <TriangleAlert className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
                  Posible cliente duplicado
                </h3>
                <p className="mt-1 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
                  Ya tienes uno guardado que coincide. Míralo antes de crear otro.
                </p>
              </div>
            </div>

            {/* La tarjeta del que ya existe: mismos datos que muestra la lista,
                para que se reconozca de un vistazo sin tener que ir a buscarlo. */}
            <div className="mt-4 rounded-2xl atl-relleno  p-4 space-y-1.5">
              <p className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
                {duplicado.full_name}
              </p>
              <p className="flex items-start gap-1.5 text-[14px] text-slate-600 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-1 text-slate-400" />
                <span>
                  {duplicado.address}
                  <span className="text-slate-400 dark:text-slate-500"> · {duplicado.city}</span>
                </span>
              </p>
              <p className="flex items-center gap-1.5 text-[14px]">
                <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                {duplicado.phone ? (
                  <span className="text-slate-600 dark:text-slate-300">{duplicado.phone}</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Sin teléfono</span>
                )}
              </p>
              {duplicado.times_used > 0 && (
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Le has despachado {duplicado.times_used} guía(s)
                </p>
              )}
            </div>

            {/* La acción recomendada va primera y con el color de marca; crear
                otro es la salida, no la puerta principal. */}
            <div className="mt-6 space-y-2">
              <button
                onClick={usarExistente}
                className="w-full min-h-[48px] rounded-xl bg-[#ff812c] hover:bg-[#ff812c]/90 font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
              >
                Usar cliente existente
              </button>
              <button
                onClick={(e) => guardar(e, true)}
                disabled={guardando}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl atl-relleno  font-semibold text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {guardando ? "Creando…" : "Crear de todos modos"}
              </button>
              <button
                onClick={() => setDuplicado(null)}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-semibold text-slate-500 dark:text-slate-400 active:scale-[0.98] transition-transform"
              >
                Volver a editar
              </button>
            </div>
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
            className="w-full max-w-sm atl-superficie rounded-3xl p-6 shadow-2xl text-center"
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
                className="flex-1 min-h-[48px] rounded-xl atl-relleno  font-semibold text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
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

      {/* Barra flotante de acción masiva. Se ancla abajo, que es donde está el
          pulgar en el teléfono, y el `env(safe-area-inset-bottom)` evita que
          la tape la barra del sistema en un iPhone. */}
      {seleccion.size > 0 && !esAsesor && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-900/[0.06] bg-[#FFFFFF]/90 px-4 py-3 shadow-2xl backdrop-blur-xl dark:border-white/[0.10] dark:bg-[#2C2C2E]/90">
            <p className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900 dark:text-white">
              {seleccion.size} seleccionado{seleccion.size > 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setSeleccion(new Set())}
              className="shrink-0 rounded-xl px-3 min-h-[44px] text-[14px] font-semibold text-slate-600 dark:text-slate-300 active:scale-[0.98] transition-transform"
            >
              Quitar
            </button>
            <button
              onClick={() => setConfirmarMasivo(true)}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 min-h-[44px] text-[14px] font-bold text-white active:scale-[0.98] transition-transform"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar ({seleccion.size})
            </button>
          </div>
        </div>
      )}

      {/* Confirmación del borrado masivo. Mismo lenguaje que el de uno solo:
          si se parecen, nadie se confunde sobre cuál está mirando. */}
      {confirmarMasivo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !borrandoMasivo && setConfirmarMasivo(false)}
        >
          <div
            className="w-full max-w-sm atl-superficie rounded-3xl p-6 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="mx-auto mb-3 w-9 h-9 text-rose-500" />
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
              ¿Borrar {seleccion.size} cliente{seleccion.size > 1 ? "s" : ""}?
            </h3>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
              Se quitan de tu lista. Las guías ya creadas a su nombre no se tocan.
            </p>
            {/* Que se vea a QUIÉN se está borrando, no solo cuántos: un número
                no se puede revisar, una lista de nombres sí. */}
            <ul className="mt-4 max-h-32 overflow-y-auto rounded-2xl atl-relleno  px-4 py-2 text-left">
              {filtrados
                .filter((r) => seleccion.has(r.id))
                .slice(0, 50)
                .map((r) => (
                  <li key={r.id} className="truncate py-0.5 text-[13px] text-slate-600 dark:text-slate-300">
                    {r.full_name}
                  </li>
                ))}
              {seleccion.size > 50 && (
                <li className="py-0.5 text-[13px] text-slate-400 dark:text-slate-500">
                  y {seleccion.size - 50} más…
                </li>
              )}
            </ul>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmarMasivo(false)}
                disabled={borrandoMasivo}
                className="flex-1 min-h-[48px] rounded-xl atl-relleno  font-semibold text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={borrarSeleccionados}
                disabled={borrandoMasivo}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {borrandoMasivo && <Loader2 className="w-5 h-5 animate-spin" />}
                {borrandoMasivo ? "Borrando…" : "Borrar"}
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
        ultimo ? "" : "border-b border-slate-900/[0.06] dark:border-white/[0.08]"
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
