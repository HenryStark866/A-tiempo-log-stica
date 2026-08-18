"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import {
  OPS_ROLES,
  ROLE_LABELS,
  SECURITY_EVENT_LABELS,
  SECURITY_SEVERITY_LABELS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { SecurityEvent, SecurityEventType, SecuritySeverity } from "@/lib/types";

const PAGE_SIZE = 50;

const SEVERITY_TONE: Record<SecuritySeverity, "slate" | "amber" | "red"> = {
  info: "slate",
  advertencia: "amber",
  critico: "red",
};

export default function SecurityPage() {
  const yo = useProfile();
  const esOps = OPS_ROLES.includes(yo.role);

  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [tipo, setTipo] = useState<SecurityEventType | "">("");
  const [severidad, setSeveridad] = useState<SecuritySeverity | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!esOps) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    let query = supabase
      .from("at_security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (tipo) query = query.eq("event_type", tipo);
    if (severidad) query = query.eq("severity", severidad);

    const { data, error: err } = await query;
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const filas = (data as SecurityEvent[]) ?? [];
    setEvents(filas);

    // actor_id apunta a auth.users, no a at_profiles: no hay embed automático
    // por PostgREST. Se resuelve el nombre aparte, solo para los ids que
    // aparecen en esta página.
    const ids = [...new Set(filas.map((f) => f.actor_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: perfiles } = await supabase
        .from("at_profiles")
        .select("id, full_name")
        .in("id", ids);
      setActorNames(
        Object.fromEntries((perfiles ?? []).map((p) => [p.id as string, p.full_name as string]))
      );
    } else {
      setActorNames({});
    }
  }, [esOps, tipo, severidad]);

  useEffect(() => {
    load();
  }, [load]);

  // La política de SELECT en la base ya es at_is_ops(): un operario o
  // mensajero que entre por la URL vería la tabla vacía, sin explicación.
  // Este corte evita esa confusión.
  if (!esOps) {
    return (
      <div className="pb-10 font-sans">
        <PageHeader title="Seguridad" />
        <p className="text-[15px] text-slate-500 dark:text-slate-400">
          Solo un administrador o coordinador ve el registro de seguridad.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      <PageHeader
        title="Registro de seguridad"
        subtitle="Acciones sensibles y credenciales fallidas. Nadie puede editar ni borrar estas filas, ni siquiera desde aquí."
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as SecurityEventType | "")}
          className="rounded-xl border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#2C2C2E] px-3 py-2 text-[14px] text-slate-700 dark:text-slate-200"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(SECURITY_EVENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={severidad}
          onChange={(e) => setSeveridad(e.target.value as SecuritySeverity | "")}
          className="rounded-xl border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#2C2C2E] px-3 py-2 text-[14px] text-slate-700 dark:text-slate-200"
        >
          <option value="">Toda severidad</option>
          {Object.entries(SECURITY_SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-100 dark:border-rose-500/20">
          <p className="text-[14px] text-rose-700 dark:text-rose-400 font-medium">{error}</p>
        </div>
      )}

      <Card>
        {loading && !events ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : events && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <p className="text-[14px] text-slate-500 dark:text-slate-400">
              Nada que mostrar con este filtro.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.08]">
            {(events ?? []).map((ev) => (
              <div key={ev.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {ev.severity === "critico" ? (
                      <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    ) : null}
                    <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
                      {SECURITY_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                    </span>
                    <Pill label={SECURITY_SEVERITY_LABELS[ev.severity]} tone={SEVERITY_TONE[ev.severity]} />
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                    {ev.actor_id
                      ? `${actorNames[ev.actor_id] ?? "Alguien con sesión"}${
                          ev.actor_role ? ` · ${ROLE_LABELS[ev.actor_role]}` : ""
                        }`
                      : "Sin sesión (anónimo)"}
                    {ev.path ? ` · ${ev.path}` : ""}
                  </p>
                  {Object.keys(ev.detail ?? {}).length > 0 && (
                    <p className="mt-1 truncate text-[12px] text-slate-400 dark:text-slate-500 font-mono">
                      {JSON.stringify(ev.detail)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[12px] text-slate-400 dark:text-slate-500">
                  {formatDateTime(ev.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
