"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Bell,
  Smartphone,
  Check,
  X,
  Loader2,
  TriangleAlert,
  ShieldCheck,
} from "lucide-react";
import { activarUbicacion } from "@/components/PositionReporter";

/**
 * Permisos que el mensajero necesita para trabajar.
 *
 * POR QUÉ ESTA PANTALLA EXISTE
 * En la web los permisos no se pueden exigir "al instalar": el navegador solo
 * los concede en caliente y a raíz de un gesto de la persona. No hay un campo
 * en el manifest que los pida por adelantado. Lo más cerca que se puede estar
 * de eso es esto: pedirlos todos juntos al empezar el turno, explicando para
 * qué sirve cada uno, y no dejar pasar sin el de ubicación.
 *
 * La preferencia queda por dispositivo. Si el mensajero ya los concedió, esta
 * pantalla no vuelve a aparecer.
 */

const LS_LISTO = "at_permisos_ok_v1";

type Estado = "concedido" | "denegado" | "pendiente" | "no_soportado";

interface Permiso {
  clave: "ubicacion" | "notificaciones" | "pantalla";
  titulo: string;
  porque: string;
  obligatorio: boolean;
  icono: React.ReactNode;
}

const PERMISOS: Permiso[] = [
  {
    clave: "ubicacion",
    titulo: "Ubicación",
    porque:
      "Es lo que permite que el CEDI y el comercio vean por dónde vas. Sin esto no se puede hacer el rastreo en vivo.",
    obligatorio: true,
    icono: <MapPin className="h-5 w-5" />,
  },
  {
    clave: "notificaciones",
    titulo: "Notificaciones",
    porque:
      "Para avisarte cuando te asignen una recogida o cuando un comercio cambie o cancele la que llevas.",
    obligatorio: false,
    icono: <Bell className="h-5 w-5" />,
  },
  {
    clave: "pantalla",
    titulo: "Mantener la pantalla encendida",
    porque:
      "Si el teléfono se bloquea, el navegador deja de enviar tu posición. Con esto el rastreo aguanta todo el recorrido.",
    obligatorio: false,
    icono: <Smartphone className="h-5 w-5" />,
  },
];

