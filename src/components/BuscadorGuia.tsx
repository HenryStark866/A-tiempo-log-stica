"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { GUIA_EJEMPLO } from "@/lib/marca";

/**
 * El buscador de pedidos del rastreo público.
 *
 * Vive en su propio componente porque se usa en tres sitios —la portada, la
 * página /rastreo y el estado «no encontramos ese pedido»— y en los tres tiene
 * que comportarse igual. Antes estaba copiado en la portada y en ningún otro
 * lado: quien se equivocaba de número tenía que volver al inicio a mano.
 *
 * No consulta nada: solo navega. La consulta la hace la página de resultado,
 * con `at_track_guide`, que es pública y no pide sesión — rastrear un paquete
 * no exige tener cuenta.
 */
export function BuscadorGuia({
  autoFocus = false,
  textoBoton = "Rastrear paquete",
}: {
  autoFocus?: boolean;
  textoBoton?: string;
}) {
  const router = useRouter();
  const [guia, setGuia] = useState("");

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = guia.trim();
    if (!limpio) return;
    // El número va en la URL, así que se codifica. El servidor ya normaliza
    // mayúsculas y espacios, de modo que «atl-100008» también encuentra.
    router.push(`/rastreo/${encodeURIComponent(limpio)}`);
  }

  return (
    <form onSubmit={buscar} className="flex flex-col gap-4">
      <div className="flex items-center px-4 min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus-within:border-[#ff812c] focus-within:ring-1 focus-within:ring-[#ff812c] rounded-2xl transition-all">
        <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
        <input
          value={guia}
          onChange={(e) => setGuia(e.target.value)}
          autoFocus={autoFocus}
          // El número de pedido no es una palabra: que el teclado del teléfono no
          // lo autocorrija ni lo ponga en mayúscula a medias.
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Número de pedido"
          placeholder={`Ej. ${GUIA_EJEMPLO}`}
          className="flex-1 bg-transparent text-[16px] font-medium focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
        />
      </div>
      <button
        type="submit"
        disabled={!guia.trim()}
        className="w-full flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 hover:scale-[1.01] active:scale-[0.98] transition-all text-[#1C1C1E] font-bold rounded-2xl min-h-[52px] shadow-sm disabled:opacity-50 disabled:hover:scale-100"
      >
        <span className="text-[16px]">{textoBoton}</span>
        <ArrowRight className="w-5 h-5 text-[#1C1C1E]" />
      </button>
    </form>
  );
}
