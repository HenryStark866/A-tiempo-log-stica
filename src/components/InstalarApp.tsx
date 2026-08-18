"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { LogoIcon } from "@/components/Logo";
import { MARCA } from "@/lib/marca";

/**
 * El evento con el que Chrome ofrece instalar. No está en los tipos del DOM
 * porque todavía no es estándar, pero lo implementan Chrome, Edge, Samsung
 * Internet y Opera — o sea, prácticamente toda la flota Android.
 */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const POSPUESTA = "yam:instalacion-pospuesta";
/** Si alguien la cierra, no se vuelve a asomar en dos semanas. */
const ESPERA_MS = 14 * 24 * 60 * 60 * 1000;

function leerPosposicion(): number {
  try {
    return Number(window.localStorage.getItem(POSPUESTA)) || 0;
  } catch {
    return 0; // modo privado: no se puede recordar, se muestra igual
  }
}

function guardarPosposicion(valor: number | null) {
  try {
    if (valor === null) window.localStorage.removeItem(POSPUESTA);
    else window.localStorage.setItem(POSPUESTA, String(valor));
  } catch {
    /* sin almacenamiento, la invitación reaparecerá: es el mal menor */
  }
}

function yaEstaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS no implementa display-mode y marca esto en su lugar.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Invitación a instalar la app en el teléfono.
 *
 * Instalada no es lo mismo que abierta en el navegador: en pantalla completa
 * el sistema no suspende el rastreo con la misma agresividad, la geolocalización
 * sobrevive a que el mensajero cambie de app, y el icono queda a un toque en vez
 * de a tres. Por eso vale la pena pedirlo, y por eso se pide una sola vez.
 *
 * Chrome avisa por `beforeinstallprompt` y deja disparar el diálogo nativo.
 * Safari en iPhone no tiene nada de eso: ahí lo único posible es explicar los
 * dos toques del menú Compartir, que es lo que se muestra en ese caso.
 */
export function InstalarApp({ enPagina = false }: { enPagina?: boolean }) {
  const [evento, setEvento] = useState<EventoDeInstalacion | null>(null);
  const [enIphone, setEnIphone] = useState(false);

  useEffect(() => {
    if (yaEstaInstalada()) return;
    if (Date.now() - leerPosposicion() < ESPERA_MS) return;

    function alPoderInstalar(e: Event) {
      // Sin esto Chrome muestra su propia barra, que en móvil tapa la
      // navegación de abajo justo donde el mensajero tiene los dedos.
      e.preventDefault();
      setEvento(e as EventoDeInstalacion);
    }

    function alInstalar() {
      setEvento(null);
      setEnIphone(false);
      guardarPosposicion(null);
    }

    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);

    // iPhone: no hay evento que esperar, así que se decide por el aparato.
    // El navegador embebido de Instagram o WhatsApp no puede instalar nada,
    // y ahí la instrucción confundiría más de lo que ayuda.
    const ua = navigator.userAgent;
    const esIOS = /iPhone|iPad|iPod/.test(ua);
    const esSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line/.test(ua);
    if (esIOS && esSafari) setEnIphone(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!evento && !enIphone) return null;

  function posponer() {
    guardarPosposicion(Date.now());
    setEvento(null);
    setEnIphone(false);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // El evento no se puede volver a usar: si dijo que no, se guarda la
    // espera; si dijo que sí, `appinstalled` limpia el resto.
    setEvento(null);
    if (outcome === "dismissed") guardarPosposicion(Date.now());
  }

  return (
    <div
      role="dialog"
      aria-label={`Instalar ${MARCA.app}`}
      className={`fixed left-4 right-4 z-40 md:left-auto md:right-6 md:bottom-6 md:w-[21rem] rounded-3xl border border-slate-900/[0.06] dark:border-white/[0.08] atl-superficie p-4 shadow-lg ${
        // bottom-nav deja el hueco de la barra de pestañas del móvil, que
        // solo existe dentro de la plataforma (AppShell). En una pantalla
        // pública no hay nada debajo: sin esto quedaría flotando separado
        // del borde, con un vacío de sobra que aquí no significa nada.
        enPagina ? "bottom-4" : "bottom-nav"
      }`}
    >
      <button
        onClick={posponer}
        aria-label="Ahora no"
        className="absolute right-3 top-3 rounded-full p-1 text-slate-400 transition hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#ff812c]/10">
          <LogoIcon className="w-7 h-7 text-slate-900 dark:text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-slate-900 dark:text-white">
            Instala {MARCA.app} en tu teléfono
          </p>
          <p className="mt-1 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            {enIphone
              ? "Queda como una app más: se abre a pantalla completa y el rastreo no se corta al cambiar de aplicación."
              : "Se abre a pantalla completa, arranca más rápido y el rastreo aguanta mejor con la pantalla apagada."}
          </p>
        </div>
      </div>

      {enIphone ? (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-gray-100 dark:bg-gray-800 px-3 py-2.5 text-[13px] text-slate-600 dark:text-slate-300">
          <Share className="size-4 shrink-0 text-[#ff812c]" />
          <span>
            Toca <strong>Compartir</strong> y luego <strong>Añadir a inicio</strong>
          </span>
        </p>
      ) : (
        <button
          onClick={instalar}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff812c] py-3 text-[14px] font-bold text-white transition active:scale-[0.98]"
        >
          <Download className="size-4" /> Instalar
        </button>
      )}
    </div>
  );
}
