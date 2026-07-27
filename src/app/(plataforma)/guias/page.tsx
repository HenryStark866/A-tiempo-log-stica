"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Map, Trash2, Edit2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatCOP, formatDateTime } from "@/lib/utils";
import type { Guide, GuideStatus } from "@/lib/types";

function GuideBadge({ status }: { status: GuideStatus }) {
  let colorClass = "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400";

  if (status === "en_ruta") {
    colorClass = "bg-[#ff812c]/10 text-[#ff812c] dark:bg-[#ff812c]/15 dark:text-[#ff812c]";
  } else if (status === "entregada") {
    colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  } else if (status === "novedad" || status === "reprogramada") {
    colorClass = "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  } else if (status === "en_devolucion" || status === "devuelta" || status === "cancelada") {
    colorClass = "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400";
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {GUIDE_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function GuidesPage() {
  const profile = useProfile();
  const esCliente = profile.role === "cliente";
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GuideStatus | "todas">("todas");
  const [deleteTarget, setDeleteTarget] = useState<Guide | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let q = supabase
      .from("at_guides")
      .select(
        "*, at_clients(business_name), at_zones(name), courier:at_profiles!at_guides_courier_id_fkey(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "todas") q = q.eq("status", status);
    const { data } = await q;
    setGuides((data as Guide[]) ?? []);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete(guide: Guide) {
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_delete_guide", { p_guide_id: guide.id });
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
    } else {
      setDeleteTarget(null);
      load();
    }
  }

  const filtered = (guides ?? []).filter((g) => {
    const s = query.toLowerCase();
    return (
      !s ||
      g.guide_number.toLowerCase().includes(s) ||
      g.recipient_name.toLowerCase().includes(s) ||
      (g.at_clients?.business_name ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Guías</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Trazabilidad completa de cada paquete
          </p>
        </div>

        {esCliente && (
          <Link href="/guias/nueva" className="shrink-0">
            <button className="min-h-[48px] px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform w-full md:w-auto">
              <Plus className="w-5 h-5" />
              <span>Nueva guía</span>
            </button>
          </Link>
        )}
      </div>

      {/* Filter Card */}
      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-4 transition-colors duration-300">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por guía, cliente o comercio…"
            className="w-full min-h-[48px] pl-11 pr-4 bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white dark:placeholder-slate-500 focus:outline-none focus:border-[#ff812c] dark:focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] transition-all"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as GuideStatus | "todas")}
          className="min-h-[48px] px-4 bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent dark:border-slate-700 rounded-xl text-[15px] text-slate-900 dark:text-white focus:outline-none focus:border-[#ff812c] dark:focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] transition-all md:min-w-[200px]"
        >
          <option value="todas">Todos los estados</option>
          {Object.entries(GUIDE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Table Card */}
      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
        {guides === null ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando guías…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Map className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay guías que coincidan con el filtro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/50 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Guía</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Comercio</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Zona</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">COD</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Creada</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filtered.map((g) => (
                  <tr key={g.id} className="hover:bg-[#F2F2F7]/30 dark:hover:bg-[#1C1C1E]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <Link
                        href={`/guias/${g.id}`}
                        className="text-[16px] font-bold text-[#ff812c] dark:text-white dark:group-hover:text-[#ff812c] transition-colors hover:underline"
                      >
                        {g.guide_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-[15px] font-medium text-slate-700 dark:text-slate-300">
                      {g.at_clients?.business_name ?? "—"}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-[15px] text-slate-900 dark:text-white">{g.recipient_name}</p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{g.recipient_address}</p>
                    </td>
                    <td className="px-6 py-4 text-[15px] text-slate-700 dark:text-slate-300">
                      {g.at_zones?.name ?? "—"}
                    </td>
                    <td className="px-6 py-4 font-medium text-[15px] text-slate-700 dark:text-slate-300">
                      {g.is_cod ? formatCOP(g.cod_amount) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <GuideBadge status={g.status} />
                    </td>
                    <td className="px-6 py-4 text-[14px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(g.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      {g.status === "creada" && (
                        <div className="flex items-center gap-2">
                          <Link href={`/guias/${g.id}/editar`} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-[#ff812c]">
                            <Edit2 className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => { setDeleteError(null); setDeleteTarget(g); }}
                            className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg text-slate-400 hover:text-rose-500"
                            title="Eliminar guía"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmación eliminar */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-[17px]">Eliminar guía</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">{deleteTarget.guide_number}</p>
              </div>
            </div>
            <p className="text-[15px] text-slate-700 dark:text-slate-300 mb-1">
              ¿Seguro que quieres eliminar esta guía? Esta acción no se puede deshacer.
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
              Destinatario: <strong>{deleteTarget.recipient_name}</strong>
            </p>
            {deleteError && (
              <p className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
                {deleteError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 min-h-[48px] rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-semibold active:scale-[0.98] transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmDelete(deleteTarget)}
                disabled={deleting}
                className="flex-1 min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
