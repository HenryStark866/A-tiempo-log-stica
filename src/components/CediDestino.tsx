"use client";

import { useEffect, useState } from "react";
import { Navigation2, Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Facility {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  notes: string | null;
}

/**
 * A dónde hay que llevar los paquetes.
 *
 * Existe porque la app le decía al mensajero "vas en camino al CEDI" sin
 * decirle dónde queda. La dirección sale de at_facilities, no de una constante,
 * para que una mudanza de bodega no exija desplegar.
 */
export function CediDestino({
  compacto = false,
  onNavegar,
}: {
  compacto?: boolean;
  /** Si se pasa, el botón usa la app de navegación del mensajero en vez del enlace a Google Maps. */
  onNavegar?: (direccion: string, ciudad: string) => void;
}) {
  const [sede, setSede] = useState<Facility | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("at_default_facility").then(({ data }) => setSede(data as Facility | null));
  }, []);

  if (!sede) return null;

  const destino = `${sede.address}, ${sede.city}, Colombia`;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;

  if (compacto) {
    return (
      <a
        href={mapa}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[14px] text-slate-500 hover:underline dark:text-slate-400"
      >
        <Warehouse className="h-4 w-4 shrink-0" />
        {sede.name}: {sede.address}, {sede.city}
      </a>
    );
  }

  return (
    /* Translucida y con blur (probado en vivo: /90 sin blur no se notaba). */
    <section className="overflow-hidden rounded-3xl bg-[#FFFFFF]/75 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
      <div className="flex items-start gap-3 p-5">
        <div className="rounded-xl bg-[#ff812c]/10 p-2.5 text-[#ff812c]">
          <Warehouse className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Llevar los paquetes a
          </p>
          <p className="mt-0.5 text-[17px] font-bold text-slate-900 dark:text-white">
            {sede.name}
          </p>
          <p className="text-[15px] text-slate-600 dark:text-slate-300">
            {sede.address} · {sede.city}
          </p>
          {sede.notes && (
            <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">{sede.notes}</p>
          )}
        </div>
      </div>
      {onNavegar ? (
        <button
          onClick={() => onNavegar(sede.address, sede.city)}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 border-t border-slate-900/[0.06] text-[15px] font-semibold text-[#ff812c] active:opacity-70 dark:border-white/[0.08]"
        >
          <Navigation2 className="h-4 w-4" /> Iniciar traslado al CEDI
        </button>
      ) : (
        <a
          href={mapa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] items-center justify-center gap-2 border-t border-slate-900/[0.06] text-[15px] font-semibold text-[#ff812c] active:opacity-70 dark:border-white/[0.08]"
        >
          <Navigation2 className="h-4 w-4" /> Cómo llegar
        </a>
      )}
    </section>
  );
}
