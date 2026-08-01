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
  Search,
  X,
  Upload,
  Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useMyClient } from "@/components/useMyClient";
import { PriceList } from "@/components/PriceList";
import { formatCOP } from "@/lib/utils";
import { zoneForText } from "@/lib/zones";
import type { Client, Zone, Recipient, Product } from "@/lib/types";

export default function NewGuidePage() {
  const router = useRouter();
  const profile = useProfile();
  const esCliente = profile.role === "cliente";
  // Autoaprovisiona el comercio: una cuenta cliente nunca queda bloqueada.
  const { client: miComercio, clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();

  const [clients, setClients] = useState<Client[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [buscador, setBuscador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  // Zonas y tarifas: el cliente ve el listado de precios completo.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, []);

  // Comercios: el cliente no elige, se le carga el suyo automáticamente.
  useEffect(() => {
    if (esCliente) {
      if (clientId) setForm((f) => ({ ...f, client_id: clientId }));
      return;
    }
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        if (list.length) setForm((f) => ({ ...f, client_id: f.client_id || list[0].id }));
      });
  }, [esCliente, clientId]);

  // Clientes guardados del comercio (si ya sincronizó su base).
  useEffect(() => {
    if (!clientId) return;
    const supabase = createClient();
    supabase
      .from("at_recipients")
      .select("*, at_zones(name)")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("times_used", { ascending: false })
      .order("full_name")
      .limit(1000)
      .then(({ data }) => setRecipients((data as Recipient[]) ?? []));
  }, [clientId]);

  // Catálogo de productos del comercio
  useEffect(() => {
    const cid = esCliente ? clientId : form.client_id;
    if (!cid) return;
    const supabase = createClient();
    supabase
      .from("at_products")
      .select("*")
      .eq("client_id", cid)
      .eq("active", true)
      .order("name")
      .limit(500)
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, [esCliente, clientId, form.client_id]);

  // Sugerencia de zona por dirección/ciudad mientras no la fijen a mano.
  useEffect(() => {
    if (zonaManual || zones.length === 0) return;
    const z = zoneForText(zones, `${form.recipient_city} ${form.recipient_address}`);
    setForm((f) => (f.zone_id === (z?.id ?? "") ? f : { ...f, zone_id: z?.id ?? "" }));
  }, [form.recipient_city, form.recipient_address, zones, zonaManual]);

  const zonaElegida = zones.find((z) => z.id === form.zone_id) ?? null;

  const nombreComercio = esCliente
    ? miComercio?.business_name ?? ""
    : clients?.find((c) => c.id === form.client_id)?.business_name ?? "";

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
    setZonaManual(true);
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

    if (!form.client_id) {
      setError("Todavía estamos preparando tu comercio. Espera un segundo y vuelve a intentar.");
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

    // Contador de uso: ordena los destinatarios por los más frecuentes.
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

  if (esCliente && cargandoComercio) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[15px]">Preparando tu comercio…</p>
      </div>
    );
  }

  // Admin/Staff no crean guías directamente, las gestionan.
  if (!esCliente) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] py-4">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm border border-slate-200 dark:border-slate-800">
          <PackagePlus className="mx-auto mb-4 size-10 text-slate-400" />
          <h2 className="text-[19px] font-bold text-slate-900 dark:text-white">Creación de guías reservada a comercios</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Los administradores de A Tiempo Logística gestionan el flujo operativo, pero no crean guías directamente. Cada guía es registrada por el comercio correspondiente.
          </p>
          <Link
            href="/guias"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Ver guías existentes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 max-w-2xl mx-auto w-full font-sans">
      <div className="relative flex items-center justify-between px-4 py-4 mb-2">
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

        {errorComercio && (
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
            <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{errorComercio}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Catálogo de Productos */}
          {products.length > 0 && (
            <section>
              <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#ff812c]" />
                Catálogo de Productos ({products.length})
              </h3>
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm p-4 space-y-3 transition-colors duration-300">
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Selecciona un producto para autocompletar su valor y descripción:
                </p>
                <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
                  {products.map((p) => {
                    const seleccionado = selectedProductId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (seleccionado) {
                            setSelectedProductId(null);
                          } else {
                            setSelectedProductId(p.id);
                            const notaProd = `${p.name}${p.sku ? ` (SKU: ${p.sku})` : ""}${p.description ? ` - ${p.description}` : ""}`;
                            setForm((f) => ({
                              ...f,
                              is_cod: true,
                              cod_amount: String(p.price ?? 0),
                              notes: f.notes ? `${f.notes}\n${notaProd}` : notaProd,
                            }));
                          }
                        }}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          seleccionado
                            ? "border-[#ff812c] bg-[#ff812c]/10 text-slate-900 dark:text-white"
                            : "border-slate-200 dark:border-slate-700 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50 hover:border-[#ff812c]/50 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-[14px] text-slate-900 dark:text-white line-clamp-1">{p.name}</p>
                          <span className="font-bold text-[14px] text-[#ff812c] shrink-0">
                            {formatCOP(p.price)}
                          </span>
                        </div>
                        {p.sku && (
                          <p className="text-[12px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            SKU: {p.sku}
                          </p>
                        )}
                        {p.description && (
                          <p className="text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {p.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Clientes guardados, o invitación a sincronizar si no hay */}
          {esCliente && (
            <section>
              <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
                Mis clientes
              </h3>
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
                {recipients.length === 0 ? (
                  <div className="px-4 py-4 space-y-3">
                    <p className="text-[14px] text-slate-500 dark:text-slate-400">
                      Puedes escribir los datos a mano abajo, o subir tu base de compradores una
                      sola vez para que se autocompleten.
                    </p>
                    <Link
                      href="/destinatarios"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 min-h-[44px] text-[15px] font-semibold text-[#ff812c] active:scale-[0.98] transition-transform"
                    >
                      <Upload className="w-4 h-4" /> Subir mi base de clientes
                    </Link>
                  </div>
                ) : recipientId ? (
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
                        placeholder={`Buscar entre ${recipients.length} cliente(s)…`}
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

              {/* El comercio que crea la guía se carga solo; el cliente no lo elige. */}
              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800">
                <Store className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                {esCliente ? (
                  <div className="flex-1 min-w-0 py-3">
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 leading-none">Comercio remitente</p>
                    <p className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white truncate">
                      {nombreComercio || "…"}
                    </p>
                  </div>
                ) : (
                  <select
                    required
                    value={form.client_id}
                    onChange={set("client_id")}
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                  >
                    <option value="" disabled>Cliente e-commerce...</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.business_name}</option>
                    ))}
                  </select>
                )}
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

          <PriceList zones={zones} activeZoneId={form.zone_id || null} />

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
