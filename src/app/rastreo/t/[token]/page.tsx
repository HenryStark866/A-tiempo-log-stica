"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Circle, ExternalLink, LoaderCircle, PackageX, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DemasiadasSolicitudes } from "@/components/DemasiadasSolicitudes";
import { Logo } from "@/components/Logo";
import { StatusBadge } from "@/components/StatusBadge";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, esDemasiadasSolicitudes } from "@/lib/utils";
import type { TrackingByToken } from "@/lib/types";

import { FondoRastreo } from "@/components/fondos/FondoRastreo";
/** Cada cuánto se vuelve a preguntar la posición mientras el paquete va en ruta. */
const REFRESCO_MS = 30_000;

function haceCuanto(iso: string): string {
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "hace un momento";
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

export default function TrackingByTokenPage() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<TrackingByToken | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [frenado, setFrenado] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_track_guide_by_token", {
      p_token: decodeURIComponent(token),
    });
    setLoading(false);
    // Esta pantalla se refresca sola cada 30 segundos mientras el pedido va en
    // camino. Si un refresco choca con el freno, se deja lo que ya está en
    // pantalla y se espera al siguiente: al destinatario no se le puede borrar
    // el mapa del mensajero por un contador. Solo se avisa si todavía no
    // habíamos logrado cargar nada.
    if (esDemasiadasSolicitudes(error)) {
      setFrenado((f) => f || !data);
      return;
    }
    setFrenado(false);
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setResult(data as TrackingByToken);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Mientras el paquete va en la calle la posición cambia, así que se refresca
  // sola. En cualquier otro estado no hay nada que actualizar y se deja quieta.
  useEffect(() => {
    if (result?.status !== "en_ruta") return;
    const id = setInterval(load, REFRESCO_MS);
    return () => clearInterval(id);
  }, [result?.status, load]);

  const hayPosicion =
    result?.status === "en_ruta" &&
    typeof result.courier_lat === "number" &&
    typeof result.courier_lng === "number";

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300 pb-12">
      <FondoRastreo />
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-slate-900/[0.06] dark:border-white/[0.08] transition-colors duration-300">
        <div className="mx-auto max-w-md flex items-center justify-between px-4 h-14">
          <Link href="/" className="active:opacity-70 transition-opacity">
            <Logo />
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 pt-6 space-y-4">
        {loading ? (
          <div className="rounded-3xl atl-superficie p-6 shadow-sm">
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
              <LoaderCircle className="w-8 h-8 animate-spin text-[#ff812c]" />
              <p className="text-[16px] font-medium">Consultando tu pedido…</p>
            </div>
          </div>
        ) : frenado && !result ? (
          <div className="rounded-3xl atl-superficie p-6 shadow-sm">
            <DemasiadasSolicitudes onReintentar={load} />
          </div>
        ) : notFound || !result ? (
          <div className="rounded-3xl atl-superficie p-6 shadow-sm py-12 text-center">
            <PackageX className="mx-auto mb-4 w-12 h-12 text-slate-400 dark:text-slate-500" />
            <h1 className="text-[22px] font-bold">Este enlace no corresponde a ningún envío</h1>
            <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400 mb-8">
              Vuelve a escanear el código del paquete.
            </p>
            <Link
              href="/"
              className="w-full flex items-center justify-center bg-[#ff812c] active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px]"
            >
              Ir al inicio
            </Link>
          </div>
        ) : (
          <>
            {/* En ruta: es lo que el comprador abrió a mirar, va primero. */}
            {hayPosicion && (
              <div className="overflow-hidden rounded-3xl atl-superficie shadow-sm">
                <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                  <div className="rounded-full bg-[#ff812c] p-2.5 shrink-0">
                    <Truck className="w-5 h-5 text-[#1C1C1E]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold leading-tight">Tu pedido va en camino</p>
                    <p className="text-[14px] text-slate-500 dark:text-slate-400">
                      {result.courier_name ?? "Tu mensajero"}
                      {result.courier_position_at &&
                        ` · actualizado ${haceCuanto(result.courier_position_at)}`}
                    </p>
                  </div>
                </div>

                <iframe
                  title="Ubicación del mensajero"
                  className="h-64 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                    result.courier_lng! - 0.008
                  },${result.courier_lat! - 0.006},${result.courier_lng! + 0.008},${
                    result.courier_lat! + 0.006
                  }&layer=mapnik&marker=${result.courier_lat},${result.courier_lng}`}
                />

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${result.courier_lat},${result.courier_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border-t border-slate-900/[0.06] dark:border-white/[0.08] py-3.5 text-[15px] font-semibold text-[#ff812c] active:opacity-70"
                >
                  Abrir en el mapa <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}

            <div className="rounded-3xl atl-superficie p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[0.06] dark:border-white/[0.08] pb-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Pedido
                  </p>
                  <h1 className="text-[24px] font-extrabold tracking-tight">
                    {result.guide_number}
                  </h1>
                </div>
                <StatusBadge status={result.status} large />
              </div>

              <div className="mb-8 space-y-1">
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Para: <span className="font-semibold text-slate-900 dark:text-white">{result.recipient_name}</span>
                </p>
                {result.business_name && (
                  <p className="text-[15px] text-slate-500 dark:text-slate-400">
                    Enviado por: <span className="font-semibold text-slate-900 dark:text-white">{result.business_name}</span>
                  </p>
                )}
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Destino: <span className="font-semibold text-slate-900 dark:text-white">{result.recipient_city}</span>
                </p>
              </div>

              <h2 className="mb-5 text-[15px] font-semibold">Historial de movimientos</h2>
              <ol className="space-y-0">
                {[...result.events].reverse().map((ev, i) => (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < result.events.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-full w-[2px] bg-gray-200 dark:bg-gray-700" />
                    )}
                    {i === 0 ? (
                      <CheckCircle2 className="relative z-10 w-6 h-6 shrink-0 text-[#ff812c] atl-superficie rounded-full" />
                    ) : (
                      <Circle className="relative z-10 w-6 h-6 shrink-0 text-slate-300 dark:text-slate-600 fill-white dark:fill-[#2C2C2E]" />
                    )}
                    <div>
                      <p
                        className={`text-[16px] font-semibold ${
                          i === 0 ? "" : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {GUIDE_STATUS_LABELS[ev.status]}
                      </p>
                      <p className="text-[14px] text-slate-500 mt-0.5">
                        {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
