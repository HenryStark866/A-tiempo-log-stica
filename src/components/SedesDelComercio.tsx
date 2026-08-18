"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, MapPin, Pencil, Plus, Star, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMyClient } from "@/components/useMyClient";
import { CIUDADES_OPERADAS } from "@/lib/zones";
import type { Sede } from "@/lib/types";

const VACIA = {
  name: "",
  address: "",
  city: "",
  contact_name: "",
  contact_phone: "",
  es_principal: false,
};

/**
 * Las sedes del comercio.
 *
 * No es un directorio de direcciones: la zona de la sede es la MITAD del precio
 * de cada domicilio, porque el flete se cobra por el par (de dónde sale → a
 * dónde va). Un comercio que despacha desde Bello y desde Sabaneta paga
 * distinto por el mismo envío según de dónde salga, y hasta ahora no tenía cómo
 * decirlo: todo se cobraba como si saliera de un solo punto.
 *
 * Por eso el municipio es obligatorio y la zona se muestra siempre: es el dato
 * que se convierte en dinero.
 */
export function SedesDelComercio() {
  const { clientId } = useMyClient();
  const [sedes, setSedes] = useState<Sede[] | null>(null);
  const [editando, setEditando] = useState<Sede | "nueva" | null>(null);
  const [form, setForm] = useState({ ...VACIA });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_mis_sedes");
    if (error) {
      setError(error.message);
      setSedes([]);
      return;
    }
    setSedes((data as Sede[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirNueva() {
    setEditando("nueva");
    setForm({ ...VACIA });
    setError(null);
  }

  function abrirEdicion(s: Sede) {
    setEditando(s);
    setForm({
      name: s.name,
      address: s.address ?? "",
      city: s.city ?? "",
      contact_name: s.contact_name ?? "",
      contact_phone: s.contact_phone ?? "",
      es_principal: s.es_principal,
    });
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    if (!form.name.trim()) {
      setError("Ponle un nombre a la sede, para distinguirla de las demás.");
      return;
    }
    if (!form.city) {
      setError("Elige el municipio: de ahí sale la zona, y de la zona el precio de tus domicilios.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      client_id: clientId,
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
    };

    // La principal es una sola. Si esta se marca, primero se le quita la marca
    // a la que la tuviera: el índice único de la base rechazaría las dos, y el
    // mensaje que saldría no lo entendería nadie.
    if (form.es_principal) {
      await supabase
        .from("at_client_sites")
        .update({ es_principal: false })
        .eq("client_id", clientId)
        .eq("es_principal", true);
    }

    const { error } =
      editando === "nueva"
        ? await supabase.from("at_client_sites").insert({ ...payload, es_principal: form.es_principal })
        : await supabase
            .from("at_client_sites")
            .update({ ...payload, es_principal: form.es_principal })
            .eq("id", (editando as Sede).id);

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(null);
    cargar();
  }


  return (
    <div className="space-y-6 pb-10 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Mis sedes
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Desde dónde despachas. La zona de cada sede decide el precio de sus domicilios.
          </p>
        </div>
        <button
          onClick={abrirNueva}
          className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ff812c] px-6 font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          Nueva sede
        </button>
      </div>

      {error && !editando && (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-[15px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </p>
      )}

      {sedes === null ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          Cargando tus sedes…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sedes.map((s) => (
            /* Translucida y con blur (patron probado en vivo: /90 sin blur no se
               notaba). El modal de edicion de abajo se queda opaco a proposito. */
            <div
              key={s.id}
              className="rounded-2xl bg-[#FFFFFF]/75 p-5 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff812c]/10">
                    <Building2 className="h-5 w-5 text-[#ff812c]" />
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[16px] font-bold text-slate-900 dark:text-white">
                      {s.name}
                      {s.es_principal && (
                        <Star className="h-4 w-4 shrink-0 fill-[#ff812c] text-[#ff812c]" />
                      )}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {[s.address, s.city].filter(Boolean).join(" · ") || "Sin dirección"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => abrirEdicion(s)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-gray-100 active:opacity-70 dark:hover:bg-gray-700"
                  aria-label={`Editar ${s.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {/* La zona es el dato que se vuelve dinero: va destacada, y si
                    falta se dice qué implica en vez de dejar un hueco. */}
                {s.zone_name ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <MapPin className="h-3.5 w-3.5" />
                    {s.zone_name}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    <MapPin className="h-3.5 w-3.5" />
                    Sin zona · cobra tarifa completa
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[12px] font-medium text-slate-600 dark:bg-[#1C1C1E] dark:text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                  {s.asesores} asesor{s.asesores === 1 ? "" : "es"}
                </span>
                <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-[12px] font-medium text-slate-600 dark:bg-[#1C1C1E] dark:text-slate-300">
                  {s.pedidos} pedido{s.pedidos === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <form
            onSubmit={guardar}
            className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-2xl dark:bg-[#2C2C2E]"
          >
            <div className="shrink-0 border-b border-slate-900/[0.06] px-6 pt-6 pb-4 dark:border-white/[0.08]">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                {editando === "nueva" ? "Nueva sede" : editando.name}
              </h3>
              <p className="mt-1 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
                El municipio decide la zona, y la zona el precio de los domicilios que
                salgan de aquí.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
              <Campo etiqueta="Nombre">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Bodega norte, Local centro…"
                  className={ENTRADA}
                  autoFocus
                />
              </Campo>
              <Campo etiqueta="Dirección">
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Cra 45 #70-12"
                  className={ENTRADA}
                />
              </Campo>
              <Campo etiqueta="Municipio">
                <select
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className={`${ENTRADA} cursor-pointer appearance-none`}
                >
                  <option value="">Elige el municipio</option>
                  {CIUDADES_OPERADAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Contacto">
                <input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Quién atiende aquí"
                  className={ENTRADA}
                />
              </Campo>
              <Campo etiqueta="Teléfono">
                <input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="3001234567"
                  className={ENTRADA}
                />
              </Campo>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#F2F2F7] px-4 py-3 dark:bg-[#1C1C1E]">
                <input
                  type="checkbox"
                  checked={form.es_principal}
                  onChange={(e) => setForm((f) => ({ ...f, es_principal: e.target.checked }))}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#ff812c]"
                />
                <span className="text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                  <strong className="font-semibold text-slate-900 dark:text-white">
                    Es mi sede principal
                  </strong>
                  <br />
                  La que se usa cuando no se elige otra. Solo puede haber una.
                </span>
              </label>

              {error && (
                <p className="text-[14px] leading-snug text-rose-600 dark:text-rose-400">{error}</p>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-slate-900/[0.06] p-5 dark:border-white/[0.08]">
              <button
                type="submit"
                disabled={busy}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="min-h-[48px] w-full rounded-xl bg-[#F2F2F7] font-semibold text-slate-700 dark:bg-[#1C1C1E] dark:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const ENTRADA =
  "flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white";

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center rounded-2xl bg-[#F2F2F7] px-4 dark:bg-[#1C1C1E]">
      <label className="w-[100px] shrink-0 text-[15px] text-slate-500 dark:text-slate-400">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
