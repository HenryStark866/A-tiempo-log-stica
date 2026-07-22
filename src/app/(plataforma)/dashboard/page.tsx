"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  Bike,
  Clock,
  PackageCheck,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatCOP } from "@/lib/utils";
import type { DashboardKpis, GuideStatus } from "@/lib/types";

const ORDER: GuideStatus[] = [
  "creada",
  "recogida",
  "en_cedi",
  "zonificada",
  "en_ruta",
  "entregada",
  "novedad",
  "reprogramada",
  "en_devolucion",
  "devuelta",
  "cancelada",
];

const BAR_COLORS: Record<GuideStatus, string> = {
  // Estados Pasivos / En Espera (Grises limpios)
  creada: "bg-slate-300 dark:bg-slate-600",
  recogida: "bg-slate-400 dark:bg-slate-500",
  en_cedi: "bg-slate-400 dark:bg-slate-500",
  zonificada: "bg-slate-500 dark:bg-slate-400",

  // Estado Activo / En Movimiento (Naranja de Marca)
  en_ruta: "bg-[#ff812c]",

  // Éxito (Verde)
  entregada: "bg-emerald-500 dark:bg-emerald-600",

  // Alertas / Precaución (Ámbar/Amarillo)
  novedad: "bg-amber-500 dark:bg-amber-600",
  reprogramada: "bg-amber-500 dark:bg-amber-600",

  // Fallos / Detenidos (Rojo/Rosa)
  en_devolucion: "bg-rose-500 dark:bg-rose-600",
  devuelta: "bg-rose-600 dark:bg-rose-700",
  cancelada: "bg-red-500 dark:bg-red-600",
};

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-6 shadow-sm transition-colors duration-300 flex flex-col justify-between h-full">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">{label}</p>
          <p className="mt-2 text-[32px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
            {value}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[#ff812c]/10 dark:bg-[#ff812c]/20 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-[#ff812c]" />
        </div>
      </div>
      {hint && <p className="mt-4 text-[13px] text-slate-500 dark:text-slate-500 font-medium leading-snug">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("at_dashboard_kpis").then(({ data }) => {
      if (data) setKpis(data as DashboardKpis);
    });
  }, []);

  if (!kpis) {
    return (
      <div className="pb-10 space-y-6 font-sans">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Dashboard operativo</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Métricas clave del flujograma: recogida, CEDI, última milla y recaudo
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[15px]">Cargando métricas…</p>
        </div>
      </div>
    );
  }

  const total = ORDER.reduce((acc, s) => acc + (kpis.by_status[s] ?? 0), 0);
  const max = Math.max(1, ...ORDER.map((s) => kpis.by_status[s] ?? 0));

  return (
    <div className="pb-10 space-y-8 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Dashboard operativo</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Métricas clave del flujograma: recogida, CEDI, última milla y recaudo
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icon={PackagePlus}
          label="Guías creadas hoy"
          value={String(kpis.guides_today)}
        />
        <Kpi
          icon={PackageCheck}
          label="Entregadas hoy"
          value={String(kpis.delivered_today)}
        />
        <Kpi
          icon={Clock}
          label="Lead Time de Recogida (LTR)"
          value={kpis.ltr_hours != null ? `${kpis.ltr_hours} h` : "—"}
          hint="Promedio solicitud → digitalización (30 días)"
        />
        <Kpi
          icon={RotateCcw}
          label="Tasa de Logística Inversa (TLI)"
          value={kpis.tli_pct != null ? `${kpis.tli_pct}%` : "—"}
          hint="% de guías finalizadas en devolución (30 días)"
        />
        <Kpi
          icon={Banknote}
          label="Recaudo por consignar"
          value={formatCOP(kpis.cod_pending)}
          hint={`${kpis.settlements_pending} cierre(s) de caja en proceso`}
        />
        <Kpi
          icon={Bike}
          label="Mensajeros con carga activa"
          value={String(kpis.active_couriers)}
        />
      </div>

      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-6 sm:p-8 shadow-sm transition-colors duration-300">
        <h2 className="text-[20px] font-bold text-slate-900 dark:text-white">Guías por estado</h2>
        <p className="mt-1 mb-8 text-[15px] text-slate-500 dark:text-slate-400 font-medium">{total} guías en total</p>

        <div className="space-y-4">
          {ORDER.map((s) => {
            const n = kpis.by_status[s] ?? 0;
            if (n === 0) return null;
            return (
              <div key={s} className="flex items-center gap-4">
                <span className="w-32 shrink-0 text-[14px] font-semibold text-slate-600 dark:text-slate-400">
                  {GUIDE_STATUS_LABELS[s]}
                </span>
                <div className="h-7 flex-1 overflow-hidden rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E]">
                  <div
                    className={`h-full rounded-xl transition-all duration-500 ease-out ${BAR_COLORS[s]}`}
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[15px] font-bold text-slate-900 dark:text-white">
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
