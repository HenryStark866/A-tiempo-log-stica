"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, RadioTower, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Cada cuánto se manda la posición al servidor. watchPosition dispara mucho más
// seguido que esto, así que se limita para no golpear la base ni la batería.
const ENVIO_MS = 30000;
const STORAGE_KEY = "at_compartir_ubicacion";

/**
 * Reporta la ubicación del mensajero mientras trabaja, para que el e-commerce
 * pueda seguir su paquete en vivo.
 *
 * Es opt-in y con interruptor visible: se rastrea la ubicación de una persona,
 * así que debe poder verlo y apagarlo. La preferencia queda en el dispositivo.
 */
export function PositionReporter() {
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const watchId = useRef<number | null>(null);
  const ultimoTs = useRef(0);

  // Restaura la preferencia guardada.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setActivo(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const enviar = useCallback(async (lat: number, lng: number) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("at_report_position", { p_lat: lat, p_lng: lng });
    if (error) setError(error.message);
    else {
      setError(null);
      setUltimoEnvio(new Date());
    }
  }, []);

  useEffect(() => {
    if (!activo) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este dispositivo no permite compartir ubicación.");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoTs.current < ENVIO_MS) return;
        ultimoTs.current = ahora;
        enviar(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."
            : "No pudimos obtener tu ubicación."
        );
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [activo, enviar]);

  function alternar() {
    const siguiente = !activo;
    setActivo(siguiente);
    setError(null);
    window.localStorage.setItem(STORAGE_KEY, siguiente ? "1" : "0");
  }

  return (
    <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm p-4 space-y-2 transition-colors duration-300">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            activo ? "bg-[#ff812c]/10 text-[#ff812c]" : "bg-slate-100 dark:bg-slate-700 text-slate-400"
          }`}
        >
          {activo ? <RadioTower className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Compartir mi ubicación
          </p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {activo
              ? ultimoEnvio
                ? `Enviada a las ${ultimoEnvio.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                : "Buscando señal…"
              : "Los comercios no verán dónde vas"}
          </p>
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-label="Compartir ubicación"
          className={`w-12 h-7 rounded-full transition-colors duration-200 relative shrink-0 ${
            activo ? "bg-[#ff812c]" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-[3px] w-[22px] h-[22px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
              activo ? "translate-x-[22px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
