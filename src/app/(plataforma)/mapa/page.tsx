"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinOff, Phone, RefreshCw, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { FleetMap, type MapPoint } from "@/components/FleetMap";
import { COURIER_TYPE_LABELS } from "@/lib/constants";
import type { CourierType } from "@/lib/types";

/** Cada cuánto se vuelve a preguntar. El mensajero reporta cada 30 s. */
const REFRESCO_MS = 20_000;

/** Pasado este tiempo la posición ya no cuenta como "ahora mismo". */
const MINUTOS_RANCIO = 10;

interface LiveCourier {
  id: string;
  full_name: string;
  phone: string | null;
  courier_type: CourierType | null;
  last_lat: number | null;
  last_lng: number | null;
  last_position_at: string | null;
  zone_name: string | null;
  max_capacity: number;
  por_salir: number;
  en_ruta: number;
  entregadas_hoy: number;
  recogida_en_curso: {
    pickup_id: string;
    business_name: string;
    address: string;
    started_at: string;
  } | null;
}

interface Facility {
  name: string;
  address: string;
  city: string;
}

function minutosDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function haceCuanto(min: number | null): string {
  if (min === null) return "nunca ha reportado";
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

export default function FleetPage() {
  const profile = useProfile();
  const [couriers, setCouriers] = useState<LiveCourier[] | null>(null);
  const [sede, setSede] = useState<Facility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const autorizado = ["admin", "coordinador", "operario"].includes(profile.role);

  const load = useCallback(async () => {
    if (!autorizado) return;
    const supabase = createClient();
    const [{ data, error }, { data: f }] = await Promise.all([
      supabase.rpc("at_live_couriers"),
      supabase.rpc("at_default_facility"),
    ]);
    if (error) setError(error.message);
    else setError(null);
    setCouriers((data as LiveCourier[]) ?? []);
    setSede((f as Facility) ?? null);
    setActualizado(new Date());
  }, [autorizado]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autorizado) return;
    const id = setInterval(load, REFRESCO_MS);
    return () => clearInterval(id);
  }, [autorizado, load]);

  if (!autorizado) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Mapa</h1>
        <p className="mt-6 text-slate-500">Esta sección es del personal de operaciones.</p>
      </div>
    );
  }

  const conPosicion = (couriers ?? []).filter(
    (c) => typeof c.last_lat === "number" && typeof c.last_lng === "number"
  );
  const sinPosicion = (couriers ?? []).filter(
    (c) => typeof c.last_lat !== "number" || typeof c.last_lng !== "number"
  );

  const puntos: MapPoint[] = conPosicion.map((c) => {
    const min = minutosDesde(c.last_position_at);
    return {
      id: c.id,
      lat: c.last_lat!,
      lng: c.last_lng!,
      titulo: c.full_name,
      detalle:
        (c.recogida_en_curso
          ? `Recogiendo en ${c.recogida_en_curso.business_name}`
          : `${c.en_ruta} en ruta · ${c.por_salir} por salir`) + ` · ${haceCuanto(min)}`,
      tipo: "mensajero",
      minutos: min ?? undefined,
    };
  });

  return (
    <div className="pb-10 space-y-5 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Mapa de la flota
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {conPosicion.length} mensajero(s) reportando
            {actualizado &&
              ` · actualizado ${actualizado.toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-[#FFFFFF] px-4 text-[14px] font-semibold text-slate-600 shadow-sm transition-transform active:scale-[0.98] dark:bg-[#2C2C2E] dark:text-slate-300"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-[14px] font-medium text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}

      {couriers === null ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF] py-24 text-slate-500 shadow-sm dark:bg-[#2C2C2E] dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin text-[#ff812c]" />
          <p className="text-[15px]">Cargando el mapa…</p>
        </div>
      ) : (
        <>
          <FleetMap puntos={puntos} />

          {sede && (
            <p className="px-1 text-[13px] text-slate-500 dark:text-slate-400">
              {sede.name}: {sede.address}, {sede.city}
            </p>
          )}

          <div className="space-y-3">
            {conPosicion.map((c) => {
              const min = minutosDesde(c.last_position_at);
              const rancio = (min ?? 999) > MINUTOS_RANCIO;
              return (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-2xl bg-[#FFFFFF] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-[#2C2C2E]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{c.full_name}</p>
                      {c.courier_type && (
                        <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
                          {COURIER_TYPE_LABELS[c.courier_type]}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          rancio
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        }`}
                      >
                        {haceCuanto(min)}
                      </span>
                    </div>

                    {c.recogida_en_curso ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[14px] text-[#ff812c]">
                        <Store className="h-4 w-4 shrink-0" />
                        Recogiendo en {c.recogida_en_curso.business_name} ·{" "}
                        {c.recogida_en_curso.address}
                      </p>
                    ) : (
                      <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
                        {c.en_ruta} en ruta · {c.por_salir} por salir · {c.entregadas_hoy}{" "}
                        entregada(s) hoy
                        {c.zone_name && ` · ${c.zone_name}`}
                      </p>
                    )}
                  </div>

                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Phone className="h-4 w-4" /> Llamar
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {sinPosicion.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="flex items-start gap-2 text-[14px] font-semibold text-amber-800 dark:text-amber-300">
                <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
                {sinPosicion.length} mensajero(s) sin ubicación
              </p>
              <p className="mt-1 text-[14px] text-amber-700 dark:text-amber-400">
                {sinPosicion.map((c) => c.full_name).join(", ")}. No están compartiendo su
                ubicación: puede que tengan la app cerrada o el permiso desactivado.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
