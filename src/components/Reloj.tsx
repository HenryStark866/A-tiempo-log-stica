"use client";

import { useEffect, useState } from "react";
import { partesDelReloj } from "@/lib/tiempo";
import { ahoraSincronizado, consultarServidor } from "@/lib/servidor";
import { cn } from "@/lib/utils";

/**
 * La hora de la operación, en la barra de todas las pantallas.
 *
 * En una empresa de última milla la hora no es adorno: define si una entrega
 * llegó a tiempo, a qué corte de recaudo pertenece y qué recogidas son «de
 * hoy». Que cada quien la lea de su propio teléfono es justamente el problema,
 * así que este reloj hace dos cosas que el del sistema no hace:
 *
 *  · Muestra siempre la hora de Medellín (ver `ZONA` en lib/tiempo), sin
 *    importar en qué zona esté configurado el aparato.
 *  · Se contrasta contra el reloj del servidor al abrir y cada vez que la app
 *    vuelve a primer plano, así que un teléfono atrasado no engaña a nadie.
 *
 * El latido se alinea con el segundo real y se detiene mientras la pantalla
 * está oculta: un `setInterval` corriendo en el bolsillo durante un turno de
 * ocho horas se nota en la batería, y la batería del mensajero es la que
 * sostiene el rastreo.
 */
export function Reloj({
  variant = "compacto",
  className,
}: {
  /** `compacto` para la cabecera del teléfono, `amplio` para la barra lateral. */
  variant?: "compacto" | "amplio";
  className?: string;
}) {
  // Arranca vacío a propósito: el servidor no puede saber la hora del primer
  // pintado sin que React lo cuente como error de hidratación.
  const [instante, setInstante] = useState<Date | null>(null);

  useEffect(() => {
    let siguiente: number | undefined;

    function latir() {
      const ahora = ahoraSincronizado();
      setInstante(ahora);
      // Se reprograma contra el reloj real en cada vuelta, no cada 1000 ms
      // exactos: así el dígito cambia justo cuando cambia el segundo y no se
      // va corriendo con el tiempo.
      siguiente = window.setTimeout(latir, 1000 - (ahora.getTime() % 1000));
    }

    function detener() {
      if (siguiente !== undefined) window.clearTimeout(siguiente);
      siguiente = undefined;
    }

    function alCambiarVisibilidad() {
      detener();
      if (document.visibilityState !== "visible") return;
      // Al volver se vuelve a medir el desfase —el aparato pudo dormir o
      // cambiar de hora—, pero el latido no espera por la red: cuando la
      // respuesta llegue, el siguiente segundo ya sale corregido.
      void consultarServidor();
      latir();
    }

    void consultarServidor();
    latir();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      detener();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, []);

  const amplio = variant === "amplio";

  if (!instante) {
    // Reserva el alto exacto para que la barra no salte cuando llegue la hora.
    return <div className={cn(amplio ? "h-[38px]" : "h-[30px]", className)} />;
  }

  const { hora, fecha, fechaCorta } = partesDelReloj(instante);

  return (
    <time
      dateTime={instante.toISOString()}
      role="timer"
      // Sin esto, un lector de pantalla leería la hora en voz alta cada
      // segundo y taparía todo lo demás.
      aria-live="off"
      className={cn(
        "flex flex-col leading-none tabular-nums",
        amplio ? "items-start" : "items-end",
        className
      )}
    >
      <span
        className={cn(
          "font-bold tracking-tight text-slate-900 dark:text-white",
          amplio ? "text-[22px]" : "text-[13px]"
        )}
      >
        {hora}
      </span>
      <span
        className={cn(
          // `first-letter` y no `capitalize`: en español el mes va en
          // minúscula, y `capitalize` lo dejaría como «5 Ago».
          "font-medium text-slate-500 dark:text-slate-400 first-letter:uppercase",
          amplio ? "mt-1.5 text-[12px]" : "mt-1 text-[10px]"
        )}
      >
        {amplio ? fecha : fechaCorta}
      </span>
    </time>
  );
}
