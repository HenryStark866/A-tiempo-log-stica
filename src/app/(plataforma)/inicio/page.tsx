"use client";

import { useProfile } from "@/components/ProfileContext";
import { ROLE_LABELS } from "@/lib/constants";
import { horaDelDiaEnColombia } from "@/lib/tiempo";
import { EncuestaSatisfaccion } from "@/components/EncuestaSatisfaccion";

/**
 * La pantalla que se ve al entrar.
 *
 * Llegó a tener una reja con cada destino del menú, copiada de la barra
 * lateral — con la idea de que en el teléfono el menú quedaba escondido. Ya
 * no: la barra inferior móvil muestra la misma lista completa (con scroll
 * horizontal) y la barra lateral de escritorio también, así que la reja no
 * abría ningún camino que no estuviera ya a un toque. Solo eran los mismos
 * doce botones, dos veces, en la misma pantalla.
 *
 * Lo que queda es el saludo y la encuesta de satisfacción, que sí es propio
 * de esta pantalla y de ninguna otra.
 */

/** Un saludo que depende de la hora REAL de la operación, no la del equipo. */
function saludo(): string {
  const h = horaDelDiaEnColombia();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function InicioPage() {
  const profile = useProfile();
  const nombre = profile.full_name?.trim().split(" ")[0] ?? "";

  return (
    <div className="relative space-y-6 pb-10 font-sans">
      <div>
        <p className="text-[15px] text-slate-500 dark:text-slate-400">
          {saludo()}
          {nombre ? `, ${nombre}` : ""}
        </p>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          ¿Qué vas a hacer?
        </h1>
        <p className="mt-1 text-[14px] text-slate-400 dark:text-slate-500">
          {ROLE_LABELS[profile.role] ?? profile.role}
        </p>
      </div>

      {/* Se le cruza a quien ya vio el saludo, no antes de dejarlo trabajar.
          Se oculta sola si no toca mostrarla. */}
      <EncuestaSatisfaccion />
    </div>
  );
}
