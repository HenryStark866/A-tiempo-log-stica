"use client";

import { useEffect } from "react";
import { reproducirSonidoDeArranque } from "@/lib/sonidoNotificacion";

/**
 * La flecha silbadora del splash.
 *
 * ── Por qué es un componente aparte y no dos líneas dentro de Splash ──────
 * `Splash.tsx` no tiene ni una línea de JavaScript, y es a propósito: si
 * dependiera de un efecto de React para retirarse, un error de hidratación lo
 * dejaría pegado tapando la app entera, sin salida y sin nada que tocar. Esa
 * garantía se conserva metiendo el sonido aquí: si este componente falla o
 * nunca llega a montarse, el splash sigue entrando y saliendo solo, en CSS.
 *
 * ── Cuándo suena ──────────────────────────────────────────────────────────
 * A los 900 ms, que es cuando el correo llega a la última posta y se expande
 * la onda. No es decoración pegada encima: la onda YA era la señal llegando a
 * la posta antes que el correo. Hasta ahora estaba dibujada y muda.
 *
 * Suena dos veces, con la segunda onda a los 1600 ms. Los tiempos viven en
 * dos sitios que no se pueden importar el uno al otro: el retraso de aquí y
 * los de `atl-onda` y `atl-splash-salida` en globals.css. Si se toca uno, hay
 * que tocar el otro.
 *
 * ── Cuándo NO suena ───────────────────────────────────────────────────────
 * · Quien pidió menos movimiento no ve el splash (globals.css lo esconde
 *   entero), así que tampoco lo oye. Sería una señal sin nada que anunciar.
 * · Si el navegador todavía no permite sonar sin un toque previo —el caso de
 *   un teléfono que abre la app por primera vez—, se queda callado. No se deja
 *   encolado para el primer toque: una flecha disparándose treinta segundos
 *   después, mientras alguien confirma una entrega, es peor que el silencio.
 */
export function SonidoDeArranque() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const t = window.setTimeout(reproducirSonidoDeArranque, 900);
    // Si la pantalla se desmonta antes —una navegación muy rápida—, que no
    // suene la señal de algo que ya no está.
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
