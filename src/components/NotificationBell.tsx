"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

const REFRESH_MS = 30000;

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as AppNotification[]) ?? []);
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Cierra al hacer clic afuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const sinLeer = items.filter((n) => !n.read_at);

  async function marcarLeidas() {
    if (sinLeer.length === 0) return;
    const supabase = createClient();
    await supabase
      .from("at_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", sinLeer.map((n) => n.id));
    cargar();
  }

  async function abrir(n: AppNotification) {
    if (!n.read_at) {
      const supabase = createClient();
      await supabase
        .from("at_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", n.id);
    }
    setAbierto(false);
    cargar();
    if (n.link) router.push(n.link);
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
                onClick={marcarLeidas}
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
