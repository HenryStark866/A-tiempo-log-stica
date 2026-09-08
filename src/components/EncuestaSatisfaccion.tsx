"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MessageSquareHeart, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * La encuesta de satisfacción.
 *
 * Es opcional de verdad, no «opcional» de las que tapan la pantalla hasta que
 * respondes. Va como una tarjeta más dentro de Inicio, se puede cerrar de un
 * toque, y quien la cierra no la vuelve a ver en un mes. Quien responde, en
 * tres.
 *
 * Tampoco aparece los primeros días: preguntarle a alguien qué le parece la app
 * cuando lleva dos horas usándola no da información, solo estorba.
 *
 * Una sola pregunta obligatoria —de 0 a 10— porque cada pregunta extra cuesta
 * respuestas, y el resto es opcional. Lo que más sirve suele ser el comentario
 * libre: los números dicen que algo va mal, la frase dice qué.
 */
export function EncuestaSatisfaccion() {
  const [mostrar, setMostrar] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [recomienda, setRecomienda] = useState<number | null>(null);
  const [facilidad, setFacilidad] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [busy, setBusy] = useState(false);
  const [gracias, setGracias] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("at_encuesta_pendiente").then(({ data }) => {
      setMostrar(Boolean((data as { mostrar?: boolean } | null)?.mostrar));
    });
  }, []);

  async function enviar() {
    if (recomienda === null) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_responder_encuesta", {
      p_recomienda: recomienda,
      p_facilidad: facilidad,
      p_comentario: comentario.trim() || null,
      p_version: process.env.NEXT_PUBLIC_VERSION ?? null,
    });
    setBusy(false);
    if (error) return;
    setGracias(true);
    setTimeout(() => setMostrar(false), 2600);
  }

  async function posponer() {
    setMostrar(false);
    const supabase = createClient();
    await supabase.rpc("at_posponer_encuesta", { p_dias: 30 });
  }

  if (!mostrar) return null;

  if (gracias) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 p-5 dark:bg-emerald-500/10">
        <Check className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-300">
          Gracias. Lo leemos todo, y de aquí salen los siguientes cambios.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl atl-superficie p-5 shadow-sm ">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ff812c]/10">
          <MessageSquareHeart className="h-5 w-5 text-[#ff812c]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-slate-900 dark:text-white">
            ¿Cómo te está yendo con la app?
          </p>
          <p className="mt-0.5 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
            Un minuto, y solo si quieres. Nos sirve para saber qué arreglar primero.
          </p>
        </div>
        <button
          onClick={posponer}
          aria-label="Ahora no"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-gray-100 active:opacity-70 dark:hover:bg-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!abierta ? (
        <button
          onClick={() => setAbierta(true)}
          className="mt-4 min-h-[46px] w-full rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
        >
          Responder
        </button>
      ) : (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
              ¿Qué tanto la recomendarías a otros empresarios?
            </p>
            {/* De 0 a 10 y no estrellas: es la escala con la que se calcula el
                NPS, y permite comparar contra cualquier referencia externa. */}
            <div className="mt-2 grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => setRecomienda(n)}
                  className={`min-h-[38px] rounded-lg text-[13px] font-bold transition-colors ${
                    recomienda === n
                      ? "bg-[#ff812c] text-[#1C1C1E]"
                      : "atl-relleno text-slate-600  dark:text-slate-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>Nada</span>
              <span>Muchísimo</span>
            </div>
          </div>

          <div>
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
              ¿Qué tan fácil te resulta usarla? <span className="font-normal text-slate-400">(opcional)</span>
            </p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setFacilidad(n)}
                  className={`min-h-[42px] rounded-xl text-[14px] font-bold transition-colors ${
                    facilidad === n
                      ? "bg-[#ff812c] text-[#1C1C1E]"
                      : "atl-relleno text-slate-600  dark:text-slate-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>Difícil</span>
              <span>Muy fácil</span>
            </div>
          </div>

          <div>
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
              ¿Qué cambiarías o ajustarías de la app? <span className="font-normal text-slate-400">(opcional)</span>
            </p>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              placeholder="Lo que sea: algo que no encuentras, algo que se demora, algo que te falta…"
              className="mt-2 w-full resize-none rounded-2xl atl-relleno px-4 py-3 text-[15px] text-slate-900 placeholder-slate-400 focus:outline-none  dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={posponer}
              className="min-h-[46px] flex-1 rounded-xl atl-relleno font-semibold text-slate-700  dark:text-slate-300"
            >
              Ahora no
            </button>
            <button
              onClick={enviar}
              disabled={recomienda === null || busy}
              className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
