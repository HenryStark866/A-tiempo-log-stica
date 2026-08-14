"use client";

import Link from "next/link";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { useProfile } from "@/components/ProfileContext";
import { NAV } from "@/lib/menu";
import { ROLE_LABELS } from "@/lib/constants";
import { horaDelDiaEnColombia } from "@/lib/tiempo";
import { EncuestaSatisfaccion } from "@/components/EncuestaSatisfaccion";
import { MapaDeFondo } from "@/components/fondos/MapaDeFondo";

/**
 * La pantalla que se ve al entrar.
 *
 * Antes se caía directo en «Mi panel», un tablero de métricas. Sirve para
 * mirar cómo va el día, pero no es lo que alguien viene a hacer: quien abre la
 * app viene a crear un pedido, a ver su ruta o a revisar su plata. El menú
 * estaba escondido detrás de un botón en el teléfono, así que la primera
 * pantalla contestaba una pregunta que nadie había hecho.
 *
 * Ahora lo primero es a dónde puedes ir. «Mi panel» sigue existiendo y es la
 * primera tarjeta: quien lo quiera lo tiene a un toque.
 *
 * El menú NO se copia aquí: sale de la misma lista que dibuja la barra lateral
 * (src/lib/menu.ts). Si mañana se agrega una pantalla, aparece en los dos
 * sitios sin que nadie se acuerde de nada.
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
  const items = NAV.filter((i) => i.roles.includes(profile.role));

  // «Mi panel» se saca de la reja para ponerlo arriba, ancho: es lo que estaba
  // antes en esta pantalla y no se le quita a nadie, solo deja de imponerse.
  const panel = items.find((i) => i.href === "/dashboard");
  // Sin «Mi panel», que ya va arriba, y sin ella misma: una tarjeta que
  // lleva a donde ya estás no ayuda a nadie.
  const resto = items.filter((i) => i.href !== "/dashboard" && i.href !== "/inicio");

  const nombre = profile.full_name?.trim().split(" ")[0] ?? "";

  return (
    <div className="relative space-y-6 pb-10 font-sans">
      {/* El valle, detrás del saludo. Es la primera pantalla que ve alguien al
          entrar y la única de la plataforma donde el fondo no le quita sitio a
          nada: aquí no hay tablas ni cifras, solo tarjetas para elegir. */}
      <MapaDeFondo />

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

      {panel && (
        <Link
          href={panel.href}
          className="flex items-center gap-4 rounded-3xl bg-[#FFFFFF] p-5 shadow-sm transition-transform active:scale-[0.98] dark:bg-[#2C2C2E]"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff812c]/10">
            <LayoutDashboard className="h-6 w-6 text-[#ff812c]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold text-slate-900 dark:text-white">Mi panel</p>
            <p className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">
              Cómo va el día en números
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
        </Link>
      )}

      {/* Dos columnas desde el teléfono: con una sola, un rol con doce opciones
          obliga a desplazarse para ver si existe la que busca, que es
          exactamente lo que esta pantalla venía a evitar. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {resto.map((item) => {
          const Icono = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-[112px] flex-col justify-between rounded-3xl bg-[#FFFFFF] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] dark:bg-[#2C2C2E]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F2F2F7] transition-colors group-hover:bg-[#ff812c]/10 dark:bg-[#1C1C1E]">
                <Icono className="h-5 w-5 text-slate-600 transition-colors group-hover:text-[#ff812c] dark:text-slate-300" />
              </div>
              <p className="mt-3 text-[15px] font-semibold leading-tight text-slate-900 dark:text-white">
                {item.label}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Al final y no arriba: quien abre la app viene a hacer algo. La
          encuesta se le cruza cuando ya vio sus opciones, no antes de
          dejarlo trabajar. Se oculta sola si no toca mostrarla. */}
      <EncuestaSatisfaccion />
    </div>
  );
}
