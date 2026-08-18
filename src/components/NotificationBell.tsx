"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check } from "lucide-react";
import { useNotificaciones } from "@/components/NotificationsContext";
import { formatDateTime } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

/**
 * El ancho a partir del cual el panel deja de ser una hoja que sube desde abajo
 * y pasa a ser un desplegable anclado a la campana.
 *
 * Es `md` (768px) y no `sm` (640px) a propósito: tiene que ser EL MISMO en el
 * que el armazón cambia de la cabecera del teléfono a la barra lateral del
 * escritorio (ver AppShell). Estaba en `sm`, y en la franja de 640 a 767px
 * pasaba algo absurdo: seguía viéndose la cabecera del teléfono —con la campana
 * arriba a la derecha, pegada al borde— pero el panel ya se abría en modo
 * escritorio, un desplegable de 320px colgando de ella en vez de la hoja de
 * ancho completo. Si este número cambia, cambia también en AppShell.
 */
const ESCRITORIO = "(min-width: 768px)";

/**
 * La campana, y nada más que la campana.
 *
 * Se pinta dos veces (header del teléfono y barra del escritorio), así que aquí
 * no puede vivir nada que no se pueda hacer por duplicado: los datos, el sondeo
 * y la suscripción a Realtime están en NotificationsContext, una sola vez.
 *
 * ── Por qué la hoja del teléfono va en un portal ──────────────────────────
 *
 * `position: fixed` no siempre se ancla a la pantalla: basta con que CUALQUIER
 * ancestro tenga `transform`, `filter`, `backdrop-filter`, `perspective` o
 * `contain` para que pase a anclarse a ese ancestro. Y la campana vive dentro
 * de la cabecera del teléfono, que es justo el sitio donde es natural querer un
 * cristal esmerilado.
 *
 * Ya ocurrió: con `backdrop-blur` en la cabecera, la hoja resolvía su
 * `bottom: 0` contra los 73px del header en lugar de contra la pantalla, así
 * que crecía hacia arriba y solo asomaba una franja por el borde superior —se
 * abría, pero fuera de la vista, y parecía diminuta.
 *
 * Sacarlo del header lo arreglaba, pero dejaba una regla frágil a distancia:
 * «no le pongas un efecto de fondo a la cabecera o rompes las notificaciones»,
 * en otro archivo y sin nada que la haga cumplir. El portal la elimina: la hoja
 * cuelga de <body>, no tiene ancestros que la puedan capturar, y la cabecera
 * vuelve a ser libre de llevar el efecto que quiera.
 */
export function NotificationBell({
  /**
   * Hacia dónde se abre el desplegable de escritorio. En la barra lateral la
   * campana está pegada al borde izquierdo y tiene que abrirse hacia la
   * derecha; si no, el panel de 320px se sale de la pantalla y queda cortado.
   */
  align = "right",
}: {
  align?: "left" | "right";
} = {}) {
  const noti = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const [esEscritorio, setEsEscritorio] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // La hoja vive fuera de `caja` —está en <body>—, así que para saber si un
  // toque cayó «dentro» del panel hay que preguntarle a ella por separado.
  const hoja = useRef<HTMLDivElement>(null);

  // Se consulta en vivo y no una sola vez: girar el teléfono o cambiar de
  // tamaño la ventana cruza el umbral, y el panel abierto tiene que cambiar de
  // forma con el armazón, no quedarse en la que le tocó al abrirse.
  useEffect(() => {
    const mq = window.matchMedia(ESCRITORIO);
    const leer = () => setEsEscritorio(mq.matches);
    leer();
    mq.addEventListener("change", leer);
    return () => mq.removeEventListener("change", leer);
  }, []);

  // Cierra al tocar afuera o con Escape. `pointerdown` y no `mousedown` para
  // que también valga el dedo en el teléfono, no solo el ratón.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      const objetivo = e.target as Node;
      if (caja.current?.contains(objetivo)) return;
      if (hoja.current?.contains(objetivo)) return;
      setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  if (!noti) return null;

  const { items, sinLeer, marcarLeidas } = noti;

  async function abrir(n: AppNotification) {
    setAbierto(false);
    await noti!.abrir(n);
  }

  /* Lo de dentro es idéntico en las dos formas; lo único que cambia es la caja
     que lo envuelve. Va aquí, en una variable, para que no haya dos listas que
     mantener en paralelo. */
  const contenido = (
    <>
      {/* Cabecera fija: el título puede recortarse, pero «Marcar leídas»
          nunca se encoge ni se monta encima — es la única acción del panel. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-900/[0.06] px-4 py-3 dark:border-white/[0.08]">
        <p className="min-w-0 truncate text-[15px] font-semibold text-slate-900 dark:text-white">
          Notificaciones
        </p>
        {sinLeer.length > 0 && (
          <button
            onClick={() => marcarLeidas()}
            className="-mr-2 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-semibold text-[#ff812c] transition-colors hover:bg-[#ff812c]/10 active:opacity-70"
          >
            <Check className="w-3.5 h-3.5 shrink-0" /> Marcar leídas
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-slate-500 dark:text-slate-400">
          No tienes notificaciones
        </p>
      ) : (
        /* La lista es la que se desplaza, no el panel entero: así la
           cabecera con «Marcar leídas» queda siempre a la vista. */
        <ul className="min-h-0 flex-1 divide-y divide-slate-900/[0.06] overflow-y-auto overscroll-contain dark:divide-white/[0.08]">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => abrir(n)}
                className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  n.read_at ? "" : "bg-[#ff812c]/5"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Punto de «sin leer»: reserva su sitio siempre, para que
                      el texto de todas las filas arranque a la misma altura
                      y la lista no quede escalonada. */}
                  <span
                    className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                      n.read_at ? "bg-transparent" : "bg-[#ff812c]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-snug text-slate-900 dark:text-white">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDateTime(n.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div className="relative" ref={caja}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={
          sinLeer.length > 0
            ? `Notificaciones, ${sinLeer.length} sin leer`
            : "Notificaciones"
        }
        aria-expanded={abierto}
        className="relative w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        {sinLeer.length > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff812c] text-white text-[10px] font-bold leading-none">
            {sinLeer.length}
          </span>
        )}
      </button>

      {/* Escritorio: desplegable colgando de la campana. Se queda dentro del
          árbol porque ahí `absolute` se ancla justo a lo que queremos —la
          campana— y no hay nada que capturarlo. */}
      {abierto && esEscritorio && (
        <div
          className={`absolute z-[60] mt-2 flex max-h-[min(28rem,calc(100dvh-6rem))] w-[320px] flex-col overflow-hidden rounded-2xl border border-slate-900/[0.06] bg-[#FFFFFF] shadow-2xl dark:border-white/[0.08] dark:bg-[#2C2C2E] ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {contenido}
        </div>
      )}

      {/* Teléfono: hoja de ancho completo que sube desde el borde, igual que
          los demás diálogos de la app, y colgada de <body> para que ningún
          ancestro pueda desanclarla. */}
      {abierto &&
        !esEscritorio &&
        createPortal(
          <>
            <div
              onClick={() => setAbierto(false)}
              className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
              aria-hidden
            />
            <div
              ref={hoja}
              className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[80dvh] flex-col overflow-hidden rounded-t-3xl border-t border-slate-900/[0.06] bg-[#FFFFFF] pb-safe shadow-2xl dark:border-white/[0.08] dark:bg-[#2C2C2E]"
            >
              {/* Asa: indica que la hoja se puede cerrar deslizando. */}
              <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
              {contenido}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
