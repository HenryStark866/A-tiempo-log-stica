"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackagePlus, ChevronLeft, MapPin, Phone, User, Store, Banknote, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import type { Client, Zone } from "@/lib/types";

export default function NewGuidePage() {
  const router = useRouter();
  const profile = useProfile();
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "Medellín",
    zone_id: "",
    declared_value: "",
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
        if (profile.role === "cliente" && profile.client_id) {
          setForm((f) => ({ ...f, client_id: profile.client_id! }));
        } else if (list.length) {
          setForm((f) => ({ ...f, client_id: f.client_id || list[0].id }));
        }
      });
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
        declared_value: Number(form.declared_value) || 0,
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
    router.push(`/guias/${data.id}`);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
          
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Información de Envío</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
              
              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Store className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <select
                  required
                  value={form.client_id}
                  onChange={set("client_id")}
                  disabled={profile.role === "cliente"}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none disabled:opacity-60"
                >
                  <option value="" disabled>Cliente e-commerce...</option>
                  {clients.map((c) => (
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
                  onChange={set("zone_id")}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                >
                  <option value="">(Se define en el CEDI)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>

            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Detalles de Valor</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
              
              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[140px] text-[16px] text-slate-900 dark:text-white shrink-0">Valor Declarado</label>
                <span className="text-slate-400 dark:text-slate-500 mr-2">$</span>
                <input
                  type="number"
                  min="0"
                  value={form.declared_value}
                  onChange={set("declared_value")}
                  placeholder="0"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

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
