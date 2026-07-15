"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, Loading, Empty, Button, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatCOP, formatDateTime } from "@/lib/utils";
import type { Guide, GuideStatus } from "@/lib/types";

export default function GuidesPage() {
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GuideStatus | "todas">("todas");

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
    <>
      <PageHeader
        title="Guías"
        subtitle="Trazabilidad completa de cada paquete"
        actions={
          <Link href="/guias/nueva">
            <Button>
              <Plus className="size-4" /> Nueva guía
            </Button>
          </Link>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por guía, destinatario o cliente…"
            className={inputCls + " pl-9"}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as GuideStatus | "todas")}
          className={inputCls + " w-auto"}
        >
          <option value="todas">Todos los estados</option>
          {Object.entries(GUIDE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        {guides === null ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty label="No hay guías que coincidan con el filtro" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Guía</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Destinatario</th>
                  <th className="px-5 py-3">Zona</th>
                  <th className="px-5 py-3">COD</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Creada</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/guias/${g.id}`}
                        className="font-bold text-brand-600 hover:underline"
                      >
                        {g.guide_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {g.at_clients?.business_name ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy-900">{g.recipient_name}</p>
                      <p className="text-xs text-slate-400">{g.recipient_address}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {g.at_zones?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {g.is_cod ? formatCOP(g.cod_amount) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDateTime(g.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
