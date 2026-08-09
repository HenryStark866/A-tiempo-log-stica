"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LoaderCircle,
  PackagePlus,
  ChevronLeft,
  MapPin,
  Phone,
  User,
  Store,
  Banknote,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useMyClient } from "@/components/useMyClient";
import { formatCOP } from "@/lib/utils";
import { zoneForText } from "@/lib/zones";
import type { Guide, Zone } from "@/lib/types";

export default function EditGuidePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const profile = useProfile();
  // Se llama por el efecto, no por el valor: autoaprovisiona el comercio del
  // cliente si todavía no lo tiene. Sin esta línea, un comercio recién
  // registrado que entra directo a editar una guía se queda sin cuenta.
  useMyClient();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonaManual, setZonaManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);

  const [form, setForm] = useState({
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "Medellín",
    zone_id: "",
    is_cod: false,
    cod_amount: "",
    notes: "",
  });

  // Cargar zonas
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, []);

  // Cargar guía
  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: g, error: err } = await supabase
      .from("at_guides")
      .select("*, at_clients(business_name), at_zones(name)")
      .eq("id", id)
      .single();

    if (err || !g) {
      setError("No se pudo cargar la guía");
      setLoading(false);
      return;
    }

    const guide = g as Guide;
    // Solo se puede editar si está en estado 'creada'
    if (guide.status !== "creada") {
      setNotAllowed(true);
      setLoading(false);
      return;
    }

    setGuide(guide);
    setZonaManual(true); // pre-cargamos zona, no la sobreescribimos
    setForm({
      recipient_name: guide.recipient_name,
      recipient_phone: guide.recipient_phone ?? "",
      recipient_address: guide.recipient_address,
      recipient_city: guide.recipient_city,
      zone_id: guide.zone_id ?? "",
      is_cod: guide.is_cod,
      cod_amount: guide.cod_amount ? String(guide.cod_amount) : "",
      notes: guide.notes ?? "",
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Sugerencia de zona por dirección mientras no la fijen a mano
  useEffect(() => {
    if (zonaManual || zones.length === 0) return;
    const z = zoneForText(zones, `${form.recipient_city} ${form.recipient_address}`);
    setForm((f) => (f.zone_id === (z?.id ?? "") ? f : { ...f, zone_id: z?.id ?? "" }));
  }, [form.recipient_city, form.recipient_address, zones, zonaManual]);

  const zonaElegida = useMemo(
    () => zones.find((z) => z.id === form.zone_id) ?? null,
    [zones, form.zone_id]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Va por RPC y no por update directo: RLS no le abre at_guides al comercio,
    // justamente para que no pueda tocar guide_number ni payment_token. La
    // función fija qué campos son editables y revalida el estado en el servidor.
    const supabase = createClient();
    const { error } = await supabase.rpc("at_update_guide", {
      p_guide_id: id,
      p_recipient_name: form.recipient_name,
      p_recipient_phone: form.recipient_phone || null,
      p_recipient_address: form.recipient_address,
      p_recipient_city: form.recipient_city,
      p_zone_id: form.zone_id || null,
      p_is_cod: form.is_cod,
      p_cod_amount: form.is_cod ? Number(form.cod_amount) || 0 : 0,
      p_notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push(`/pedidos/${id}`);
  }

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[15px]">Cargando guía…</p>
      </div>
    );
  }

  if (notAllowed || !guide) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] py-4">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm border border-slate-200 dark:border-slate-800">
          <PackagePlus className="mx-auto mb-4 size-10 text-slate-400" />
          <h2 className="text-[19px] font-bold text-slate-900 dark:text-white">
            Esta guía no se puede editar
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Solo las guías en estado <strong>Creada</strong> (antes de ser despachadas al CEDI)
            pueden modificarse.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Solo el cliente dueño puede editar (o staff)
  const esCliente = profile.role === "cliente";
  const esStaff = ["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role);
  if (!esCliente && !esStaff) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <p className="text-slate-500 text-center py-20">No tienes permiso para editar esta guía.</p>
      </div>
    );
  }

  return (
    <div className="pb-28 max-w-2xl mx-auto w-full font-sans">
      <div className="relative flex items-center justify-between px-4 py-4 mb-2">
        <button
          onClick={() => router.back()}
          className="flex items-center text-[#ff812c] active:opacity-70 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight absolute left-1/2 -translate-x-1/2 text-slate-900 dark:text-white">
          Editar Guía
        </h1>
        <div className="w-[70px]"></div>
      </div>

      <div className="px-4 space-y-6">
        <div className="mb-2">
          <h2 className="text-[34px] font-bold tracking-tight text-slate-900 dark:text-white">
            Editar guía
          </h2>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {guide.guide_number} · Solo disponible antes de ser despachada
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
              Información de Envío
            </h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
              {/* Comercio (solo lectura) */}
              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800">
                <Store className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <div className="flex-1 min-w-0 py-3">
                  <p className="text-[12px] text-slate-400 dark:text-slate-500 leading-none">
                    Comercio remitente
                  </p>
                  <p className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white truncate">
                    {guide.at_clients?.business_name ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <User className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  required
                  value={form.recipient_name}
                  onChange={set("recipient_name")}
                  placeholder="Nombre del destinatario"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Phone className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  value={form.recipient_phone}
                  onChange={set("recipient_phone")}
                  placeholder="Teléfono"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  required
                  value={form.recipient_address}
                  onChange={set("recipient_address")}
                  placeholder="Dirección (Cl 10 #43E-31, apto 201)"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">
                  Ciudad
                </label>
                <input
                  required
                  value={form.recipient_city}
                  onChange={set("recipient_city")}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">
                  Zona
                </label>
                <select
                  value={form.zone_id}
                  onChange={(e) => {
                    setZonaManual(true);
                    set("zone_id")(e);
                  }}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                >
                  <option value="">(Se define en el CEDI)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {zonaElegida ? (
              <div className="mt-2 mx-1 flex items-center justify-between gap-3 rounded-2xl bg-[#ff812c]/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#ff812c] truncate">{zonaElegida.name}</p>
                  {zonaElegida.coverage && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                      {zonaElegida.coverage}
                    </p>
                  )}
                </div>
                <p className="text-[17px] font-bold text-slate-900 dark:text-white shrink-0">
                  {formatCOP(zonaElegida.delivery_rate)}
                </p>
              </div>
            ) : (
              form.recipient_address.trim().length > 3 && (
                <p className="mt-2 mx-1 rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  No reconocimos la zona por la dirección. El CEDI la asignará al recibir el paquete.
                </p>
              )
            )}
          </section>

          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
              Recaudo y Notas
            </h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
              <div
                className="flex items-center justify-between px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 transition-colors cursor-pointer"
                onClick={() => setForm((f) => ({ ...f, is_cod: !f.is_cod }))}
              >
                <label className="text-[16px] text-slate-900 dark:text-white font-medium flex-1 cursor-pointer">
                  Pago Contraentrega (COD)
                </label>
                <input
                  type="checkbox"
                  checked={form.is_cod}
                  readOnly
                  className="w-14 h-8 shrink-0 rounded-full appearance-none bg-gray-300 dark:bg-gray-600 checked:bg-[#ff812c] transition-colors relative cursor-pointer
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-7 after:h-7 after:bg-white after:rounded-full after:shadow-sm after:transition-transform checked:after:translate-x-6"
                />
              </div>

              {form.is_cod && (
                <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors bg-gray-50 dark:bg-[#1C1C1E]">
                  <Banknote className="w-5 h-5 text-[#ff812c] mr-4 shrink-0" />
                  <span className="text-slate-400 dark:text-slate-500 mr-2">$</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.cod_amount}
                    onChange={set("cod_amount")}
                    placeholder="Valor a recaudar"
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white font-semibold"
                  />
                </div>
              )}

              <div className="flex items-start px-4 py-2 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0 mt-2.5" />
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Notas adicionales (opcional)"
                  rows={2}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white resize-none"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
              <p className="text-[14px] text-rose-600 dark:text-rose-400 text-center font-medium">
                {error}
              </p>
            </div>
          )}

          {/* Igual que en «Nueva guía»: apoyada encima de las pestañas, que es
              lo único que impide que «Guardar cambios» quede debajo de ellas. */}
          <div className="fixed bottom-nav left-0 right-0 p-4 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 z-20 md:static md:bg-transparent md:border-0 md:p-0 md:backdrop-blur-none transition-colors duration-300">
            <div className="flex gap-3 max-w-2xl mx-auto">
              <button
                type="button"
                onClick={() => router.back()}
                disabled={saving}
                className="flex-1 flex items-center justify-center bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm disabled:opacity-60"
              >
                {saving ? (
                  <LoaderCircle className="w-5 h-5 animate-spin text-[#1C1C1E]" />
                ) : null}
                <span>Guardar cambios</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
