"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapPin,
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
 * pantalla no vuelve a aparecer sola — pero SÍ se puede reabrir a mano desde
 * /mi-perfil (evento EVENTO_REABRIR más abajo), que es lo que hacía falta
 * cuando alguien probaba con otra cuenta o ya había resuelto el permiso antes
 * en ese teléfono: antes de esto no había NINGÚN otro sitio de la app que
 * tocara una API de permisos, así que quien no viera este modal en el primer
 * arranque no lo volvía a ver jamás.
 */

const LS_LISTO = "at_permisos_ok_v1";
/** Reabre el diálogo a demanda, sin importar si ya se resolvió antes. */
const EVENTO_REABRIR = "at:revisar-permisos";

type Estado = "concedido" | "denegado" | "pendiente" | "no_soportado";

interface Permiso {
  clave: "ubicacion" | "pantalla";
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
    clave: "pantalla",
    titulo: "Mantener la pantalla encendida",
    porque:
      "Si el teléfono se bloquea, el navegador deja de enviar tu posición. Con esto el rastreo aguanta todo el recorrido.",
    obligatorio: false,
    icono: <Smartphone className="h-5 w-5" />,
  },
  // No hay «Notificaciones» aquí a propósito. Prometía avisar de recogidas
  // asignadas, pero eso necesita push —VAPID, suscripción, un backend que
  // mande el push— y nada de eso existe todavía en el proyecto. Pedirlo
  // gastaba el ÚNICO diálogo que el navegador concede para notificaciones a
  // cambio de una función que no hacía nada. El día que exista push de
  // verdad, vuelve aquí.
];

function esAndroid() {
  return typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
}

/**
 * Cómo recuperar un permiso bloqueado, según el sistema.
 *
 * Antes decía «el candado de la barra de direcciones», que ya no existe en
 * Android Chrome (desde la versión 117 es un icono de controles deslizantes),
 * y con la PWA instalada no hay barra de direcciones en absoluto.
 */
function comoRecuperar(): string {
  if (esAndroid()) {
    return "Ajustes del teléfono → Aplicaciones → esta app → Permisos → Ubicación → Permitir. " +
      "Si la abres desde el navegador y no como app instalada: toca el icono junto a la dirección → Permisos.";
  }
  return "Ajustes del iPhone → esta app (o Safari, si no la instalaste) → Ubicación → Permitir.";
}

