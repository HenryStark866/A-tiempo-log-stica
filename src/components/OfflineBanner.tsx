"use client";

import { useState } from "react";
import { CloudOff, Loader2, RefreshCw, TriangleAlert, WifiOff, X } from "lucide-react";
import { useOffline } from "@/components/OfflineContext";

/**
 * Un aviso quieto casi siempre: si hay señal y no hay nada pendiente, no
 * pinta nada. Aparece solo cuando importa —sin conexión, o con trabajo
 * esperando a subirse— y desaparece solo cuando deja de ser cierto.
 *
 * Va por encima de la barra de pestañas del teléfono (mismo `z-30` que el
 * resto del armazón) pero pegado a su borde superior, para no tapar los
 * botones de abajo.
 */
export function OfflineBanner() {
  const { enLinea, pendientes, sincronizando, descartar, reintentarAhora } = useOffline();
  const [abierto, setAbierto] = useState(false);

  const conflictos = pendientes.filter((a) => a.conflicto);
  const enEspera = pendientes.filter((a) => !a.conflicto);

  if (enLinea && pendientes.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[var(--atl-nav)] md:bottom-0 z-30 px-3 pb-3 md:pl-[calc(14rem+0.75rem)] lg:pl-[calc(16rem+0.75rem)] pointer-events-none">
      <div className="max-w-md ml-auto md:ml-0 pointer-events-auto">
        <button
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center gap-2.5 rounded-2xl bg-[#1C1C1E] dark:bg-[#2C2C2E] px-4 py-3 text-left shadow-lg border border-white/10 active:scale-[0.99] transition-transform"
        >
          {!enLinea ? (
            <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
          ) : sincronizando ? (
            <Loader2 className="w-5 h-5 text-[#ff812c] shrink-0 animate-spin" />
          ) : conflictos.length > 0 ? (
            <TriangleAlert className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CloudOff className="w-5 h-5 text-[#ff812c] shrink-0" />
          )}
          <span className="flex-1 min-w-0 text-[13px] font-semibold text-white truncate">
            {!enLinea
              ? "Sin conexión — tu trabajo se guarda y sube solo"
              : sincronizando
                ? "Sincronizando…"
                : conflictos.length > 0
                  ? `${conflictos.length} acción(es) necesitan revisión`
                  : `${enEspera.length} acción(es) esperando señal`}
          </span>
          {pendientes.length > 0 && (
            <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/15 text-white text-[11px] font-bold flex items-center justify-center">
              {pendientes.length}
            </span>
          )}
        </button>

        {abierto && pendientes.length > 0 && (
          <div className="mt-2 rounded-2xl bg-[#1C1C1E] dark:bg-[#2C2C2E] shadow-lg border border-white/10 overflow-hidden max-h-64 overflow-y-auto">
            <ul className="divide-y divide-white/10">
              {pendientes.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white truncate">{a.resumen}</p>
                    {a.conflicto ? (
                      <p className="mt-0.5 text-[12px] text-rose-400 leading-snug">{a.conflicto}</p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-slate-400">Esperando señal para subir</p>
                    )}
                  </div>
                  {a.conflicto && (
                    <button
                      onClick={() => descartar(a.id)}
                      aria-label="Descartar esta acción"
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {enLinea && enEspera.length > 0 && (
              <button
                onClick={reintentarAhora}
                disabled={sincronizando}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-semibold text-[#ff812c] border-t border-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${sincronizando ? "animate-spin" : ""}`} />
                Reintentar ahora
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
