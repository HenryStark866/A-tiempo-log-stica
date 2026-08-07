"use client";

import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

/**
 * Lo que ve alguien a quien el freno de solicitudes masivas le cortó el paso.
 *
 * Va aparte de cada pantalla porque el mensaje tiene que ser el mismo en las
 * tres públicas —rastreo por número, rastreo por enlace y pago—: quien lo lee
 * casi nunca es un atacante, sino alguien detrás de la misma IP que media
 * ciudad (los operadores móviles reparten una sola entre miles de clientes).
 * Por eso no dice «fuiste bloqueado» ni habla de límites: dice que se espere,
 * que es lo único que necesita hacer, y ofrece el botón para reintentar.
 */
export function DemasiadasSolicitudes({ onReintentar }: { onReintentar?: () => void }) {
  const [segundos, setSegundos] = useState(30);

  useEffect(() => {
    if (segundos <= 0) return;
    const id = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [segundos]);

  return (
    <div className="py-10 text-center">
      <Hourglass className="mx-auto mb-4 w-12 h-12 text-slate-400 dark:text-slate-500" />
      <h1 className="text-[22px] font-bold text-slate-900 dark:text-white">
        Espera un momento
      </h1>
      <p className="mx-auto mt-2 mb-6 max-w-xs text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
        Estamos recibiendo muchas consultas desde tu conexión. Tu envío está
        bien; solo hay que reintentar en unos segundos.
      </p>
      <button
        onClick={() => {
          setSegundos(30);
          onReintentar?.();
        }}
        disabled={segundos > 0}
        className="inline-flex items-center justify-center bg-[#ff812c] active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl px-8 min-h-[52px] disabled:opacity-60 disabled:active:scale-100"
      >
        {segundos > 0 ? `Reintentar en ${segundos}s` : "Reintentar"}
      </button>
    </div>
  );
}
