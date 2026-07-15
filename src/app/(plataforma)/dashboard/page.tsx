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
import { PageHeader, Card, Loading } from "@/components/ui";
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
  creada: "bg-slate-400",
  recogida: "bg-sky-400",
  en_cedi: "bg-indigo-400",
  zonificada: "bg-violet-400",
  en_ruta: "bg-blue-500",
  entregada: "bg-emerald-500",
  novedad: "bg-amber-500",
  reprogramada: "bg-orange-400",
  en_devolucion: "bg-rose-400",
  devuelta: "bg-red-400",
  cancelada: "bg-gray-300",
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
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-navy-900">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="size-5" />
        </span>
      </div>
    </Card>
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
      <>
        <PageHeader title="Dashboard" subtitle="Métricas operativas del flujo" />
        <Loading />
      </>
    );
  }

  const total = ORDER.reduce((acc, s) => acc + (kpis.by_status[s] ?? 0), 0);
  const max = Math.max(1, ...ORDER.map((s) => kpis.by_status[s] ?? 0));

  return (
    <>
      <PageHeader
        title="Dashboard operativo"
        subtitle="Métricas clave del flujograma: recogida, CEDI, última milla y recaudo"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <Card className="mt-6 p-6">
        <h2 className="mb-1 font-bold text-navy-900">Guías por estado</h2>
        <p className="mb-5 text-sm text-slate-500">{total} guías en total</p>
        <div className="space-y-3">
          {ORDER.map((s) => {
            const n = kpis.by_status[s] ?? 0;
            if (n === 0) return null;
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm font-medium text-slate-600">
                  {GUIDE_STATUS_LABELS[s]}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
                  <div
                    className={`h-full rounded-lg ${BAR_COLORS[s]}`}
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-bold text-navy-900">
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
