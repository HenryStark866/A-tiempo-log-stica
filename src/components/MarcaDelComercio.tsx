"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import {
  autorizarVitrina,
  quitarLogoDeMarca,
  subirLogoDeMarca,
  LOGO_ACEPTA,
} from "@/lib/brandLogo";

/**
 * El logo del comercio y su permiso para salir en la portada.
 *
 * Son dos cosas distintas y por eso son dos controles distintos. Subir el logo
 * es para uso interno. Salir en la portada es publicar la marca de otro en
 * internet, y eso lo decide el dueño de la marca, no nosotros: el interruptor
 * arranca apagado y dice con todas las letras dónde va a aparecer.
 *
 * Sirve igual en Mi comercio (el propio) y en Clientes (el CEDI carga el logo
 * que el comercio mandó por WhatsApp), porque las dos rutas pasan por los
 * mismos RPC, que ya validan quién puede tocar qué.
 */
export function MarcaDelComercio({
  clientId,
  nombre,
  logoUrl,
  enPortada,
  onCambio,
}: {
  clientId: string;
  nombre: string;
  logoUrl: string | null;
  enPortada: boolean;
  onCambio: (cambios: { logo_url?: string | null; show_in_landing?: boolean }) => void;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardandoVitrina, setGuardandoVitrina] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // deja volver a elegir el mismo archivo tras un fallo
    if (!f) return;

    setError(null);
    setSubiendo(true);
    try {
      const url = await subirLogoDeMarca(clientId, f);
      onCambio({ logo_url: url });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    setError(null);
    setSubiendo(true);
    try {
      await quitarLogoDeMarca(clientId);
      // Sin logo no hay nada que mostrar: la portada se apaga con él.
      onCambio({ logo_url: null, show_in_landing: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  async function alternarVitrina() {
    setError(null);
    setGuardandoVitrina(true);
    try {
      await autorizarVitrina(clientId, !enPortada);
      onCambio({ show_in_landing: !enPortada });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardandoVitrina(false);
    }
  }

  return (
    // Translucida y con blur (patron probado en produccion). Es tarjeta unica
    // de esta ficha, sin nada anidado; el input de archivo va oculto y no
    // hereda este fondo como superficie visible.
    <div className="overflow-hidden rounded-2xl atl-superficie shadow-sm  ">
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl atl-relleno ">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`Logo de ${nombre}`}
              className="h-full w-full object-contain p-1.5"
            />
          ) : (
            <ImageUp className="h-6 w-6 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Logo de la marca
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            PNG, JPG, WEBP o SVG, hasta 512 KB. Se ve mejor con fondo transparente.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => archivo.current?.click()}
            disabled={subiendo}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl atl-relleno px-4 text-[14px] font-semibold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-50  dark:text-slate-300"
          >
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
            {logoUrl ? "Cambiar" : "Subir"}
          </button>
          {logoUrl && !subiendo && (
            <button
              type="button"
              onClick={quitar}
              aria-label="Quitar el logo"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        <input
          ref={archivo}
          type="file"
          accept={LOGO_ACEPTA}
          onChange={elegir}
          className="hidden"
        />
      </div>

      {/* ── Permiso de portada ── */}
      <div className="flex items-center gap-4 border-t border-slate-900/[0.06] p-4 dark:border-white/[0.08]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ff812c]/10">
          <Sparkles className="h-[18px] w-[18px] text-[#ff812c]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Mostrar la marca en nuestra portada
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            {logoUrl
              ? "El logo aparece flotando en la animación de atiempologistica.com, donde lo ve cualquiera. Se puede apagar cuando quieras."
              : "Primero sube el logo. Sin él no hay nada que mostrar."}
          </p>
        </div>
        <button
          type="button"
          onClick={alternarVitrina}
          disabled={!logoUrl || guardandoVitrina}
          role="switch"
          aria-checked={enPortada}
          aria-label="Mostrar la marca en la portada"
          /* `overflow-hidden` es el cinturón de seguridad: sin ninguna
             posición `left` explícita en la bolita, su punto de partida
             dependía de cómo cada navegador resuelve un absolute sin left/right
             (la "posición estática"), y al activarlo se salía del óvalo en vez
             de quedar pegada a su borde derecho. */
          className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors duration-200 disabled:opacity-40 ${
            enPortada ? "bg-[#ff812c]" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
              enPortada ? "translate-x-[20px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 border-t border-slate-900/[0.06] px-4 py-3 text-[13px] text-rose-600 dark:border-white/[0.08] dark:text-rose-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