export function PermisosTurno() {
  const [abierto, setAbierto] = useState(false);
  const [estados, setEstados] = useState<Record<string, Estado>>({
    ubicacion: "pendiente",
    notificaciones: "pendiente",
    pantalla: "pendiente",
  });
  const [pidiendo, setPidiendo] = useState<string | null>(null);

  // Lee el estado actual sin disparar ningún diálogo: la Permissions API
  // permite preguntar "¿cómo está esto?" sin molestar a nadie.
  const revisar = useCallback(async () => {
    const siguiente: Record<string, Estado> = {
      ubicacion: "pendiente",
      notificaciones: "pendiente",
      pantalla: "pendiente",
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      siguiente.ubicacion = "no_soportado";
    } else if (navigator.permissions?.query) {
      try {
        const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        siguiente.ubicacion =
          p.state === "granted" ? "concedido" : p.state === "denied" ? "denegado" : "pendiente";
      } catch {
        /* Safari viejo no sabe consultar geolocation: se queda en pendiente */
      }
    }

    if (typeof Notification === "undefined") {
      siguiente.notificaciones = "no_soportado";
    } else {
      siguiente.notificaciones =
        Notification.permission === "granted"
          ? "concedido"
          : Notification.permission === "denied"
            ? "denegado"
            : "pendiente";
    }

    siguiente.pantalla =
      typeof navigator !== "undefined" && "wakeLock" in navigator ? "pendiente" : "no_soportado";

    setEstados(siguiente);
    return siguiente;
  }, []);

  useEffect(() => {
    (async () => {
      const s = await revisar();
      // Solo se interrumpe si falta lo imprescindible y no se ha resuelto antes.
      const yaListo = window.localStorage.getItem(LS_LISTO) === "1";
      const faltaUbicacion = s.ubicacion !== "concedido" && s.ubicacion !== "no_soportado";
      if (faltaUbicacion || (!yaListo && s.notificaciones === "pendiente")) {
        setAbierto(true);
      }
    })();
  }, [revisar]);

  // ── Pedir cada permiso ──────────────────────────────────────────────────
  async function pedirUbicacion() {
    setPidiendo("ubicacion");
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setEstados((e) => ({ ...e, ubicacion: "concedido" }));
          activarUbicacion(); // queda rastreando desde ya
          setPidiendo(null);
          resolve();
        },
        (err) => {
          setEstados((e) => ({
            ...e,
            ubicacion: err.code === err.PERMISSION_DENIED ? "denegado" : "pendiente",
          }));
          setPidiendo(null);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  async function pedirNotificaciones() {
    if (typeof Notification === "undefined") return;
    setPidiendo("notificaciones");
    try {
      const r = await Notification.requestPermission();
      setEstados((e) => ({
        ...e,
        notificaciones: r === "granted" ? "concedido" : r === "denied" ? "denegado" : "pendiente",
      }));
    } finally {
      setPidiendo(null);
    }
  }

  async function pedirPantalla() {
    setPidiendo("pantalla");
    try {
      // Se pide y se suelta: aquí solo interesa saber si el equipo lo permite.
      // Quien lo mantiene tomado durante el turno es PositionReporter.
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
      };
      const lock = await nav.wakeLock!.request("screen");
      await lock.release();
      setEstados((e) => ({ ...e, pantalla: "concedido" }));
      window.localStorage.setItem("at_wakelock_ok", "1");
    } catch {
      setEstados((e) => ({ ...e, pantalla: "denegado" }));
    } finally {
      setPidiendo(null);
    }
  }

  // Pide los tres en cadena. Van uno tras otro a propósito: si se lanzan a la
  // vez, el navegador descarta todos los diálogos menos el primero.
  async function pedirTodos() {
    if (estados.ubicacion !== "concedido") await pedirUbicacion();
    if (estados.notificaciones === "pendiente") await pedirNotificaciones();
    if (estados.pantalla === "pendiente") await pedirPantalla();
  }

  function cerrar() {
    window.localStorage.setItem(LS_LISTO, "1");
    setAbierto(false);
  }

  if (!abierto) return null;

  const ubicacionLista = estados.ubicacion === "concedido" || estados.ubicacion === "no_soportado";
  const todoResuelto = Object.values(estados).every((e) => e !== "pendiente");

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center sm:p-0">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[32px] bg-[#FFFFFF] shadow-2xl duration-300 animate-in slide-in-from-bottom-8 sm:zoom-in-95 dark:bg-[#2C2C2E]">
        <div className="space-y-1 p-6 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff812c]/10">
            <ShieldCheck className="h-6 w-6 text-[#ff812c]" />
          </div>
          <h2 className="pt-2 text-[21px] font-bold text-slate-900 dark:text-white">
            Permisos para salir a ruta
          </h2>
          <p className="text-[15px] text-slate-500 dark:text-slate-400">
            Concédelos una sola vez y no te los volvemos a pedir. El de ubicación es el que
            hace posible el rastreo en vivo.
          </p>
        </div>

        <div className="space-y-3 px-6">
          {PERMISOS.map((p) => {
            const estado = estados[p.clave];
            return (
              <div
                key={p.clave}
                className="flex gap-3 rounded-2xl bg-[#F2F2F7] p-4 dark:bg-[#1C1C1E]"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    estado === "concedido"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : estado === "denegado"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-[#ff812c]/10 text-[#ff812c]"
                  }`}
                >
                  {estado === "concedido" ? <Check className="h-5 w-5" /> : p.icono}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      {p.titulo}
                    </p>
                    {p.obligatorio && (
                      <span className="rounded-full bg-[#ff812c]/15 px-2 py-0.5 text-[11px] font-semibold text-[#ff812c]">
                        Necesario
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                    {p.porque}
                  </p>

                  {estado === "denegado" && (
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-rose-600 dark:text-rose-400">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Lo bloqueaste antes. Ábrelo en el candado de la barra de direcciones →
                      Permisos → {p.titulo}.
                    </p>
                  )}
                  {estado === "no_soportado" && (
                    <p className="mt-2 text-[13px] text-slate-400 dark:text-slate-500">
                      Este teléfono no lo permite.
                    </p>
                  )}
                </div>

                {estado === "pendiente" && (
                  <button
                    type="button"
                    onClick={() =>
                      p.clave === "ubicacion"
                        ? pedirUbicacion()
                        : p.clave === "notificaciones"
                          ? pedirNotificaciones()
                          : pedirPantalla()
                    }
                    disabled={pidiendo !== null}
                    className="h-10 shrink-0 self-center rounded-xl bg-[#ff812c] px-4 text-[14px] font-bold text-[#1C1C1E] transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {pidiendo === p.clave ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Permitir"
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 p-6">
          {!ubicacionLista && (
            <p className="flex items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Sin ubicación nadie puede ver por dónde vas y el comercio se queda sin rastreo.
            </p>
          )}
          <div className="flex gap-3">
            {ubicacionLista && (
              <button
                type="button"
                onClick={cerrar}
                className="min-h-[52px] flex-1 rounded-2xl bg-[#F2F2F7] font-semibold text-slate-700 transition-transform active:scale-[0.98] dark:bg-[#1C1C1E] dark:text-slate-300"
              >
                {todoResuelto ? "Listo" : "Seguir sin los demás"}
              </button>
            )}
            <button
              type="button"
              onClick={pedirTodos}
              disabled={pidiendo !== null}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {pidiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              <span>{ubicacionLista ? "Conceder el resto" : "Conceder permisos"}</span>
            </button>
          </div>
          {!ubicacionLista && (
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] text-slate-400 dark:text-slate-500"
            >
              <X className="h-3.5 w-3.5" /> Ahora no
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
