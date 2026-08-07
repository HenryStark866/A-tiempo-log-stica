"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Circle, LoaderCircle, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { BuscadorGuia } from "@/components/BuscadorGuia";
import { DemasiadasSolicitudes } from "@/components/DemasiadasSolicitudes";
import { StatusBadge } from "@/components/StatusBadge";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { GUIA_EJEMPLO } from "@/lib/marca";
import { formatDateTime, esDemasiadasSolicitudes } from "@/lib/utils";
import type { TrackingResult } from "@/lib/types";

import { FondoRastreo } from "@/components/fondos/FondoRastreo";
export default function TrackingPage() {
  const { numero } = useParams<{ numero: string }>();
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [frenado, setFrenado] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("at_track_guide", { p_guide_number: decodeURIComponent(numero) })
      .then(({ data, error }) => {
        setLoading(false);
        // Frenado no es lo mismo que inexistente: decirle a alguien que su
        // guía no existe cuando solo iba muy rápido es una alarma falsa.
        if (esDemasiadasSolicitudes(error)) {
          setFrenado(true);
          return;
        }
        if (error || !data) {
          setNotFound(true);
          return;
        }
        setResult(data as TrackingResult);
      });
  }, [numero]);

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300 pb-12">
      <FondoRastreo />
      {/* Navigation Header */}
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60 transition-colors duration-300">
        <div className="mx-auto max-w-md flex items-center justify-between px-4 h-14">
          <Link href="/" className="active:opacity-70 transition-opacity">
            <Logo />
          </Link>
          <Link
            href="/login"
            className="text-[15px] font-semibold text-[#ff812c] active:opacity-70 transition-opacity"
          >
            Ingresar
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 pt-6 space-y-6">
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-6 shadow-sm transition-colors duration-300">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
              <LoaderCircle className="w-8 h-8 animate-spin text-[#ff812c]" />
              <p className="text-[16px] font-medium">Consultando guía…</p>
            </div>
          ) : frenado ? (
            <DemasiadasSolicitudes onReintentar={() => window.location.reload()} />
          ) : notFound || !result ? (
            /* Quien se equivoca de número lo corrige aquí mismo. Antes solo
               había un botón «volver al inicio», que obligaba a empezar de
               cero para cambiar un dígito. */
            <div className="py-8 text-center">
              <PackageX className="mx-auto mb-4 w-12 h-12 text-slate-400 dark:text-slate-500" />
              <h1 className="text-[22px] font-bold text-slate-900 dark:text-white">
                No encontramos esa guía
              </h1>
              <p className="mx-auto mt-2 mb-6 max-w-xs text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                Revisa el número que buscaste
                <span className="mt-1 block font-semibold text-slate-700 dark:text-slate-300 break-all">
                  {decodeURIComponent(numero)}
                </span>
                <span className="mt-2 block">Debería verse como {GUIA_EJEMPLO}.</span>
              </p>
              <div className="text-left">
                <BuscadorGuia textoBoton="Buscar de nuevo" />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4 transition-colors">
                <div>
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Guía
                  </p>
                  <h1 className="text-[24px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {result.guide_number}
                  </h1>
                </div>
                <StatusBadge status={result.status} large />
              </div>

              <div className="mb-8 space-y-1">
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Destino: <span className="font-semibold text-slate-900 dark:text-white">{result.recipient_city}</span>
                </p>
                <p className="text-[15px] text-slate-500 dark:text-slate-400">
                  Intentos de entrega: <span className="font-semibold text-slate-900 dark:text-white">{result.delivery_attempts}</span>
                </p>
              </div>

              <h2 className="mb-5 text-[15px] font-semibold text-slate-900 dark:text-white">
                Historial de movimientos
              </h2>
              <ol className="space-y-0">
                {[...result.events].reverse().map((ev, i) => (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < result.events.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-full w-[2px] bg-gray-200 dark:bg-gray-700 transition-colors" />
                    )}
                    {i === 0 ? (
                      <CheckCircle2 className="relative z-10 w-6 h-6 shrink-0 text-[#ff812c] bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-full transition-colors" />
                    ) : (
                      <Circle className="relative z-10 w-6 h-6 shrink-0 text-slate-300 dark:text-slate-600 fill-white dark:fill-[#2C2C2E] transition-colors" />
                    )}
                    <div>
                      <p className={`text-[16px] font-semibold ${i === 0 ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                        {GUIDE_STATUS_LABELS[ev.status]}
                      </p>
                      <p className="text-[14px] text-slate-500 dark:text-slate-500 mt-0.5">
                        {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
