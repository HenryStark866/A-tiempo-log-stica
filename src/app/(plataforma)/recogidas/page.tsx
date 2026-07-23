"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, PackageOpen, Loader2, MessageCircle, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PICKUP_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Client, Pickup, PickupStatus } from "@/lib/types";

const MIN_PACKAGES = 5;

function whatsappUrl(phone: string, businessName: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `57${digits}` : digits;
  const text = encodeURIComponent(`Hola, te escribimos de A Tiempo Logística sobre la recogida de ${businessName}.`);
  return `https://wa.me/${withCountry}?text=${text}`;
}

function PickupBadge({ status }: { status: PickupStatus }) {
  let colorClass = "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400";

  if (status === "asignada") {
    colorClass = "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  } else if (status === "completada") {
    colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  } else if (status === "cancelada") {
    colorClass = "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400";
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {PICKUP_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function PickupsPage() {
  const profile = useProfile();
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [completing, setCompleting] = useState<Pickup | null>(null);
  const [packageCount, setPackageCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    address: "",
    contact_name: "",
    contact_phone: "",
    notes: "",
  });

  const isStaff = ["admin", "coordinador", "operario"].includes(profile.role);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_pickups")
      .select("*, at_clients(business_name), operator:at_profiles!at_pickups_operator_id_fkey(full_name)")
      .order("requested_at", { ascending: false })
      .limit(100);
    setPickups((data as Pickup[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        setForm((f) => ({
          ...f,
          client_id: profile.role === "cliente" ? profile.client_id ?? "" : list[0]?.id ?? "",
          address: profile.role === "cliente" ? list[0]?.address ?? "" : "",
        }));
      });
  }, [load, profile]);

  async function createPickup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("at_pickups").insert({
      client_id: form.client_id,
      scheduled_date: form.scheduled_date,
      address: form.address,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
      created_by: profile.id,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShowNew(false);
    load();
  }

  async function assignToMe(p: Pickup) {
    const supabase = createClient();
    await supabase
      .from("at_pickups")
      .update({ status: "asignada", operator_id: profile.id })
      .eq("id", p.id);
    load();
  }

  async function completePickup() {
    if (!completing) return;
    setBusy(true);
    const supabase = createClient();
    const count = packageCount.trim() ? Number(packageCount) : null;
    await supabase
      .from("at_pickups")
      .update({
        status: "completada",
        completed_at: new Date().toISOString(),
        package_count: count,
      })
      .eq("id", completing.id);
    setBusy(false);
    setCompleting(null);
    setPackageCount("");
    load();
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Recogidas</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400 max-w-lg">
            Fase 1: solicitudes de recogida en el comercio del cliente
          </p>
        </div>

        <button
          onClick={() => setShowNew(true)}
          className="min-h-[48px] px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span>Solicitar recogida</span>
        </button>
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        {pickups === null ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando recogidas…</p>
          </div>
        ) : pickups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <PackageOpen className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay recogidas registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fecha</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dirección</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Operario</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                  {isStaff && <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {pickups.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F2F2F7]/30 dark:hover:bg-[#1C1C1E]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-[16px] text-slate-900 dark:text-white">{p.at_clients?.business_name}</p>
                      {p.notes && <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">{p.notes}</p>}
                    </td>
                    <td className="px-6 py-4 text-[15px] font-medium text-slate-700 dark:text-slate-200">
                      {formatDate(p.scheduled_date)}
                    </td>
                    <td className="px-6 py-4 text-[15px] text-slate-700 dark:text-slate-200">
                      {p.address}
                    </td>
                    <td className="px-6 py-4 text-[15px] text-slate-700 dark:text-slate-200">
                      {p.operator?.full_name ?? "—"}
                    </td>
                    <td className="px-6 py-4">
                      <PickupBadge status={p.status} />
                      {p.completed_at && (
                        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{formatDateTime(p.completed_at)}</p>
                      )}
                      {p.status === "completada" && p.package_count !== null && (
                        <p className={`mt-1 text-[13px] font-medium flex items-center gap-1 ${
                          p.package_count < MIN_PACKAGES ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                        }`}>
                          {p.package_count < MIN_PACKAGES && <TriangleAlert className="w-3.5 h-3.5 shrink-0" />}
                          {p.package_count} paquete{p.package_count === 1 ? "" : "s"}
                          {p.package_count < MIN_PACKAGES && ` · bajo el mínimo (${MIN_PACKAGES})`}
                        </p>
                      )}
                    </td>
                    {isStaff && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.contact_phone && (
                            <a
                              href={whatsappUrl(p.contact_phone, p.at_clients?.business_name ?? "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#25D366]/10 text-[#1C7F45] dark:text-[#34C759] hover:bg-[#25D366]/20 active:scale-95 transition-all shrink-0"
                              title="Coordinar vía WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4 fill-[#25D366] text-[#25D366]" />
                            </a>
                          )}
                          {p.status === "pendiente" && (
                            <button
                              onClick={() => assignToMe(p)}
                              className="inline-flex items-center min-h-[40px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-95 transition-all"
                            >
                              Asignarme
                            </button>
                          )}
                          {p.status === "asignada" && (
                            <button
                              onClick={() => setCompleting(p)}
                              className="inline-flex items-center min-h-[40px] px-4 rounded-xl font-semibold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-95 transition-all"
                            >
                              Completar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Pickup Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">

            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between sticky top-0 bg-[#FFFFFF] dark:bg-[#2C2C2E] z-10">
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white pr-4">Solicitar recogida</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createPickup} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Cliente
                </label>
                <select
                  required
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                  disabled={profile.role === "cliente"}
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all disabled:opacity-50"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.business_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Fecha programada
                  </label>
                  <input
                    type="date"
                    required
                    value={form.scheduled_date}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                    className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Teléfono de contacto
                  </label>
                  <input
                    value={form.contact_phone}
                    onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                    className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Dirección de recogida
                </label>
                <input
                  required
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Notas
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Cantidad estimada de paquetes, horario…"
                  className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg p-4 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all resize-none"
                />
              </div>

              {error && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-100 dark:border-rose-500/20">
                  <p className="text-[14px] text-rose-700 dark:text-rose-400 font-medium leading-snug">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 min-h-[52px] rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform border border-slate-200 dark:border-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Solicitar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completar Recogida Modal */}
      {completing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white pr-4">Completar recogida</h3>
                <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  {completing.at_clients?.business_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompleting(null);
                  setPackageCount("");
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Paquetes contados en el punto
                </label>
                <input
                  type="number"
                  min={0}
                  value={packageCount}
                  onChange={(e) => setPackageCount(e.target.value)}
                  placeholder={`Mínimo esperado: ${MIN_PACKAGES}`}
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-slate-300 dark:border-slate-700 focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-lg px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                />
                {packageCount.trim() !== "" && Number(packageCount) < MIN_PACKAGES && (
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                    Bajo el mínimo de {MIN_PACKAGES}. Se completará igual — queda registrado para seguimiento comercial.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompleting(null);
                    setPackageCount("");
                  }}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  disabled={busy}
                  onClick={completePickup}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
