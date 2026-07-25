"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Contact,
  Link2Off,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { formatCOP } from "@/lib/utils";
import { zoneForText } from "@/lib/zones";
import type { Client, Zone, Recipient } from "@/lib/types";

export default function NewGuidePage() {
  const router = useRouter();
  const profile = useProfile();
  const esCliente = profile.role === "cliente";

  const [clients, setClients] = useState<Client[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [buscador, setBuscador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Distingue "el usuario eligió zona" de "la sugerimos por la dirección".
  const [zonaManual, setZonaManual] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "Medellín",
    zone_id: "",
    is_cod: false,
    cod_amount: "",
    notes: "",
  });

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        if (esCliente && profile.client_id) {
          setForm((f) => ({ ...f, client_id: profile.client_id! }));
        } else if (list.length) {
          setForm((f) => ({ ...f, client_id: f.client_id || list[0].id }));
        }
      });

    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));

    if (profile.client_id) {
      supabase
        .from("at_recipients")
        .select("*, at_zones(name)")
        .eq("client_id", profile.client_id)
        .eq("active", true)
        .order("times_used", { ascending: false })
        .order("full_name")
        .limit(1000)
        .then(({ data }) => setRecipients((data as Recipient[]) ?? []));
    }
  }, [esCliente, profile.client_id]);

  // Sugerencia de zona a partir de la dirección/ciudad, mientras no la fijen a mano.
  useEffect(() => {
    if (zonaManual || zones.length === 0) return;
    const z = zoneForText(zones, `${form.recipient_city} ${form.recipient_address}`);
    setForm((f) => (f.zone_id === (z?.id ?? "") ? f : { ...f, zone_id: z?.id ?? "" }));
  }, [form.recipient_city, form.recipient_address, zones, zonaManual]);

  const zonaElegida = zones.find((z) => z.id === form.zone_id) ?? null;

  const coincidencias = useMemo(() => {
    const s = buscador.trim().toLowerCase();
    if (!s) return [];
    return recipients
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(s) ||
          r.address.toLowerCase().includes(s) ||
          (r.phone ?? "").includes(s)
      )
      .slice(0, 6);
  }, [buscador, recipients]);

  function usarDestinatario(r: Recipient) {
    setRecipientId(r.id);
    setBuscador("");
    setZonaManual(true); // la zona guardada del destinatario manda
    setForm((f) => ({
      ...f,
      recipient_name: r.full_name,
      recipient_phone: r.phone ?? "",
      recipient_address: r.address,
      recipient_city: r.city,
      zone_id: r.zone_id ?? "",
    }));
  }

  function limpiarDestinatario() {
    setRecipientId(null);
    setZonaManual(false);
    setForm((f) => ({
      ...f,
      recipient_name: "",
      recipient_phone: "",
      recipient_address: "",
      recipient_city: "Medellín",
      zone_id: "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Antes esto no se validaba: si client_id venía vacío el <select required>
    // bloqueaba el submit en silencio y el botón "Crear guía" no hacía nada.
    if (!form.client_id) {
      setError(
        esCliente
          ? "Tu cuenta no está enlazada a un comercio. Pide al administrador que la enlace desde Usuarios."
          : "Selecciona el cliente e-commerce al que pertenece la guía."
      );
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("at_guides")
      .insert({
        client_id: form.client_id,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone || null,
        recipient_address: form.recipient_address,
        recipient_city: form.recipient_city,
        zone_id: form.zone_id || null,
        is_cod: form.is_cod,
        cod_amount: form.is_cod ? Number(form.cod_amount) || 0 : 0,
        notes: form.notes || null,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      setError(error?.message ?? "No se pudo crear la guía");
      setSaving(false);
      return;
    }

    // Contador de uso del destinatario: ordena la lista por los más frecuentes.
    // Si falla no afecta la guía, que ya quedó creada.
    if (recipientId) {
      const usado = recipients.find((r) => r.id === recipientId);
      await supabase
        .from("at_recipients")
        .update({ times_used: (usado?.times_used ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", recipientId);
    }

    router.push(`/guias/${data.id}`);
  }

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // Cliente sin comercio enlazado: no tiene sentido mostrarle el formulario.
  if (esCliente && !profile.client_id) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] py-4">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm">
          <Link2Off className="mx-auto mb-4 size-10 text-amber-500" />
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">
            Tu cuenta aún no está enlazada a un comercio
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            No podemos crear guías a tu nombre hasta que un administrador enlace tu usuario
            con tu comercio desde <strong>Usuarios</strong>.
          </p>
        </div>
      </div>
    );
  }

  // Staff sin ningún comercio cargado: igual de bloqueante, pero con otra salida.
  if (!esCliente && clients !== null && clients.length === 0) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] py-4">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm">
          <Store className="mx-auto mb-4 size-10 text-slate-400" />
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">
            No hay comercios registrados
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Una guía siempre pertenece a un cliente e-commerce. Crea el primero para poder
            empezar a registrar envíos.
          </p>
          <Link
            href="/clientes"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Ir a Clientes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 max-w-2xl mx-auto w-full font-sans">
      <div className="flex items-center justify-between px-4 py-4 mb-2">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] active:opacity-70 transition-opacity">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight absolute left-1/2 -translate-x-1/2 text-slate-900 dark:text-white">Nueva Guía</h1>
        <div className="w-[70px]"></div>
      </div>

      <div className="px-4 space-y-6">
        <div className="mb-2">
          <h2 className="text-[34px] font-bold tracking-tight text-slate-900 dark:text-white">Nueva guía</h2>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">Registra un envío para última milla</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Destinatarios guardados */}
          {recipients.length > 0 && (
            <section>
              <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
                Mis destinatarios
              </h3>
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
                {recipientId ? (
                  <div className="flex items-center gap-3 px-4 min-h-[56px]">
                    <Contact className="w-5 h-5 text-[#ff812c] shrink-0" />
                    <p className="flex-1 text-[15px] text-slate-900 dark:text-white truncate">
                      Datos cargados desde tu base
                    </p>
                    <button
                      type="button"
                      onClick={limpiarDestinatario}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400"
                      title="Escribir los datos a mano"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center px-4 min-h-[56px]">
                      <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                      <input
                        value={buscador}
                        onChange={(e) => setBuscador(e.target.value)}
                        placeholder={`Buscar entre ${recipients.length} destinatario(s)…`}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    {coincidencias.length > 0 && (
                      <ul className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        {coincidencias.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => usarDestinatario(r)}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                              <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{r.full_name}</p>
                              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                                {r.address} · {r.city}
                                {r.phone && ` · ${r.phone}`}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Información de Envío</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Store className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <select
                  required
                  value={form.client_id}
                  onChange={set("client_id")}
                  disabled={esCliente}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none disabled:opacity-60"
                >
                  <option value="" disabled>Cliente e-commerce...</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.business_name}</option>
                  ))}
                </select>
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
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Ciudad</label>
                <input
                  required
                  value={form.recipient_city}
                  onChange={set("recipient_city")}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Zona</label>
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
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Tarifa vigente de la zona detectada */}
            {zonaElegida ? (
              <div className="mt-2 mx-1 flex items-center justify-between gap-3 rounded-2xl bg-[#ff812c]/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#ff812c] truncate">{zonaElegida.name}</p>
                  {zonaElegida.coverage && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{zonaElegida.coverage}</p>
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
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Recaudo y Notas</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">

              <div className="flex items-center justify-between px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 transition-colors cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_cod: !f.is_cod }))}>
                <label className="text-[16px] text-slate-900 dark:text-white font-medium flex-1 cursor-pointer">Pago Contraentrega (COD)</label>
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

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 pb-8 z-20 md:static md:bg-transparent md:border-0 md:p-0 md:backdrop-blur-none transition-colors duration-300">
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
                {saving ? <LoaderCircle className="w-5 h-5 animate-spin text-[#1C1C1E]" /> : <PackagePlus className="w-5 h-5 text-[#1C1C1E]" />}
                <span>Crear guía</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
