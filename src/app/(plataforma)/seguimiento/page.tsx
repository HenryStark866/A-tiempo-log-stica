"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Radio,
  MapPin,
  Bike,
  PackageSearch,
  ExternalLink,
  RefreshCw,
  Banknote,
  TriangleAlert,
  Search,
  Store,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MapaDeFondo } from "@/components/fondos/MapaDeFondo";
import { useMyClient } from "@/components/useMyClient";
import { MiniMap } from "@/components/MiniMap";
import { GUIDE_STATUS_LABELS, ROLES_DEL_COMERCIO } from "@/lib/constants";
import { formatCOP, formatDateTime } from "@/lib/utils";
import type { Shipment, GuideStatus } from "@/lib/types";

// Cada cuánto se refresca. 15s da sensación de tiempo real sin castigar la base.
const REFRESH_MS = 15000;

// Fases del flujo, para dibujar en qué punto va el paquete.
const FASES: { key: GuideStatus; label: string }[] = [
  { key: "creada", label: "Creada" },
  { key: "recogida", label: "Recogida" },
  { key: "en_cedi", label: "En CEDI" },
  { key: "zonificada", label: "Asignada" },
  { key: "en_ruta", label: "En ruta" },
];

function faseActual(status: GuideStatus): number {
  const i = FASES.findIndex((f) => f.key === status);
  if (i >= 0) return i;
  // Novedad/reprogramada/devolución vuelven conceptualmente al CEDI.
  if (status === "novedad" || status === "reprogramada") return 2;
  if (status === "en_devolucion" || status === "devuelta") return 2;
  return 0;
}

function tono(status: GuideStatus): string {
  if (status === "en_ruta") return "bg-[#ff812c]/10 text-[#ff812c]";
  if (status === "entregada") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (status === "novedad" || status === "reprogramada")
    return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  if (status === "en_devolucion" || status === "devuelta" || status === "cancelada")
    return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300";
}

function haceCuanto(iso: string | null): string {
  if (!iso) return "sin datos";
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "hace segundos";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return formatDateTime(iso);
}

