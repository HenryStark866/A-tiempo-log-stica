"use client";

import { useEffect } from "react";
import { RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { esErrorDeVersion, recargarPorVersionNueva } from "@/lib/recuperacion";
import { reportarError } from "@/lib/observabilidad";

/**
 * Lo que ve la persona cuando una pantalla falla.
 *
 * Se comparte entre los error boundaries de la app para que el mensajero vea
 * siempre lo mismo, falle donde falle: qué pasó, que no perdió trabajo, y dos
 * botones grandes. El detalle técnico va abajo y en pequeño, pero va: sin él no
 * hay forma de arreglar un fallo que solo ocurre en el teléfono de alguien.
 */
export function PantallaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recargarPorVersionNueva(error);
    // Va aquí y no en cada error.tsx porque los dos boundaries —el público y
    // el de la plataforma— pasan por este componente: un solo sitio que tocar.
    // Los errores de versión se dejan fuera: no son un fallo, es la app
    // detectando un despliegue nuevo, y llenarían el log cada vez que se
    // publica.
    if (!esErrorDeVersion(error)) {
      reportarError(error, { origen: "error-boundary" });
    }
  }, [error]);

  const porVersion = esErrorDeVersion(error);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 font-sans">
      <div className="w-full max-w-md rounded-3xl bg-[#FFFFFF] p-8 text-center shadow-sm dark:bg-[#2C2C2E]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff812c]/10">
          <TriangleAlert className="h-6 w-6 text-[#ff812c]" />
        </div>

        <h1 className="mt-4 text-[21px] font-bold text-slate-900 dark:text-white">
          {porVersion ? "Hay una versión nueva" : "Esta pantalla falló"}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
          {porVersion
            ? "Estamos recargando para traerte la última. Un segundo."
            : "No se perdió nada de lo que ya habías guardado. Reintenta y, si vuelve a pasar, avísale al CEDI."}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
          >
            <RotateCcw className="h-5 w-5" /> Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#F2F2F7] font-semibold text-slate-700 transition-transform active:scale-[0.98] dark:bg-[#1C1C1E] dark:text-slate-300"
          >
            <RefreshCw className="h-5 w-5" /> Recargar
          </button>
        </div>

        <p className="mt-5 break-words text-[12px] text-slate-400 dark:text-slate-500">
          {error.message}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
      </div>
    </div>
  );
}
