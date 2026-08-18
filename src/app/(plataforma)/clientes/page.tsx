"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Sparkles, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pill } from "@/components/StatusBadge";
import { MarcaDelComercio } from "@/components/MarcaDelComercio";
import { useProfile } from "@/components/ProfileContext";
import { formatCOP } from "@/lib/utils";
import { CIUDADES_OPERADAS } from "@/lib/zones";
import type { Client, Zone } from "@/lib/types";

const EMPTY_FORM = {
  business_name: "",
  nit: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  billing_cycle: "quincenal",
  delivery_rate: "6000",
  return_rate: "3000",
  zone_id: "",
  active: true,
};

export default function ClientsPage() {
  const profile = useProfile();
  // Tarifas y estado de un comercio solo los toca ops: impactan facturación.
  // Va con la lista explícita y no con un "distinto de mensajero" porque la
  // política de UPDATE en at_clients es at_is_ops(), o sea admin y coordinador.
  // Con la negación, el operario veía botones de editar que la base rechazaba.
  // Ver migración 0007.
  const canEdit = ["admin", "coordinador"].includes(profile.role);
  // Eliminar no es editar: se lleva pedidos, facturas y recaudo por delante.
  const esAdmin = profile.role === "admin";
  const [clients, setClients] = useState<Client[] | null>(null);
  // Solo edición: la creación desapareció, los comercios nacen del registro.
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Borrar un comercio pide escribir su nombre. Va en su propio estado y no en
  // el formulario porque no es un dato del comercio: es la confirmación de algo
  // que no tiene vuelta atrás.
  const [borrando, setBorrando] = useState(false);
  const [textoBorrado, setTextoBorrado] = useState("");

  const [zonas, setZonas] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_clients")
      .select("*")
      .order("business_name");
    setClients((data as Client[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZonas((data as Zone[]) ?? []));
  }, [load]);

  function openEdit(c: Client) {
    setBorrando(false);
    setTextoBorrado("");
    setEditing(c);
    setError(null);
    setForm({
      business_name: c.business_name,
      nit: c.nit ?? "",
      contact_name: c.contact_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      billing_cycle: c.billing_cycle,
      delivery_rate: String(c.delivery_rate),
      return_rate: String(c.return_rate),
      zone_id: c.zone_id ?? "",
      active: c.active,
    });
  }

  async function eliminarComercio() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_admin_eliminar_comercio", {
      p_id: editing.id,
      p_confirmacion: textoBorrado.trim(),
      p_motivo: "Eliminado desde Clientes",
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    setBorrando(false);
    setTextoBorrado("");
    load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      business_name: form.business_name,
      nit: form.nit || null,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      city: form.city || null,
      billing_cycle: form.billing_cycle,
      delivery_rate: Number(form.delivery_rate) || 0,
      return_rate: Number(form.return_rate) || 0,
      zone_id: form.zone_id || null,
      active: form.active,
    };
    const { error } = await supabase.from("at_clients").update(payload).eq("id", editing.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    load();
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Clientes e-commerce</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Comercios aliados, tarifas y ciclo de facturación
          </p>
        </div>
        {/* Sin botón de "Nuevo cliente": los e-commerce se registran solos y su
            comercio se crea automáticamente. No hay política de INSERT en at_clients. */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 py-2.5 shrink-0">
          <Sparkles className="w-4 h-4 text-[#ff812c] shrink-0" />
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            Se crean solos al registrarse
          </p>
        </div>
      </div>

      {/* Clients List */}
      {/* Translucida y con blur (probado en vivo: /90 sin blur no se notaba).
          El modal de edición de abajo se queda opaco a propósito. */}
      <div className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
        {clients === null ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando clientes…</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Store className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">Todavía no hay comercios registrados</p>
            <p className="max-w-sm px-6 text-center text-[14px] text-slate-400 dark:text-slate-500">
              Aparecerán aquí solos cuando un e-commerce se registre y su solicitud sea aprobada.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Comercio</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contacto</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ciclo</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">T. Entrega</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">T. Devolución</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                    {canEdit && (
                      <th className="px-5 py-3 text-right text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Editar</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{c.business_name}</p>
                        <p className="text-[12px] text-slate-400 dark:text-slate-500">NIT {c.nit ?? "—"}</p>
                        {/* Sin zona de origen no se le puede aplicar su
                            tarifa real: se le cobra la completa desde el CEDI.
                            Se avisa aquí, que es donde se corrige. */}
                        {!c.zone_id && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                            Sin zona · cobra tarifa completa
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-[14px] text-slate-600 dark:text-slate-400">{c.contact_name ?? "—"}</p>
                        <p className="text-[12px] text-slate-400 dark:text-slate-500">{c.email ?? ""}</p>
                      </td>
                      <td className="px-5 py-3.5 text-[14px] capitalize text-slate-600 dark:text-slate-400">{c.billing_cycle}</td>
                      <td className="px-5 py-3.5 text-[14px] font-medium text-slate-700 dark:text-slate-300">{formatCOP(c.delivery_rate)}</td>
                      <td className="px-5 py-3.5 text-[14px] font-medium text-slate-700 dark:text-slate-300">{formatCOP(c.return_rate)}</td>
                      <td className="px-5 py-3.5">
                        <Pill label={c.active ? "Activo" : "Inactivo"} tone={c.active ? "green" : "red"} />
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => openEdit(c)}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#ff812c] transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {clients.map((c) => (
                <div key={c.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-slate-900 dark:text-white truncate">{c.business_name}</p>
                      <p className="text-[13px] text-slate-400 dark:text-slate-500">NIT {c.nit ?? "—"}</p>
                      {!c.zone_id && (
                        <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                          Sin zona · cobra tarifa completa
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Pill label={c.active ? "Activo" : "Inactivo"} tone={c.active ? "green" : "red"} />
                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#ff812c] transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Contacto</p>
                      <p className="text-[14px] text-slate-600 dark:text-slate-400">{c.contact_name ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Ciclo</p>
                      <p className="text-[14px] capitalize text-slate-600 dark:text-slate-400">{c.billing_cycle}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">T. Entrega</p>
                      <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{formatCOP(c.delivery_rate)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">T. Devolución</p>
                      <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">{formatCOP(c.return_rate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit / New Client Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl max-h-[90dvh] flex flex-col transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">
                Editar {editing.business_name}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 active:opacity-70 transition-opacity text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto flex-1">
              <form onSubmit={save} className="p-5 space-y-5">

                <section>
                  <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Información del Comercio</h3>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Comercio</label>
                      <input
                        required
                        value={form.business_name}
                        onChange={set("business_name")}
                        placeholder="Razón social"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">NIT</label>
                      <input
                        value={form.nit}
                        onChange={set("nit")}
                        placeholder="123456789-0"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </section>

                {/* El logo casi siempre llega por WhatsApp y lo carga el CEDI,
                    no el comercio. El permiso de portada sigue siendo del
                    comercio: aquí solo se registra lo que ya autorizó. */}
                <section>
                  <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Marca</h3>
                  <MarcaDelComercio
                    clientId={editing.id}
                    nombre={editing.business_name}
                    logoUrl={editing.logo_url}
                    enPortada={editing.show_in_landing}
                    onCambio={(c) => {
                      setEditing((e) => (e ? { ...e, ...c } : e));
                      load();
                    }}
                  />
                </section>

                <section>
                  <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Datos de Contacto</h3>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Contacto</label>
                      <input
                        value={form.contact_name}
                        onChange={set("contact_name")}
                        placeholder="Nombre"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Correo</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={set("email")}
                        placeholder="correo@empresa.co"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Teléfono</label>
                      <input
                        value={form.phone}
                        onChange={set("phone")}
                        placeholder="3001234567"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Dirección</label>
                      <input
                        value={form.address}
                        onChange={set("address")}
                        placeholder="Cl 10 #43E-31"
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[90px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Municipio</label>
                      <select
                        value={form.city}
                        onChange={set("city")}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none cursor-pointer"
                      >
                        <option value="">Sin definir</option>
                        {CIUDADES_OPERADAS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Tarifas y Facturación</h3>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                    {/* De aquí sale el precio real de cada domicilio: la tarifa
                        se calcula entre esta zona y la del destinatario. Sin
                        ella se le cobra la tarifa completa desde el CEDI. */}
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Zona origen</label>
                      <select
                        value={form.zone_id}
                        onChange={set("zone_id")}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                      >
                        <option value="">Deducir del municipio</option>
                        {zonas.map((z) => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">Ciclo</label>
                      <select
                        value={form.billing_cycle}
                        onChange={set("billing_cycle")}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                      >
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                      </select>
                    </div>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">T. Entrega</label>
                      <span className="text-slate-400 dark:text-slate-500 mr-1">$</span>
                      <input
                        type="number"
                        min="0"
                        required
                        value={form.delivery_rate}
                        onChange={set("delivery_rate")}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <p className="px-4 py-2 text-[12px] text-slate-400 dark:text-slate-500 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                      * El valor del domicilio se calcula automáticamente según la zona del comercio y la zona del destinatario. La tarifa anterior actúa únicamente como valor base de contingencia.
                    </p>
                    <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                      <label className="w-[110px] text-[15px] text-slate-500 dark:text-slate-400 shrink-0">T. Devolución</label>
                      <span className="text-slate-400 dark:text-slate-500 mr-1">$</span>
                      <input
                        type="number"
                        min="0"
                        required
                        value={form.return_rate}
                        onChange={set("return_rate")}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div
                      className="flex items-center justify-between px-4 min-h-[52px] transition-colors cursor-pointer"
                      onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                    >
                      <label className="text-[16px] text-slate-900 dark:text-white font-medium flex-1 cursor-pointer">Cliente activo</label>
                      <div className={`w-12 h-7 rounded-full transition-colors duration-200 relative shrink-0 ${form.active ? "bg-[#ff812c]" : "bg-gray-300 dark:bg-gray-600"}`}>
                        <div className={`absolute top-[3px] w-[22px] h-[22px] bg-white rounded-full shadow-sm transition-transform duration-200 ${form.active ? "translate-x-[22px]" : "translate-x-[3px]"}`} />
                      </div>
                    </div>
                  </div>
                </section>

                {error && (
                  <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                    <p className="text-[14px] text-rose-600 dark:text-rose-400 text-center font-medium">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="flex-1 flex items-center justify-center bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-[2] flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm disabled:opacity-60"
                  >
                    {busy ? (
                      <div className="w-5 h-5 border-2 border-[#1C1C1E] border-t-transparent rounded-full animate-spin" />
                    ) : null}
                    <span>Guardar</span>
                  </button>
                </div>

                {/* Eliminar el comercio.
                    Solo admin, al final y en texto: es irreversible y se lleva
                    por delante sus pedidos, sus facturas y su historial. No
                    debería competir con Guardar por la mirada.

                    Escribir el nombre no es burocracia: es lo único que
                    distingue «quería borrar este» de «me equivoqué de fila»,
                    y con facturación detrás esa diferencia es cara. La base lo
                    exige también, así que no se puede saltar desde fuera. */}
                {esAdmin && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                    {!borrando ? (
                      <button
                        type="button"
                        onClick={() => setBorrando(true)}
                        className="text-[14px] font-semibold text-rose-600 dark:text-rose-400 active:opacity-70"
                      >
                        Eliminar este comercio
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                          Se borra <strong className="font-semibold text-slate-900 dark:text-white">{editing.business_name}</strong> con
                          todos sus pedidos, facturas y recaudo. Sus usuarios conservan la
                          cuenta pero se quedan sin comercio. No se puede deshacer.
                          <br />
                          Para confirmar, escribe el nombre exacto:
                        </p>
                        <input
                          value={textoBorrado}
                          onChange={(e) => setTextoBorrado(e.target.value)}
                          placeholder={editing.business_name}
                          className="w-full rounded-xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 py-3 text-[16px] text-slate-900 dark:text-white focus:outline-none"
                        />
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setBorrando(false);
                              setTextoBorrado("");
                            }}
                            className="flex-1 min-h-[46px] rounded-xl font-semibold bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-700 dark:text-slate-300"
                          >
                            Mejor no
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy ||
                              textoBorrado.trim().toLowerCase() !==
                                editing.business_name.trim().toLowerCase()
                            }
                            onClick={eliminarComercio}
                            className="flex-1 min-h-[46px] rounded-xl font-bold bg-rose-500 text-white disabled:opacity-40"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