export default function TrackingPage() {
  const profile = useProfile();
  const esCliente = ROLES_DEL_COMERCIO.includes(profile.role);
  const { loading: cargandoComercio } = useMyClient();

  const [envios, setEnvios] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  // Solo tiene sentido para staff: un cliente e-commerce solo ve su propio
  // comercio, así que filtrar por cliente no le cambia nada.
  const [buscarCliente, setBuscarCliente] = useState("");
  // Evita pisar el estado si el componente se desmonta a mitad del fetch.
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    setRefrescando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_my_shipments");
    if (!vivo.current) return;
    if (error) setError(error.message);
    else {
      setEnvios((data as Shipment[]) ?? []);
      setError(null);
      setUltimo(new Date());
    }
    setRefrescando(false);
  }, []);

  useEffect(() => {
    vivo.current = true;
    if (esCliente && cargandoComercio) return;

    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    // Al volver a la pestaña, refresca de una para no mostrar datos viejos.
    const onVisible = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      vivo.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cargar, esCliente, cargandoComercio]);

  // Sin acentos ni mayúsculas: "restrepo" debe encontrar "Restrepo".
  const normaliza = (s: string) =>
    s.toLowerCase().replaceAll("á","a").replaceAll("é","e").replaceAll("í","i").replaceAll("ó","o").replaceAll("ú","u").replaceAll("ñ","n");

  const filtro = normaliza(buscarCliente.trim());
  const visibles =
    esCliente || !filtro
      ? envios ?? []
      : (envios ?? []).filter((e) => e.client_name && normaliza(e.client_name).includes(filtro));

  const enRuta = visibles.filter((e) => e.status === "en_ruta");
  const comercios = new Set(visibles.map((e) => e.client_id)).size;

  return (
    <div className="relative pb-10 space-y-6 font-sans">
      {/* Aquí el valle no es adorno: esta pantalla es literalmente seguir
          paquetes por el Área Metropolitana. Va más tenue que en Inicio porque
          encima hay una lista que se lee todo el día. */}
      <MapaDeFondo opacidad={0.32} />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Seguimiento en vivo
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Estado y ubicación de tus envíos, actualizado automáticamente
          </p>
        </div>
        <button
          onClick={cargar}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 min-h-[44px] text-[14px] font-semibold text-slate-600 dark:text-slate-300 shadow-sm active:scale-[0.98] transition-transform"
        >
          <RefreshCw className={`w-4 h-4 ${refrescando ? "animate-spin text-[#ff812c]" : ""}`} />
          {ultimo ? `Actualizado ${haceCuanto(ultimo.toISOString())}` : "Actualizar"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
          <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {/* Buscador por comercio: solo para staff, que ve todos los comercios
          mezclados en la misma lista. */}
      {!esCliente && envios !== null && envios.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={buscarCliente}
            onChange={(ev) => setBuscarCliente(ev.target.value)}
            placeholder="Buscar por comercio…"
            aria-label="Buscar por comercio"
            className="w-full rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] pl-11 pr-12 min-h-[48px] text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm outline-none focus:ring-2 focus:ring-[#ff812c]/40 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {buscarCliente && (
            <button
              type="button"
              onClick={() => setBuscarCliente("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full text-slate-400 active:bg-slate-100 dark:active:bg-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Resumen */}
      {envios !== null && visibles.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-[#ff812c]/10 px-4 py-2.5">
            <Radio className="w-4 h-4 text-[#ff812c] shrink-0" />
            <span className="text-[14px] font-bold text-[#ff812c]">{enRuta.length} en ruta</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 py-2.5 shadow-sm">
            <PackageSearch className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-[14px] font-semibold text-slate-600 dark:text-slate-300">
              {visibles.length} envío(s) activo(s)
            </span>
          </div>
          {!esCliente && (
            <div className="flex items-center gap-2 rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] px-4 py-2.5 shadow-sm">
              <Store className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-[14px] font-semibold text-slate-600 dark:text-slate-300">
                {comercios} comercio(s)
              </span>
            </div>
          )}
        </div>
      )}

      {envios === null ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[15px]">Cargando envíos…</p>
        </div>
      ) : envios.length === 0 ? (
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] py-20 px-6 text-center shadow-sm">
          <PackageSearch className="mx-auto mb-4 w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-[16px] text-slate-500 dark:text-slate-400">
            No tienes envíos en curso
          </p>
          <Link
            href="/pedidos/nueva"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Crear una guía
          </Link>
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] py-20 px-6 text-center shadow-sm">
          <Store className="mx-auto mb-4 w-12 h-12 text-slate-300 dark:text-slate-600" />
          <p className="text-[16px] text-slate-500 dark:text-slate-400">
            Ningún comercio en curso coincide con «{buscarCliente.trim()}»
          </p>
          <button
            type="button"
            onClick={() => setBuscarCliente("")}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Ver todos los envíos
          </button>
        </div>
      ) : (
        <ul className="space-y-4">
          {visibles.map((e) => {
            const fase = faseActual(e.status);
            const tienePos = e.courier_lat != null && e.courier_lng != null;
            return (
              <li
                key={e.id}
                className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-colors duration-300"
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/pedidos/${e.id}`}
                        className="text-[17px] font-bold text-slate-900 dark:text-white hover:underline"
                      >
                        {e.guide_number}
                      </Link>
                      <p className="mt-0.5 text-[14px] text-slate-600 dark:text-slate-300 truncate">
                        {e.recipient_name}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        {e.recipient_address} · {e.recipient_city}
                      </p>
                      {/* De qué comercio es la guía: el cliente ya lo sabe. */}
                      {!esCliente && e.client_name && (
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">
                          <Store className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{e.client_name}</span>
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${tono(e.status)}`}>
                      {GUIDE_STATUS_LABELS[e.status]}
                    </span>
                  </div>

                  {/* Barra de fases */}
                  <div className="flex items-center gap-1.5">
                    {FASES.map((f, i) => (
                      <div key={f.key} className="flex-1">
                        <div
                          className={`h-1.5 rounded-full transition-colors ${
                            i <= fase ? "bg-[#ff812c]" : "bg-slate-200 dark:bg-slate-700"
                          }`}
                        />
                        <p
                          className={`mt-1.5 text-[10px] font-medium tracking-tight ${
                            i <= fase ? "text-[#ff812c]" : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {f.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                    {e.zone_name && (
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        {e.zone_name}
                        {e.delivery_rate != null && ` · ${formatCOP(e.delivery_rate)}`}
                      </span>
                    )}
                    {e.courier_name && (
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Bike className="w-3.5 h-3.5 shrink-0" />
                        {e.courier_name}
                      </span>
                    )}
                    {e.is_cod && (
                      <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                        <Banknote className="w-3.5 h-3.5 shrink-0 text-[#ff812c]" />
                        Contraentrega {formatCOP(e.cod_amount)}
                      </span>
                    )}
                    {e.delivery_attempts > 0 && (
                      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
                        {e.delivery_attempts} intento(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Ubicación del mensajero: solo mientras va en ruta */}
                {e.status === "en_ruta" && (
                  <div className="border-t border-gray-100 dark:border-gray-800">
                    {tienePos ? (
                      <>
                        <MiniMap lat={e.courier_lat!} lng={e.courier_lng!} />
                        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                          <p className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                            <Radio className="w-3.5 h-3.5 shrink-0 text-[#ff812c]" />
                            Posición {haceCuanto(e.courier_position_at)}
                          </p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${e.courier_lat},${e.courier_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#ff812c] active:opacity-70"
                          >
                            Abrir en Google Maps <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <p className="px-5 py-3.5 text-[13px] text-slate-500 dark:text-slate-400">
                        El mensajero va en ruta pero todavía no ha reportado su ubicación.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 text-[12px] text-slate-400 dark:text-slate-500">
        Se actualiza solo cada {REFRESH_MS / 1000} segundos. La ubicación del mensajero se muestra
        únicamente mientras tu paquete está en ruta.
      </p>
    </div>
  );
}
