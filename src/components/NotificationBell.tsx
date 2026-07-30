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
export function NotificationBell() {
  const noti = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cierra al hacer clic afuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
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
        aria-label="Notificaciones"
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
        <div className="absolute right-0 mt-2 w-[320px] max-w-[85vw] rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[15px] font-semibold text-slate-900 dark:text-white">Notificaciones</p>
            {sinLeer.length > 0 && (
              <button
                onClick={() => marcarLeidas()}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#ff812c] active:opacity-70"
              >
                <Check className="w-3.5 h-3.5" /> Marcar leídas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-slate-500 dark:text-slate-400">
              No tienes notificaciones
            </p>
          ) : (
            <ul className="max-h-[380px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => abrir(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      n.read_at ? "" : "bg-[#ff812c]/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#ff812c] shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{n.body}</p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
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
      )}
    </div>
  );
}
