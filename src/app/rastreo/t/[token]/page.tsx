"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  LoaderCircle,
  Music2,
  PackageX,
  Truck,
} from "lucide-react";
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

/* ── La tienda de quien envió el paquete ─────────────────────────────────
   Quien abre este enlace acaba de comprarle a alguien y no tiene por dónde
   volver. Aquí se le da una puerta, una sola y discreta: esta pantalla es de
   su pedido, no un anuncio.

   Va SOLO en esta ruta, la del token del rótulo. La otra pantalla pública
   —/rastreo/ATL-…— se consulta con un número consecutivo, y decir ahí de qué
   comercio es cada guía dejaría contar los despachos de cada cliente uno por
   uno. Esa ruta sigue sin saber nada del comercio.

   Se muestra el primero que el comercio haya llenado en «Tu tienda en línea»,
   en este orden. Una tienda pequeña vive en Instagram antes que en su web, y
   ofrecerle cuatro botones al comprador es no elegir por él. */
const REDES_DEL_COMERCIO = [
  { campo: "business_instagram", etiqueta: "Instagram", icono: Instagram, base: "https://instagram.com/" },
  { campo: "business_facebook",  etiqueta: "Facebook",  icono: Facebook,  base: "https://facebook.com/" },
  { campo: "business_tiktok",    etiqueta: "TikTok",    icono: Music2,    base: "https://tiktok.com/@" },
  { campo: "business_website",   etiqueta: "su sitio web", icono: Globe,  base: null },
] as const;

/**
 * Convierte lo guardado en una dirección que se pueda abrir.
 *
 * Hoy la base ya exige una URL completa —`at_update_my_links` rechaza lo que
 * no empiece por http— así que casi siempre esto no hace nada. Está por lo que
 * pueda venir: un comercio que escriba «@quintosabor» donde va su Instagram
 * tiene que terminar en su perfil, no en un enlace roto delante de su
 * comprador.
 *
 * Devuelve `null` cuando no hay forma honesta de adivinar la dirección; el
 * bloque entero desaparece antes que mandar a nadie a una página que no
 * existe.
 */
function enlaceDeRed(valor: string | null, base: string | null): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;

  // «instagram.com/quintosabor» pegado sin el esquema: es un dominio, no un
  // usuario. Se distingue por el punto seguido de letras.
  const sinBarras = v.replace(/^\/+/, "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(sinBarras)) return `https://${sinBarras}`;

  // Lo que queda es un usuario: «@quintosabor» o «quintosabor». Sin una red a
  // la que pertenecer no se puede armar nada —un sitio web no tiene usuario—,
  // y ahí se prefiere no mostrar el bloque.
  if (!base) return null;
  const usuario = sinBarras.replace(/^@+/, "");
  return usuario ? base + usuario : null;
}

/** El primer enlace utilizable del comercio, o `null` si no dejó ninguno. */
function redDelComercio(r: TrackingByToken) {
  for (const red of REDES_DEL_COMERCIO) {
    const url = enlaceDeRed(r[red.campo], red.base);
    if (url) return { ...red, url };
  }
  return null;
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
      <div className="sticky top-0 z-10 atl-relleno  backdrop-blur-xl border-b border-slate-900/[0.06] dark:border-white/[0.08] transition-colors duration-300">
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
                      <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* La tienda del remitente. Va al pie y no arriba a propósito: lo
                que el comprador vino a ver es dónde está su paquete, y esto es
                lo que se encuentra cuando ya lo vio.

                Sin redes guardadas no se renderiza nada — ni el marco, ni un
                hueco. Los colores salen de los tokens (`atl-superficie`, el
                naranja de marca), así que el claro, el oscuro y el multicolor
                quedan cubiertos sin escribir un color por tema. */}
            {(() => {
              const red = result.business_name ? redDelComercio(result) : null;
              if (!red) return null;
              const Icono = red.icono;
              return (
                <a
                  href={red.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group flex items-center gap-3 rounded-3xl atl-superficie px-5 py-4 shadow-sm transition-colors hover:bg-[#ff812c]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff812c]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ff812c]/10 text-[#ff812c] dark:bg-[#ff812c]/20">
                    <Icono className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug">
                      Visitar {result.business_name}
                    </span>
                    <span className="block text-[13px] text-slate-500 dark:text-slate-400">
                      en {red.etiqueta}
                    </span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-slate-400 transition-colors group-hover:text-[#ff812c] dark:text-slate-500" />
                </a>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}
