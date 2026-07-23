"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Route as RouteIcon, Map, Truck, Loader2, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/utils";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import type { Guide, Profile, Zone, GuideStatus } from "@/lib/types";

function RouteBadge({ status }: { status: GuideStatus }) {
  let colorClass = "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300";

  if (status === "reprogramada") {
    colorClass = "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  } else if (status === "en_ruta") {
    colorClass = "bg-[#ff812c]/10 text-[#ff812c] dark:bg-[#ff812c]/15 dark:text-[#ff812c]";
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {GUIDE_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function RoutesPage() {
  const [pending, setPending] = useState<Guide[] | null>(null);
  const [active, setActive] = useState<Guide[] | null>(null);
  const [couriers, setCouriers] = useState<Profile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [courierLoad, setCourierLoad] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Record<string, { courier_id: string; zone_id: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name), at_zones(name)")
        .in("status", ["en_cedi", "reprogramada"])
        .order("received_cedi_at"),
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name), at_zones(name), courier:at_profiles!at_guides_courier_id_fkey(full_name)")
        .in("status", ["zonificada", "en_ruta"])
        .order("updated_at", { ascending: false }),
    ]);
    setPending((p as Guide[]) ?? []);
    setActive((a as Guide[]) ?? []);

    const counts: Record<string, number> = {};
    for (const g of (a as Guide[]) ?? []) {
      if (g.courier_id) counts[g.courier_id] = (counts[g.courier_id] ?? 0) + 1;
    }
    setCourierLoad(counts);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_profiles")
      .select("*")
      .eq("role", "mensajero")
      .eq("active", true)
      .then(({ data }) => setCouriers((data as Profile[]) ?? []));
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, [load]);

  async function assign(guideId: string) {
    const s = sel[guideId];
    if (!s?.courier_id) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_assign_courier", {
      p_guide_id: guideId,
      p_courier_id: s.courier_id,
      p_zone_id: s.zone_id || null,
    });
    setBusy(false);
    if (error) setMsg(error.message);
    load();
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Picking y ruteo</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Fase 3: zonificación de paquetes y carga al perfil digital del mensajero
        </p>
      </div>

      {msg && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
          <p className="text-[14px] text-rose-600 dark:text-rose-400 font-medium">{msg}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Pending Assignment Card */}
        <section className="space-y-3">
          <h2 className="text-[17px] font-semibold text-slate-800 dark:text-white px-1">
            Por zonificar <span className="text-slate-500 dark:text-slate-400 font-normal">({pending?.length ?? "…"})</span>
          </h2>
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-colors duration-300">
            {pending === null ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
                <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
                <p className="text-[15px]">Cargando guías…</p>
              </div>
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Map className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay guías en CEDI por asignar</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {pending.map((g) => (
                  <li key={g.id} className="p-4 sm:p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-slate-900 dark:text-white hover:underline active:opacity-70 transition-opacity">
                          {g.guide_number}
                        </Link>
                        <p className="text-[14px] text-slate-500 dark:text-slate-300 mt-1">
                          {g.recipient_address} · {g.at_zones?.name ?? "sin zona"}
                          {g.is_cod && ` · COD ${formatCOP(g.cod_amount)}`}
                        </p>
                      </div>
                      <RouteBadge status={g.status} />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 bg-transparent dark:bg-[#3A3A3C] border border-slate-300 dark:border-slate-500 rounded-lg overflow-hidden min-h-[48px] flex items-center px-3 focus-within:border-[#ff812c] transition-colors">
                        <select
                          value={sel[g.id]?.courier_id ?? ""}
                          onChange={(e) =>
                            setSel((s) => ({
                              ...s,
                              [g.id]: { courier_id: e.target.value, zone_id: s[g.id]?.zone_id ?? "" },
                            }))
                          }
                          className="w-full bg-transparent text-[15px] text-slate-900 dark:text-white focus:outline-none appearance-none"
                        >
                          <option value="" className="text-slate-500 dark:text-slate-400">Mensajero…</option>
                          {couriers.map((c) => {
                            const load = courierLoad[c.id] ?? 0;
                            const atLimit = load >= c.max_capacity;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.full_name} ({load}/{c.max_capacity}{atLimit ? " · al límite" : ""})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="flex-1 bg-transparent dark:bg-[#3A3A3C] border border-slate-300 dark:border-slate-500 rounded-lg overflow-hidden min-h-[48px] flex items-center px-3 focus-within:border-[#ff812c] transition-colors">
                        <select
                          value={sel[g.id]?.zone_id ?? ""}
                          onChange={(e) =>
                            setSel((s) => ({
                              ...s,
                              [g.id]: { courier_id: s[g.id]?.courier_id ?? "", zone_id: e.target.value },
                            }))
                          }
                          className="w-full bg-transparent text-[15px] text-slate-900 dark:text-white focus:outline-none appearance-none"
                        >
                          <option value="" className="text-slate-500 dark:text-slate-400">Zona…</option>
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        disabled={busy || !sel[g.id]?.courier_id}
                        onClick={() => assign(g.id)}
                        className="min-h-[48px] px-4 rounded-lg font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RouteIcon className="w-4 h-4" />}
                        <span>Asignar</span>
                      </button>
                    </div>
                    {sel[g.id]?.courier_id &&
                      (courierLoad[sel[g.id].courier_id] ?? 0) >=
                        (couriers.find((c) => c.id === sel[g.id].courier_id)?.max_capacity ?? Infinity) && (
                        <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                          Este mensajero ya está en su capacidad máxima. Puedes asignar igual, pero revisa su carga.
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Active Operations Card */}
        <section className="space-y-3">
          <h2 className="text-[17px] font-semibold text-slate-800 dark:text-white px-1">
            En operación <span className="text-slate-500 dark:text-slate-400 font-normal">({active?.length ?? "…"})</span>
          </h2>
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-colors duration-300">
            {active === null ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
                <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
                <p className="text-[15px]">Cargando operaciones…</p>
              </div>
            ) : active.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay guías zonificadas o en ruta</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {active.map((g) => (
                  <li key={g.id} className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-slate-900 dark:text-white hover:underline active:opacity-70 transition-opacity">
                        {g.guide_number}
                      </Link>
                      <p className="text-[14px] text-slate-500 dark:text-slate-300 mt-1">
                        {g.courier?.full_name ?? "—"} · {g.at_zones?.name ?? "sin zona"} ·{" "}
                        {g.at_clients?.business_name}
                      </p>
                    </div>
                    <div className="self-start sm:self-auto">
                      <RouteBadge status={g.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
