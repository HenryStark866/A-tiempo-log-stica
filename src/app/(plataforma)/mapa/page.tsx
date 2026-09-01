"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Loader2, MapPinOff, Phone, RefreshCw, Store } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import dynamic from "next/dynamic";
import { COURIER_TYPE_LABELS } from "@/lib/constants";
import { type MapPoint } from "@/components/FleetMap";
import { FiltroActivo, Loading } from "@/components/ui";
import type { CourierType } from "@/lib/types";


const FleetMap = dynamic(() => import("@/components/FleetMap").then((mod) => mod.FleetMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-500">
      Cargando mapa...
    </div>
  ),
});

/**
 * Cada cuánto se vuelve a preguntar por la flota.
 *
 * Esto ERA una red de seguridad de un minuto, porque las posiciones llegaban
 * por Realtime en cuanto el mensajero las reportaba. El 2026-08-31 se apagó el
 * tiempo real: sondear el WAL 1,9 veces por segundo día y noche era el 95 %
 * del trabajo de la base, y lo pagaba una sola suscripción sobre dos tablas
 * con 480 cambios en toda su historia.
 *
 * Así que este número ya no es la red: es EL mecanismo, y baja de 60 a 20
 * segundos. Con dos mensajeros en moto, veinte segundos de retraso en el punto
 * del mapa no cambia ninguna decisión.
 *
 * Si algún día la flota crece y esto se queda corto, la vuelta atrás está en
 * docs/estandares-de-plataforma.md, frente 9.
 */
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

/**
 * El CEDI, con sus coordenadas ya guardadas en la base.
 *
 * Antes se geocodificaban en el navegador con Nominatim, en cada carga. No
 * funcionaba y además molestaba: la CSP de producción no permite hablar con
 * Nominatim —así que fallaba en silencio y el CEDI no salía nunca—, y como la
 * pantalla se re-consulta cada pocos segundos por el sondeo de la flota, cada
 * ciclo disparaba otra petición contra un servicio gratuito que limita a una
 * por segundo.
 *
 * La dirección del CEDI no cambia. Se geocodificó una vez y vive en
 * at_facilities (migración 0083): sin llamadas externas y funcionando sin señal.
 */
interface Facility {
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
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
  return (
    <Suspense fallback={<Loading label="Cargando el mapa…" />}>
      <Fleet />
    </Suspense>
  );
}

function Fleet() {
  const profile = useProfile();
  const params = useSearchParams();
  const router = useRouter();
  /**
   * La tarjeta «Mensajeros con carga activa» abre el mapa mostrando solo a esos
   * mensajeros: los que tienen guías por salir o en ruta ahora mismo. Es el
   * mismo criterio con el que el panel arma el número.
   */
  const soloActivos = params.get("flota") === "activa";
  const [couriers, setCouriers] = useState<LiveCourier[] | null>(null);
  const [sede, setSede] = useState<Facility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  // ¿El canal de Realtime está enganchado? Se muestra para que el CEDI sepa si
  // está viendo posiciones al instante o solo lo que trajo el último sondeo.

  const autorizado = ["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role);

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

  const conCarga = (c: LiveCourier) => c.por_salir + c.en_ruta > 0 || c.recogida_en_curso !== null;
  const flota = soloActivos ? (couriers ?? []).filter(conCarga) : couriers ?? [];

  const conPosicion = flota.filter(
    (c) => typeof c.last_lat === "number" && typeof c.last_lng === "number"
  );
  const sinPosicion = flota.filter(
    (c) => typeof c.last_lat !== "number" || typeof c.last_lng !== "number"
  );

  const puntos: MapPoint[] = [
    // Mensajeros con posición conocida
    ...conPosicion.map((c) => {
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
        tipo: "mensajero" as const,
        minutos: min ?? undefined,
        courier_type: c.courier_type,
        phone: c.phone,
        en_ruta: c.en_ruta,
        por_salir: c.por_salir,
        entregadas_hoy: c.entregadas_hoy,
        max_capacity: c.max_capacity,
      };
    }),
    // Sede del CEDI (solo si ya tenemos coordenadas geocodificadas)
    // Solo si el CEDI tiene coordenadas guardadas. Un CEDI afiliado recién
    // aprobado todavía no las tiene, y un punto en el (0,0) del Atlántico es
    // peor que ningún punto.
    ...(sede && typeof sede.lat === "number" && typeof sede.lng === "number"
      ? [{
          id: "sede-principal",
          lat: sede.lat,
          lng: sede.lng,
          titulo: sede.name,
          detalle: `${sede.address} · ${sede.city}`,
          tipo: "sede" as const,
        }]
      : []),
  ];

  return (
    <div className="pb-10 space-y-5 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
              Mapa de la flota
            </h1>
          </div>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {conPosicion.length} mensajero(s) {soloActivos ? "con carga " : ""}reportando
            {/* La hora de la última lectura, siempre. Antes, cuando el tiempo
                real estaba encendido, aquí ponía «las posiciones llegan al
                instante» — y esa frase habría pasado a ser mentira. */}
            {actualizado &&
              ` · actualizado ${actualizado.toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl atl-superficie px-4 text-[14px] font-semibold text-slate-600 shadow-sm transition-transform active:scale-[0.98]  dark:text-slate-300"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-[14px] font-medium text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}

      {soloActivos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Filtrado desde Mi panel:
          </span>
          <FiltroActivo
            label="Solo con carga activa"
            onClear={() => router.replace("/mapa", { scroll: false })}
          />
        </div>
      )}

      {couriers === null ? (
        // Translucida y con blur (patron probado en vivo: /90 sin blur no se nota).
        // Tarjeta de carga, sin campos ni decisiones dentro.
        <div className="flex flex-col items-center gap-3 rounded-3xl atl-superficie py-24 text-slate-500 shadow-sm   dark:text-slate-400">
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
                // Translucida y con blur (patron probado en vivo). Tarjeta de lectura por
                // mensajero, sin campos de formulario dentro.
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-2xl atl-superficie p-4 shadow-sm  sm:flex-row sm:items-center sm:justify-between "
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
