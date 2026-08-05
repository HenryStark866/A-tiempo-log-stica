"use client";

import { useEffect } from "react";
import { consultarServidor } from "@/lib/servidor";

/** La versión que trae el paquete que está corriendo ahora mismo. */
const VERSION_LOCAL = process.env.NEXT_PUBLIC_VERSION ?? "local";

/** Cada cuánto se pregunta si hay algo nuevo publicado. */
const CADA_MS = 15 * 60 * 1000;

/** Para no recargar dos veces buscando la misma versión. */
const YA_INTENTADO = "yam:recarga-por-version";

/**
 * Registra el service worker y mantiene la app al día sin intervención manual.
 *
 * Va en un componente propio y no en el layout para que el registro ocurra
 * después de que la página esté pintada: el mensajero abre la app para
 * trabajar, no para esperar a que se instale nada.
 *
 * En desarrollo no se registra, y además se desinstala cualquiera que haya
 * quedado de una sesión anterior: un SW cacheando en local vuelve loco a
 * cualquiera que esté editando código.
 *
 * ── Cómo queda al día una PWA instalada ──
 * Hay dos avisos distintos, porque son dos cosas distintas las que envejecen:
 *
 *  1. El service worker. Cuando cambia el archivo, el SW nuevo toma el control
 *     de inmediato (skipWaiting + clients.claim) y se dispara
 *     `controllerchange`. Se registra con `updateViaCache: "none"` para que el
 *     navegador nunca sirva el sw.js de su propia caché HTTP: es la causa
 *     clásica de una PWA que se queda pegada en una versión vieja.
 *
 *  2. El código de la app. Este SW no cachea el JS de Next, así que una
 *     recarga basta para tener lo último — pero nadie recarga por gusto, y una
 *     app instalada puede quedarse abierta días. Por eso se compara la versión
 *     publicada (`/api/version`) contra la que trae este paquete.
 *
 * En los dos casos la recarga NO es inmediata. El mensajero puede tener un
 * formulario a medio llenar (una entrega, un recaudo), y una recarga a
 * traición se lo borraría. Se espera a que la pestaña quede oculta —cambia de
 * app, guarda el teléfono— para recargar sin que nadie lo vea, o a que vuelva
 * a quedar visible si la ocultó antes de que la actualización llegara.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let hayActualizacion = false;
    let recargando = false;

    function recargarSiToca() {
      if (!hayActualizacion || recargando) return;
      recargando = true;
      window.location.reload();
    }

    // ── ¿Se publicó algo nuevo? ────────────────────────────────────────────
    async function revisarVersion() {
      // Fuera de un despliegue de verdad no hay nada que comparar, y una
      // comparación contra un valor inventado provocaría recargas eternas.
      if (VERSION_LOCAL === "local") return;

      const estado = await consultarServidor();
      if (!estado?.version || estado.version === "local") return;
      if (estado.version === VERSION_LOCAL) return;

      // Cinturón de seguridad: si ya se recargó apuntando a esta misma versión
      // y el paquete que llegó sigue siendo el viejo (un CDN rezagado, una
      // caché intermedia), no se insiste. Recargar en bucle sería mucho peor
      // que quedarse una hora atrás.
      try {
        if (window.sessionStorage.getItem(YA_INTENTADO) === estado.version) return;
        window.sessionStorage.setItem(YA_INTENTADO, estado.version);
      } catch {
        /* sin sessionStorage se pierde el cinturón, no la función */
      }

      hayActualizacion = true;
      if (document.visibilityState === "hidden") recargarSiToca();
    }

    // ── Service worker ─────────────────────────────────────────────────────
    const haySW = "serviceWorker" in navigator;
    const enProduccion = process.env.NODE_ENV === "production";

    if (haySW && !enProduccion) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }

    if (haySW && enProduccion) {
      // El navegador ya garantiza que solo un SW controla la página a la vez:
      // este evento es el aviso de que el nuevo acaba de tomar el control.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        hayActualizacion = true;
        if (document.visibilityState === "hidden") recargarSiToca();
      });

      const registrar = () => {
        navigator.serviceWorker
          // `updateViaCache: "none"` obliga a pedir el sw.js a la red en cada
          // revisión, sin pasar por la caché HTTP del navegador.
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .catch(() => {
            /* sin SW la app funciona igual: solo pierde el aviso de sin conexión */
          });
      };

      if (document.readyState === "complete") registrar();
      else window.addEventListener("load", registrar);
    }

    function buscarNovedades() {
      void revisarVersion();
      if (haySW && enProduccion) {
        navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {}));
      }
    }

    function alCambiarVisibilidad() {
      if (document.visibilityState !== "visible") {
        // Se está yendo: es el momento seguro para recargar si ya había una
        // actualización esperando.
        recargarSiToca();
        return;
      }
      // Vuelve a primer plano: si quedó algo pendiente de la vez pasada, esta
      // también es una vuelta segura; y de paso se revisa si hay algo nuevo.
      recargarSiToca();
      buscarNovedades();
    }

    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    // Un turno entero con la app abierta y la pantalla encendida no dispara
    // ningún `visibilitychange`: sin este latido, esa sesión no se enteraría
    // nunca de un despliegue.
    const latido = window.setInterval(buscarNovedades, CADA_MS);
    buscarNovedades();

    return () => {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.clearInterval(latido);
    };
  }, []);

  return null;
}
