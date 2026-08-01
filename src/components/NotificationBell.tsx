"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useNotificaciones } from "@/components/NotificationsContext";
import { formatDateTime } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

/**
 * La campana, y nada más que la campana.
 *
 * Se pinta dos veces (header del teléfono y barra del escritorio), así que aquí
 * no puede vivir nada que no se pueda hacer por duplicado: los datos, el sondeo
 * y la suscripción a Realtime están en NotificationsContext, una sola vez.
 */
export function NotificationBell({
  /**
   * Hacia dónde se abre el panel. En el header del teléfono la campana está
   * pegada al borde derecho y tiene que abrirse hacia la izquierda; en la barra
   * lateral del escritorio es al revés, si no el panel de 320 px se sale de la
   * pantalla por la izquierda y queda cortado.
   */
  align = "right",
}: {
  align?: "left" | "right";
} = {}) {
  const noti = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cierra al tocar afuera o con Escape. `pointerdown` y no `mousedown` para
  // que también valga el dedo en el teléfono, no solo el ratón.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!noti) return null;

  const { items, sinLeer, marcarLeidas } = noti;

  async function abrir(n: AppNotification) {
    setAbierto(false);
    await noti!.abrir(n);
  }

  return (
    <div className="relative" ref={caja}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={
          sinLeer.length > 0
            ? `Notificaciones, ${sinLeer.length} sin leer`
            : "Notificaciones"
        }
        aria-expanded={abierto}
        className="relative w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        {sinLeer.length > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff812c] text-white text-[10px] font-bold leading-none">
            {sinLeer.length}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* Teléfono: fondo oscuro, porque abajo el panel es una hoja que sube
              desde el borde, igual que los demás diálogos de la app. */}
          <div
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm sm:hidden"
            aria-hidden
          />
          {/* En teléfono la campana no está pegada al borde (a su derecha van el
              botón de tema y el margen), así que un panel anclado a ella se
              salía 32 px de la pantalla. Abajo ocupa todo el ancho y arriba, con
              sitio de sobra, sigue siendo un desplegable anclado. */}
          <div
            className={`fixed inset-x-0 bottom-0 z-[60] flex max-h-[80dvh] flex-col overflow-hidden rounded-t-3xl border-t border-gray-100 bg-[#FFFFFF] pb-safe shadow-2xl dark:border-gray-800 dark:bg-[#2C2C2E] sm:absolute sm:inset-x-auto sm:bottom-auto sm:mt-2 sm:max-h-[min(28rem,calc(100dvh-6rem))] sm:w-[320px] sm:rounded-2xl sm:border sm:pb-0 ${
              align === "left" ? "sm:left-0" : "sm:right-0"
            }`}
          >
            {/* Asa: en una hoja inferior indica que se puede cerrar deslizando. */}
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" />

            {/* Cabecera fija: el título puede recortarse, pero «Marcar leídas»
                nunca se encoge ni se monta encima — es la única acción del panel. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="min-w-0 truncate text-[15px] font-semibold text-slate-900 dark:text-white">
                Notificaciones
              </p>
              {sinLeer.length > 0 && (
                <button
                  onClick={() => marcarLeidas()}
                  className="-mr-2 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-semibold text-[#ff812c] transition-colors hover:bg-[#ff812c]/10 active:opacity-70"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" /> Marcar leídas
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-[14px] text-slate-500 dark:text-slate-400">
                No tienes notificaciones
              </p>
            ) : (
              /* La lista es la que se desplaza, no el panel entero: así la
                 cabecera con «Marcar leídas» queda siempre a la vista. */
              <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain dark:divide-gray-800">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        n.read_at ? "" : "bg-[#ff812c]/5"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Punto de «sin leer»: reserva su sitio siempre, para que
                            el texto de todas las filas arranque a la misma altura
                            y la lista no quede escalonada. */}
                        <span
                          className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                            n.read_at ? "bg-transparent" : "bg-[#ff812c]"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold leading-snug text-slate-900 dark:text-white">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                            {formatDateTime(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
