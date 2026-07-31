"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NARANJA } from "@/components/fondos/Fondo";

/**
 * Las marcas que ya viajan con nosotros, flotando en la red de la portada.
 *
 * Solo aparecen las que lo autorizaron: at_landing_brands ya filtra por
 * show_in_landing, porque publicar la marca de un cliente en nuestra portada es
 * decisión suya, no nuestra.
 *
 * Si no hay ninguna —o si la consulta falla— no se pinta nada y la red de rutas
 * se sostiene sola. Un fondo no puede ser el motivo de que la portada falle.
 */

interface Marca {
  business_name: string;
  logo_url: string;
}

/**
 * Sitios fijos, escogidos a mano por los bordes: el centro es donde va el
 * buscador de guías y ahí no puede pasar nada. Nada de posiciones al azar, que
 * en el servidor y en el navegador saldrían distintas.
 */
const SITIOS = [
  { left: "7%", top: "18%", dx: "18px", dy: "-22px", dur: 17, escala: 1 },
  { left: "80%", top: "12%", dx: "-16px", dy: "20px", dur: 21, escala: 0.85 },
  { left: "86%", top: "58%", dx: "-20px", dy: "-16px", dur: 19, escala: 0.95 },
  { left: "10%", top: "72%", dx: "22px", dy: "14px", dur: 23, escala: 0.9 },
  { left: "68%", top: "82%", dx: "-14px", dy: "-20px", dur: 18, escala: 0.8 },
  { left: "26%", top: "8%", dx: "14px", dy: "18px", dur: 25, escala: 0.75 },
  { left: "44%", top: "88%", dx: "-18px", dy: "-14px", dur: 20, escala: 0.8 },
  { left: "92%", top: "34%", dx: "-12px", dy: "16px", dur: 22, escala: 0.7 },
];

export function MarcasFlotantes() {
  const [marcas, setMarcas] = useState<Marca[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("at_landing_brands");
        if (vivo && Array.isArray(data)) setMarcas(data as Marca[]);
      } catch {
        /* sin vitrina, la red de rutas se basta sola */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (marcas.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {marcas.slice(0, SITIOS.length).map((m, i) => {
        const s = SITIOS[i];
        return (
          <div
            key={m.business_name}
            className="absolute"
            style={{
              left: s.left,
              top: s.top,
              transform: `scale(${s.escala})`,
              animation: `atl-deriva ${s.dur}s ease-in-out ${i * 1.6}s infinite`,
              ["--atl-dx" as string]: s.dx,
              ["--atl-dy" as string]: s.dy,
            }}
          >
            {/* Placa de datos: esquinas recortadas, como una etiqueta de rótulo
                leída por el escáner del CEDI. */}
            <div
              className="flex flex-col items-center gap-1.5 px-3 py-2.5 opacity-[0.45] dark:opacity-[0.55]"
              style={{
                border: `1px solid ${NARANJA}`,
                background: "var(--atl-centro)",
                clipPath:
                  "polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)",
              }}
            >
              {/* Decorativo: el nombre ya va debajo, y next/image no aporta nada
                  a un logo de 40px que además vive detrás de una viñeta. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.logo_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-9 w-auto max-w-[112px] object-contain grayscale"
              />
              <span
                className="max-w-[112px] truncate text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300"
                title={m.business_name}
              >
                {m.business_name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
