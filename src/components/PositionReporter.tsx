"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, RadioTower, TriangleAlert, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Intervalo mínimo entre envíos a la base. 10 s = ~80 m a 30 km/h. */
const ENVIO_MS = 10_000;
/** Distancia mínima de movimiento para enviar (ahorra datos si está parado). */
const MOVIMIENTO_MIN_M = 25;
/** Si no hay movimiento, se manda una señal de vida cada 2 min. */
const HEARTBEAT_INMOVIL_MS = 120_000;
/**
 * Intervalo del polling de respaldo. Cuando el navegador suspende
 * watchPosition (pantalla apagada / segundo plano), este intervalo lo
 * complementa: al volver a primer plano el setInterval ya había corrido y
 * tenemos la posición lista para enviar sin esperar a watchPosition.
 */
const POLL_RESPALDO_MS = 30_000;

const STORAGE_KEY = "at_compartir_ubicacion";
const EVENTO = "at:ubicacion";

// ─── Utilidades ──────────────────────────────────────────────────────────────

function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Enciende el rastreo desde otra pantalla.
 * El mensajero lo activa indirectamente al pulsar "Iniciar recogida".
 */
export function activarUbicacion() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
  window.dispatchEvent(new Event(EVENTO));
}

// ─── Componente ──────────────────────────────────────────────────────────────

/**
 * Reporta la posición del mensajero en tiempo real con tres capas de resiliencia:
 *
 * 1. `watchPosition` — actualización continua mientras la app está al frente.
 * 2. Polling de respaldo — `getCurrentPosition` cada 30 s. Cuando el navegador
 *    suspende watchPosition (pantalla apagada), este intervalo sigue corriendo
 *    y al volver a primer plano ya tiene la posición lista.
 * 3. Heartbeat al volver — `visibilitychange` dispara un envío inmediato en
 *    cuanto el mensajero vuelve a la app tras cambiar de pestaña o desbloquear.
 *
 * Limitación conocida y documentada: si el mensajero cierra el navegador o
 * bloquea la pantalla durante más de ~30 s, el rastreo se pausa.
 * Wake Lock mitiga el bloqueo de pantalla mientras la app está visible.
 * El banner de advertencia guía al mensajero para mantener la app activa.
 */
export function PositionReporter() {
  const [activo, setActivo] = useState(false);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [enSegundoPlano, setEnSegundoPlano] = useState(false);

  const watchId = useRef<number | null>(null);
  const pollId = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoTs = useRef(0);
  const ultimaPos = useRef<{ lat: number; lng: number } | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // ── Persistencia de preferencia ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const leer = () => setActivo(window.localStorage.getItem(STORAGE_KEY) === "1");
    leer();
    window.addEventListener(EVENTO, leer);
    return () => window.removeEventListener(EVENTO, leer);
  }, []);

  // ── Envío a la base ───────────────────────────────────────────────────────
  const enviar = useCallback(
    async (lat: number, lng: number, accuracy?: number, speed?: number, heading?: number) => {
      const ahora = Date.now();
      const previa = ultimaPos.current;
      const movida = previa
        ? distanciaM(previa.lat, previa.lng, lat, lng)
        : Infinity;

      // No reenviar si se movió poco y no ha pasado el heartbeat
      if (movida < MOVIMIENTO_MIN_M && ahora - ultimoTs.current < HEARTBEAT_INMOVIL_MS) return;

      ultimoTs.current = ahora;
      ultimaPos.current = { lat, lng };

      const supabase = createClient();
      const { error } = await supabase.rpc("at_report_position", {
        p_lat: lat,
        p_lng: lng,
        p_accuracy: Number.isFinite(accuracy) ? accuracy : null,
        p_speed: Number.isFinite(speed) && speed! >= 0 ? speed! * 3.6 : null,
        p_heading: Number.isFinite(heading) ? heading : null,
      });
      if (!error) setUltimoEnvio(new Date());
    },
    []
  );

  // ── Wake Lock (mantiene pantalla encendida) ───────────────────────────────
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
        /* sistema lo niega (p.ej. batería baja): rastreo sigue igual */
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

  // ── watchPosition principal ───────────────────────────────────────────────
  useEffect(() => {
    if (!activo) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    if (!navigator?.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoTs.current < ENVIO_MS) return;
        setPermisoDenegado(false);
        enviar(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? undefined,
          pos.coords.speed ?? undefined,
          pos.coords.heading ?? undefined
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermisoDenegado(true);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [activo, enviar]);

  // ── Polling de respaldo + heartbeat al volver ─────────────────────────────
  useEffect(() => {
    if (!activo) {
      if (pollId.current) {
        clearInterval(pollId.current);
        pollId.current = null;
      }
      return;
    }
    if (!navigator?.geolocation) return;

    /** Pide posición puntual. Si el navegador estaba suspendido, esto fuerza
     *  una lectura fresca al volver a primer plano. */
    const sondear = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermisoDenegado(false);
          enviar(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy ?? undefined,
            pos.coords.speed ?? undefined,
            pos.coords.heading ?? undefined
          );
        },
        () => {
          /* silencioso: watchPosition ya maneja el error */
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
      );
    };

    // Al volver de segundo plano: envía de inmediato
    const alVolver = () => {
      if (document.visibilityState === "visible") {
        setEnSegundoPlano(false);
        sondear();
      } else {
        setEnSegundoPlano(true);
      }
    };

    // Intervalo de respaldo para cuando watchPosition está suspendido
    pollId.current = setInterval(sondear, POLL_RESPALDO_MS);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      if (pollId.current) clearInterval(pollId.current);
      pollId.current = null;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo, enviar]);

  // ── Alternar ─────────────────────────────────────────────────────────────
  function alternar() {
    const siguiente = !activo;
    setActivo(siguiente);
    setPermisoDenegado(false);
    window.localStorage.setItem(STORAGE_KEY, siguiente ? "1" : "0");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm p-4 space-y-3 transition-colors duration-300">
      {/* Fila principal */}
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            activo
              ? "bg-[#ff812c]/10 text-[#ff812c]"
              : "bg-slate-100 dark:bg-slate-700 text-slate-400"
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
                ? `Enviada a las ${ultimoEnvio.toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Buscando señal…"
              : "Nadie en el CEDI puede ver dónde vas"}
          </p>
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-label={activo ? "Desactivar compartir ubicación" : "Activar compartir ubicación"}
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

      {/* Banner: permiso denegado */}
      {permisoDenegado && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-[13px] font-semibold text-rose-700 dark:text-rose-400">
              Permiso de ubicación bloqueado
            </p>
            <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-0.5">
              Abre los ajustes del navegador → Sitios → A Tiempo → Ubicación → Permitir. Luego
              vuelve aquí y activa el interruptor.
            </p>
          </div>
        </div>
      )}

      {/* Banner: app en segundo plano */}
      {activo && enSegundoPlano && !permisoDenegado && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
          <Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-[12px] text-amber-700 dark:text-amber-400">
            <strong>La app está en segundo plano.</strong> El rastreo se reanuda cuando
            vuelvas aquí. Para que sea continuo, mantén esta pantalla activa y no bloquees
            el teléfono.
          </p>
        </div>
      )}

      {/* Nota informativa cuando está activo y sin problemas */}
      {activo && !permisoDenegado && !enSegundoPlano && (
        <p className="text-[12px] text-slate-400 dark:text-slate-500 px-1">
          Mantén la app abierta y la pantalla encendida para un rastreo ininterrumpido.
        </p>
      )}
    </div>
  );
}