export function PermisosTurno() {
  const [abierto, setAbierto] = useState(false);
  const [estados, setEstados] = useState<Record<string, Estado>>({
    ubicacion: "pendiente",
    pantalla: "pendiente",
  });
  const [pidiendo, setPidiendo] = useState<string | null>(null);
  /** POSITION_UNAVAILABLE o TIMEOUT: el permiso está bien, el GPS no responde. */
  const [gpsSinSenal, setGpsSinSenal] = useState(false);

  // Lee el estado actual sin disparar ningún diálogo: la Permissions API
  // permite preguntar "¿cómo está esto?" sin molestar a nadie.
  const revisar = useCallback(async () => {
    const siguiente: Record<string, Estado> = {
      ubicacion: "pendiente",
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
        /* Safari viejo no sabe consultar geolocation: cae al respaldo de abajo */
      }
    }

    // Safari (iOS) no implementa permissions.query para geolocation: el catch
    // de arriba deja "pendiente", y como eso cuenta como "falta", el modal se
    // abría en CADA arranque de la app aunque el permiso ya estuviera
    // concedido hacía semanas. Si ya pasó por este flujo antes en este
    // teléfono (LS_LISTO) y la API de geolocalización existe, se confía en
    // eso en vez de interrumpir cada vez. Si de verdad está bloqueado, el
    // propio watchPosition lo va a decir con PERMISSION_DENIED y
    // PositionReporter muestra su aviso.
    if (
      siguiente.ubicacion === "pendiente" &&
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      window.localStorage.getItem(LS_LISTO) === "1"
    ) {
      siguiente.ubicacion = "concedido";
    }

    siguiente.pantalla =
      typeof navigator !== "undefined" && "wakeLock" in navigator ? "pendiente" : "no_soportado";

    setEstados(siguiente);
    return siguiente;
  }, []);

  useEffect(() => {
    (async () => {
      const s = await revisar();
      // Solo se interrumpe si falta lo imprescindible.
      //
      // "no_soportado" NO cuenta como resuelto para la ubicación —a
      // diferencia de "pantalla", que es opcional—: cuando !navigator.geolocation
      // el motivo casi siempre es abrir el enlace dentro del navegador
      // embebido de WhatsApp o Instagram, y esos SÍ se arreglan con la
      // instrucción de abajo. Contarlo como "listo" dejaba a esa persona sin
      // ubicación para siempre y sin que nadie se lo dijera.
      const faltaUbicacion = s.ubicacion !== "concedido";
      if (faltaUbicacion) setAbierto(true);
    })();
  }, [revisar]);

  // Reapertura a demanda desde /mi-perfil: sin esto, el único momento en que
  // alguien veía este diálogo era el primer arranque del teléfono.
  useEffect(() => {
    const reabrir = () => {
      revisar();
      setGpsSinSenal(false);
      setAbierto(true);
    };
    window.addEventListener(EVENTO_REABRIR, reabrir);
    return () => window.removeEventListener(EVENTO_REABRIR, reabrir);
  }, [revisar]);

  // ── Pedir cada permiso ──────────────────────────────────────────────────
  async function pedirUbicacion() {
    setPidiendo("ubicacion");
    setGpsSinSenal(false);
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async () => {
          setEstados((e) => ({ ...e, ubicacion: "concedido" }));
          await activarUbicacion(); // queda rastreando desde ya
          setPidiendo(null);
          resolve();
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setEstados((e) => ({ ...e, ubicacion: "denegado" }));
          } else {
            // POSITION_UNAVAILABLE o TIMEOUT: el permiso está bien, es el GPS
            // del teléfono el que no responde —apagado, dentro de un
            // edificio—. Antes esto se tragaba en silencio: el botón volvía
            // a "Permitir" sin decir nada, y quien lo tocara veía girar el
            // spinner 15 segundos para nada.
            setEstados((e) => ({ ...e, ubicacion: "pendiente" }));
            setGpsSinSenal(true);
          }
          setPidiendo(null);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
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
    } catch {
      setEstados((e) => ({ ...e, pantalla: "denegado" }));
    } finally {
      setPidiendo(null);
    }
  }

  function cerrar() {
    window.localStorage.setItem(LS_LISTO, "1");
    setAbierto(false);
  }

  if (!abierto) return null;

  const ubicacionDenegada = estados.ubicacion === "denegado";
  const ubicacionLista = estados.ubicacion === "concedido";
  const todoResuelto = estados.ubicacion === "concedido" && estados.pantalla !== "pendiente";

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
            const denegado = estado === "denegado";
            return (
              <div
                key={p.clave}
                className="flex gap-3 rounded-2xl atl-relleno p-4 "
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    estado === "concedido"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : denegado
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

                  {denegado && (
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-rose-600 dark:text-rose-400">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Lo bloqueaste antes. {comoRecuperar()} Vuelve aquí cuando lo cambies.
                    </p>
                  )}
                  {p.clave === "ubicacion" && gpsSinSenal && estado === "pendiente" && (
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      El permiso está bien; es el GPS del teléfono el que no responde. Revisa
                      que la ubicación esté encendida en los ajustes del sistema (no del
                      navegador) e inténtalo de nuevo.
                    </p>
                  )}
                  {estado === "no_soportado" && p.clave === "ubicacion" && (
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Este navegador no puede darte ubicación. Si abriste el enlace desde
                      WhatsApp o Instagram, tócalo y elige «Abrir en Chrome».
                    </p>
                  )}
                  {estado === "no_soportado" && p.clave !== "ubicacion" && (
                    <p className="mt-2 text-[13px] text-slate-400 dark:text-slate-500">
                      Este teléfono no lo permite.
                    </p>
                  )}
                </div>

                {/* Sin botón cuando está denegado: Chrome no vuelve a abrir el
                    diálogo nativo con el sitio bloqueado, así que un botón
                    "Permitir" ahí sería un no-op — se toca y no pasa nada
                    visible. La salida real son los ajustes del sistema, ya
                    explicados arriba. */}
                {estado === "pendiente" && (
                  <button
                    type="button"
                    onClick={() => (p.clave === "ubicacion" ? pedirUbicacion() : pedirPantalla())}
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
          {!ubicacionLista && !ubicacionDenegada && (
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
                className="min-h-[52px] flex-1 rounded-2xl atl-relleno font-semibold text-slate-700 transition-transform active:scale-[0.98]  dark:text-slate-300"
              >
                {todoResuelto ? "Listo" : "Seguir sin los demás"}
              </button>
            )}
            {/* Cuando la ubicación está denegada no hay nada que este botón
                pueda lograr — el navegador no vuelve a preguntar—, así que no
                se ofrece: solo confundiría. La salida es cerrar sesión de la
                pantalla o arreglarlo en los ajustes del sistema. */}
            {!ubicacionDenegada && (
              <button
                type="button"
                onClick={pedirUbicacion}
                disabled={pidiendo !== null}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {pidiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                <span>{ubicacionLista ? "Conceder el resto" : "Conceder ubicación"}</span>
              </button>
            )}
          </div>
          {!ubicacionLista && (
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] text-slate-400 dark:text-slate-500"
            >
              <X className="h-3.5 w-3.5" /> {ubicacionDenegada ? "Ya lo cambié / lo hago después" : "Ahora no"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Reabre el diálogo a demanda. Lo usa el botón «Revisar permisos» de /mi-perfil. */
export function reabrirPermisosTurno() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_REABRIR));
}
