"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, RadioTower, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Cada cuánto se manda la posición al servidor. watchPosition dispara mucho más
// seguido que esto, así que se limita para no golpear la base ni la batería.
// A 10 s el punto del mapa se mueve de forma creíble (a 30 km/h son ~80 m entre
// avisos) sin castigar el plan de datos del mensajero.
const ENVIO_MS = 10000;
// Si además se movió poco, no hace falta gastar un envío: por debajo de estos
// metros el punto prácticamente no cambia de sitio en pantalla.
const MOVIMIENTO_MIN_M = 25;
const STORAGE_KEY = "at_compartir_ubicacion";
const EVENTO = "at:ubicacion";

/** Metros entre dos coordenadas (haversine). Sirve para no reenviar lo mismo. */
function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Enciende el rastreo desde otra pantalla.
 *
 * Lo usa el mensajero al pulsar Iniciar en una recogida: el rastreo es parte
 * del trabajo que acaba de arrancar, no algo que deba acordarse de prender
 * aparte. El interruptor sigue visible y él puede apagarlo.
 *
 * Va por evento y no solo por localStorage porque el componente puede estar ya
 * montado en pantalla, y escribir la clave a secas no lo despierta.
 */
export function activarUbicacion() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
  window.dispatchEvent(new Event(EVENTO));
}

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
  const ultimaPos = useRef<{ lat: number; lng: number } | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Restaura la preferencia guardada, y queda atento a que otra pantalla lo
  // encienda (arrancar una recogida, por ejemplo).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const leer = () => setActivo(window.localStorage.getItem(STORAGE_KEY) === "1");
    leer();
    window.addEventListener(EVENTO, leer);
    return () => window.removeEventListener(EVENTO, leer);
  }, []);

  const enviar = useCallback(
    async (lat: number, lng: number, accuracy?: number, speed?: number, heading?: number) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("at_report_position", {
        p_lat: lat,
        p_lng: lng,
        // El GPS entrega velocidad en m/s; el CEDI la lee en km/h.
        p_accuracy: Number.isFinite(accuracy) ? accuracy : null,
        p_speed: Number.isFinite(speed) && speed! >= 0 ? speed! * 3.6 : null,
        p_heading: Number.isFinite(heading) ? heading : null,
      });
      if (error) setError(error.message);
      else {
        setError(null);
        setUltimoEnvio(new Date());
      }
    },
    []
  );

  // Mientras se comparte ubicación, se pide mantener la pantalla encendida: si
  // el teléfono se bloquea, el navegador congela watchPosition y el punto del
  // mensajero se queda clavado en el mapa. El sistema suelta este bloqueo solo
  // cuando la pestaña pasa a segundo plano, así que hay que volver a tomarlo al
  // regresar.
  useEffect(() => {
    if (!activo) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;

    let cancelado = false;
    const tomar = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        wakeLock.current = await nav.wakeLock!.request("screen");
      } catch {
        /* batería baja o el sistema lo niega: el rastreo sigue igual */
      }
    };
    const alVolver = () => {
      if (!cancelado && document.visibilityState === "visible") tomar();
    };

    tomar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alVolver);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [activo]);

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

        // Quieto en un semáforo o en el almacén: no se gasta un envío en
        // repetir la misma coordenada, pero cada 2 minutos se manda igual
        // para que el CEDI sepa que el equipo sigue vivo.
        const previa = ultimaPos.current;
        const movida = previa
          ? distanciaM(previa.lat, previa.lng, pos.coords.latitude, pos.coords.longitude)
          : Infinity;
        if (movida < MOVIMIENTO_MIN_M && ahora - ultimoTs.current < 120000) return;

        ultimoTs.current = ahora;
        ultimaPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        enviar(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? undefined,
          pos.coords.speed ?? undefined,
          pos.coords.heading ?? undefined
        );
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
              : "Nadie en el CEDI puede ver dónde vas"}
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
