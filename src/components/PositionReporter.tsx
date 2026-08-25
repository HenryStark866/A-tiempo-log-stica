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
 * Intervalo del sondeo de respaldo.
 *
 * OJO con lo que este intervalo NO hace: en pestaña oculta, Chrome Android
 * estrangula los timers a ~1 por minuto y congela la página entera a los ~5
 * minutos, y getCurrentPosition tampoco entrega mientras la página está
 * congelada. Este `setInterval` no es una segunda capa de resiliencia que
 * "sigue corriendo" en segundo plano —no lo hace—; es la misma capa de
 * primer plano con otro nombre, con 30 s de latencia añadida. Lo que de
 * verdad cubre el segundo plano es el flush de `pagehide` de más abajo: un
 * único intento, en el instante exacto en que la pestaña se va, no una
 * repetición.
 */
const POLL_RESPALDO_MS = 30_000;

export const STORAGE_KEY = "at_compartir_ubicacion";
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

interface DatosFix {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

/**
 * Envía una posición directo a la RPC, sin pasar por el ciclo de vida del
 * componente.
 *
 * Lo usan dos casos que no pueden esperar a que `PositionReporter` tenga
 * oportunidad de renderizar: `activarUbicacion()`, que manda el primer punto
 * del turno ANTES de que exista tiempo para que el efecto de watchPosition se
 * registre, y el flush de `pagehide`, que manda el último punto cuando la
 * pestaña ya se está yendo y ningún componente va a volver a ejecutar nada.
 *
 * `keepalive` es lo que de verdad importa en el segundo caso: sin él, una
 * petición en vuelo se cancela en cuanto el navegador descarga la página.
 * Chrome limita a 64 KB el total de peticiones keepalive en vuelo; este
 * cuerpo pesa un centenar de bytes, así que no hay riesgo de tope.
 */
async function enviarDirecto(datos: DatosFix, keepalive = false): Promise<boolean> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const res = await fetch(`${url}/rest/v1/rpc/at_report_position`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        p_lat: datos.lat,
        p_lng: datos.lng,
        p_accuracy: Number.isFinite(datos.accuracy) ? datos.accuracy : null,
        p_speed: Number.isFinite(datos.speed) && datos.speed! >= 0 ? datos.speed! * 3.6 : null,
        p_heading: Number.isFinite(datos.heading) ? datos.heading : null,
      }),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Enciende el rastreo desde otra pantalla, y manda el PRIMER punto de una vez.
 *
 * El mensajero lo activa indirectamente al pulsar "Iniciar recogida". Ahí
 * estaba el defecto que hacía que el CEDI no viera salir a nadie: el botón
 * escribía la preferencia y navegaba a Waze en el mismo instante, pero el
 * `watchPosition` de `PositionReporter` se registra en un efecto de React, que
 * corre DESPUÉS de que el componente vuelva a renderizar — y para entonces la
 * pestaña ya podía estar en segundo plano por el salto a la app de
 * navegación. La primera posición del turno no se capturaba nunca.
 *
 * Por eso esta función es `async` y hay que esperarla ANTES de navegar a
 * cualquier otra parte (ver conductor/recogida/page.tsx): pide un punto de
 * una vez, aquí mismo, y lo manda con `enviarDirecto`, sin depender de que el
 * componente alcance a montar nada.
 */
export async function activarUbicacion() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
  window.dispatchEvent(new Event(EVENTO));

  if (!navigator.geolocation) return;

  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await enviarDirecto({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          speed: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
        });
        resolve();
      },
      () => resolve(), // sin permiso o sin señal: el watch lo va a intentar después
      { enableHighAccuracy: true, timeout: 6_000, maximumAge: 10_000 }
    );
  });
}

// ─── Componente ──────────────────────────────────────────────────────────────

