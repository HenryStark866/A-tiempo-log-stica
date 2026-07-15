"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Route as RouteIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, Loading, Empty, Button, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCOP } from "@/lib/utils";
import type { Guide, Profile, Zone } from "@/lib/types";

export default function RoutesPage() {
  const [pending, setPending] = useState<Guide[] | null>(null);
  const [active, setActive] = useState<Guide[] | null>(null);
  const [couriers, setCouriers] = useState<Profile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
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
    <>
      <PageHeader
        title="Picking y ruteo"
        subtitle="Fase 3: zonificación de paquetes y carga al perfil digital del mensajero"
      />

      {msg && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          {msg}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-bold text-navy-900">
            Por zonificar ({pending?.length ?? "…"})
          </h2>
          {pending === null ? (
            <Loading />
          ) : pending.length === 0 ? (
            <Empty label="No hay guías en CEDI por asignar" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((g) => (
                <li key={g.id} className="py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <Link href={`/guias/${g.id}`} className="font-bold text-brand-600 hover:underline">
                        {g.guide_number}
                      </Link>{" "}
                      <StatusBadge status={g.status} />
                      <p className="text-sm text-slate-500">
                        {g.recipient_address} · {g.at_zones?.name ?? "sin zona"}
                        {g.is_cod && ` · COD ${formatCOP(g.cod_amount)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={sel[g.id]?.courier_id ?? ""}
                      onChange={(e) =>
                        setSel((s) => ({
                          ...s,
                          [g.id]: { courier_id: e.target.value, zone_id: s[g.id]?.zone_id ?? "" },
                        }))
                      }
                      className={inputCls + " w-auto flex-1"}
                    >
                      <option value="">Mensajero…</option>
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sel[g.id]?.zone_id ?? ""}
                      onChange={(e) =>
                        setSel((s) => ({
                          ...s,
                          [g.id]: { courier_id: s[g.id]?.courier_id ?? "", zone_id: e.target.value },
                        }))
                      }
                      className={inputCls + " w-auto flex-1"}
                    >
                      <option value="">Zona…</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={busy || !sel[g.id]?.courier_id}
                      onClick={() => assign(g.id)}
                      className="px-3"
                    >
                      <RouteIcon className="size-4" /> Asignar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-bold text-navy-900">
            En operación ({active?.length ?? "…"})
          </h2>
          {active === null ? (
            <Loading />
          ) : active.length === 0 ? (
            <Empty label="No hay guías zonificadas o en ruta" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {active.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/guias/${g.id}`} className="font-bold text-brand-600 hover:underline">
                      {g.guide_number}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {g.courier?.full_name ?? "—"} · {g.at_zones?.name ?? "sin zona"} ·{" "}
                      {g.at_clients?.business_name}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
