"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/components/ProfileContext";
import { ROLE_LABELS } from "@/lib/constants";
import { MARCA } from "@/lib/marca";
import { ZONA, horaDelDiaEnColombia } from "@/lib/tiempo";
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
 * Lo que quedó fue un saludo suelto arriba a la izquierda y tres cuartos de
 * pantalla en blanco. Sigue sin haber reja —y sin repetir «Mi panel», que es
 * la pantalla de las métricas— pero el saludo ahora ocupa el sitio como una
 * portada: es lo primero que se ve al abrir la app y tiene que verse como algo
 * hecho a propósito, no como una pantalla a medio cargar.
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

  // La fecha se pinta después de montar. Es el mismo motivo por el que el
  // reloj de la barra arranca vacío: lo que se calcule en el servidor y en el
  // navegador tiene que coincidir carácter por carácter o React lo cuenta como
  // error de hidratación, y una fecha es justo lo que puede no coincidir.
  const [fecha, setFecha] = useState<string | null>(null);
  useEffect(() => {
    setFecha(
      new Intl.DateTimeFormat("es-CO", {
        timeZone: ZONA,
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date())
    );
  }, []);

  return (
    <div className="relative space-y-6 pb-10 font-sans">
      <section className="relative overflow-hidden rounded-3xl border border-slate-900/[0.06] bg-white/70 px-6 py-10 shadow-sm backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.04] sm:px-10 sm:py-14">
        {/* Dos adornos y nada más. El halo da profundidad al vidrio y la línea
            de arriba lo separa del fondo sin dibujar un marco. Ninguno recibe
            eventos: el contenido de abajo tiene que seguir siendo tocable. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[#ff812c]/20 blur-3xl dark:bg-[#ff812c]/25"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff812c]/50 to-transparent"
        />

        <div className="relative">
          <p className="text-[15px] text-slate-500 dark:text-slate-400">
            {saludo()}
            {nombre ? `, ${nombre}` : ""}
          </p>

          <h1 className="mt-2 text-[38px] font-bold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-[52px]">
            ¿Qué vas a{" "}
            <span className="bg-gradient-to-r from-[#ff812c] to-[#ffb46b] bg-clip-text text-transparent">
              hacer
            </span>
            ?
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#ff812c]/10 px-3 py-1.5 text-[13px] font-semibold text-[#ff812c] ring-1 ring-inset ring-[#ff812c]/20">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
            {/* El alto se reserva aunque la fecha aún no esté, para que el
                bloque no dé un salto al segundo de abrir. */}
            <span className="inline-flex min-h-[30px] items-center rounded-full bg-slate-900/[0.05] px-3 py-1.5 text-[13px] font-medium capitalize text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
              {fecha ?? ""}
            </span>
          </div>

          <p className="mt-8 text-[13px] tracking-wide text-slate-400 dark:text-slate-500">
            {MARCA.appLargo} · {MARCA.firma}
          </p>
        </div>
      </section>

      {/* Se le cruza a quien ya vio el saludo, no antes de dejarlo trabajar.
          Se oculta sola si no toca mostrarla. */}
      <EncuestaSatisfaccion />
    </div>
  );
}