/**
 * Reporta la posición del mensajero en tiempo real.
 *
 * Límite real, no de este código: en la web no existe forma de seguir
 * enviando ubicación con la pantalla apagada o la app cerrada — geolocation
 * no existe dentro de un service worker, así que ninguna de las APIs que
 * corren en segundo plano (sync periódico, push) puede leerla. Eso no se
 * arregla con más código; lo único real es exprimir el primer plano:
 *
 * 1. `watchPosition` — actualización continua mientras la app está visible.
 * 2. Sondeo de respaldo cada 30 s — cubre el hueco cuando watchPosition tarda
 *    en entregar el primer punto, no cuando el navegador está suspendido.
 * 3. Flush en `pagehide` — un único intento, con keepalive, en el instante
 *    exacto en que la pestaña se va: es la mejor oportunidad real de que el
 *    último punto antes de perderla llegue a la base.
 *
 * Wake Lock mitiga el caso más común (pantalla apagada con la app al frente):
 * mientras el mensajero no cambie de app, el sistema no apaga la pantalla y
 * watchPosition sigue vivo.
 */
export function PositionReporter() {
  const [activo, setActivo] = useState(false);
  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [enSegundoPlano, setEnSegundoPlano] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden"
  );

  const watchId = useRef<number | null>(null);
  const pollId = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoTs = useRef(0);
  /** El último fix ENVIADO con éxito: para el filtro de distancia. */
  const ultimaPos = useRef<{ lat: number; lng: number } | null>(null);
  /** El timestamp (del GPS, no de reloj local) del último fix enviado. */
  const ultimoFixTs = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // ── Persistencia de preferencia ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const leer = () => setActivo(window.localStorage.getItem(STORAGE_KEY) === "1");
    leer();
    window.addEventListener(EVENTO, leer);
    // Dos pestañas (o la instalada y el navegador) comparten localStorage
    // pero no un `dispatchEvent` en memoria: sin esto, apagar el rastreo en
    // una no se reflejaba en la otra.
    window.addEventListener("storage", leer);
    return () => {
      window.removeEventListener(EVENTO, leer);
      window.removeEventListener("storage", leer);
    };
  }, []);

  // ── Envío a la base ───────────────────────────────────────────────────────
  const enviar = useCallback(
    async (lat: number, lng: number, tsFix: number, accuracy?: number, speed?: number, heading?: number) => {
      // Un fix más viejo que el último que ya se mandó no se manda: el
      // sondeo de respaldo pide con `maximumAge: 30_000` y puede devolver un
      // punto en caché más viejo que el que el watch ya entregó hace un
      // instante. Sin este control, ese punto rezagado podía llegar DESPUÉS
      // a la base y hacer retroceder el marcador del CEDI, porque
      // at_report_position se queda con quien llega último, no con el más
      // reciente.
      if (tsFix > 0 && tsFix <= ultimoFixTs.current) return;

      const ahora = Date.now();
      const previa = ultimaPos.current;
      const movida = previa ? distanciaM(previa.lat, previa.lng, lat, lng) : Infinity;

      // No reenviar si se movió poco y no ha pasado el heartbeat
      if (movida < MOVIMIENTO_MIN_M && ahora - ultimoTs.current < HEARTBEAT_INMOVIL_MS) return;

      const ok = await enviarDirecto({ lat, lng, accuracy, speed, heading });

      // El estado de deduplicación se actualiza DESPUÉS de saber que llegó,
      // no antes. Si el RPC falla —sin señal, que es lo normal en la calle—
      // el intento anterior era: escribir ultimaPos/ultimoTs ANTES del envío,
      // así que un fallo dejaba ultimaPos apuntando a un punto que la base
      // nunca recibió, y con el mensajero quieto el heartbeat se aplazaba 2
      // minutos completos por un envío que ni siquiera había ocurrido.
      if (ok) {
        ultimoTs.current = ahora;
        ultimaPos.current = { lat, lng };
        if (tsFix > 0) ultimoFixTs.current = tsFix;
        setUltimoEnvio(new Date());
      }
    },
    []
  );

  // ── Flush al perder la pestaña ────────────────────────────────────────────
  // El resto de envíos son fetch normales, cancelables en cuanto el navegador
  // descarga la página. `pagehide` es el evento correcto para esto —a
  // diferencia de `visibilitychange`, que solo avisa que la pestaña se OCULTÓ,
  // no que se está yendo de verdad— y dispara de forma fiable tanto al cerrar
  // como al navegar fuera.
  useEffect(() => {
    if (!activo) return;

    const alIrse = () => {
      const pos = ultimaPos.current;
      if (!pos) return;
      // Mejor esfuerzo: no se puede awaitear nada aquí, la página ya se va.
      void enviarDirecto({ lat: pos.lat, lng: pos.lng }, true);
    };

    window.addEventListener("pagehide", alIrse);
    return () => window.removeEventListener("pagehide", alIrse);
  }, [activo]);

  // ── Wake Lock (mantiene pantalla encendida) ───────────────────────────────
  useEffect(() => {
    if (!activo) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;

    let cancelado = false;

    const tomar = async () => {
      // Ya hay uno vivo: pedir otro solo lo reemplaza sin liberar el
      // anterior, y cada ida y vuelta a la app de navegación pedía uno
      // nuevo sin soltar el de antes.
      if (wakeLock.current && !wakeLock.current.released) return;
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await nav.wakeLock!.request("screen");
        // Si mientras se esperaba la respuesta el rastreo ya se apagó (o el
        // componente se desmontó), no se guarda: quedaría un sentinel vivo
        // sin nadie que lo libere, y la pantalla se quedaría encendida el
        // resto del turno sin que nadie lo pidiera.
        if (cancelado) {
          lock.release().catch(() => {});
          return;
        }
        wakeLock.current = lock;
        // El sistema puede soltarlo por su cuenta —batería baja, modo
        // ahorro— sin que cambie la visibilidad. Sin escuchar esto, el
        // código nunca se entera y no lo vuelve a pedir en lo que queda del
        // turno.
        lock.addEventListener("release", () => {
          if (wakeLock.current === lock) wakeLock.current = null;
        });
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
          pos.timestamp,
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

  // ── Sondeo de respaldo + heartbeat al volver ──────────────────────────────
  useEffect(() => {
    if (!activo) {
      if (pollId.current) {
        clearInterval(pollId.current);
        pollId.current = null;
      }
      return;
    }
    if (!navigator?.geolocation) return;

    const sondear = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermisoDenegado(false);
          enviar(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.timestamp,
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

    // Primer sondeo YA, y no 30 s después: sin esto, entre encender el
    // interruptor y que el CEDI vea el primer punto podían pasar hasta 30 s
    // enteros de nada (el watch tiene su propio timeout de 20 s).
    sondear();
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
    // Al apagar, se olvida el último punto: si se reenciende horas después,
    // el filtro de distancia no debe compararse contra algo tan viejo.
    if (!siguiente) {
      ultimaPos.current = null;
      ultimoTs.current = 0;
      ultimoFixTs.current = 0;
    }
    window.localStorage.setItem(STORAGE_KEY, siguiente ? "1" : "0");
    // Mismo evento que activarUbicacion(): sin esto, otra pestaña —o la app
    // instalada abierta a la par del navegador— no se enteraba de que el
    // interruptor cambió aquí.
    window.dispatchEvent(new Event(EVENTO));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // Translucida y con blur (patrón probado en vivo: /90 sin blur no se
    // notaba). Es la tarjeta de estado, no un formulario: sin campos que
    // pierdan legibilidad.
    <div className="atl-superficie   rounded-2xl shadow-sm p-4 space-y-3 transition-colors duration-300">
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
              Toca el icono junto a la dirección de la página → Permisos → Ubicación → Permitir.
              Si la app está instalada, es en Ajustes del teléfono → Aplicaciones → {" "}
              {typeof document !== "undefined" ? document.title : "la app"}. Luego vuelve aquí y
              activa el interruptor.
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
