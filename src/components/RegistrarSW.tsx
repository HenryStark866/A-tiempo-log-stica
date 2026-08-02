"use client";

import { useEffect } from "react";

// Cada vez que se despliega una versión nueva hay que subir esto en
// public/sw.js (VERSION = "atl-vN"): es lo que hace que el navegador note
// que el archivo cambió y dispare `updatefound`. Sin el bump, el SW nuevo
// puede quedarse sin descargarse hasta que el navegador decida revisarlo por
// su cuenta, que puede tardar horas.

/**
 * Registra el service worker y lo mantiene al día sin intervención manual.
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
 * El sw.js ya hace skipWaiting + clients.claim en cuanto descarga una versión
 * nueva, así que el SW que controla la página cambia solo. Lo que faltaba es
 * que el JS ya cargado en memoria se entere: por eso, al detectar el cambio
 * de controlador, se recarga — pero no de inmediato. El mensajero puede tener
 * un formulario a medio llenar (una entrega, un recaudo), y una recarga a
 * traición se lo borraría. Se espera a que la pestaña quede oculta (cambia de
 * app, guarda el teléfono) para recargar sin que nadie lo vea, o a que
 * vuelva a quedar visible si la ocultó ANTES de que la actualización llegara.
 * Además se pide una revisión de versión nueva cada vez que la pestaña vuelve
 * a primer plano: si la app se queda abierta un turno entero, no depende de
 * que el navegador decida por su cuenta cuándo mirar si hay algo nuevo.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    let hayActualizacion = false;
    let recargando = false;

    function recargarSiToca() {
      if (!hayActualizacion || recargando) return;
      recargando = true;
      window.location.reload();
    }

    // El navegador ya garantiza que solo un SW controla la página a la vez:
    // este evento es el aviso de que el nuevo acaba de tomar el control.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      hayActualizacion = true;
      if (document.visibilityState === "hidden") recargarSiToca();
    });

    function alVolverVisible() {
      if (document.visibilityState !== "visible") {
        // Se está yendo: es el momento seguro para recargar si ya había
        // una actualización esperando.
        recargarSiToca();
        return;
      }
      // Se está volviendo a abrir: aprovecha para revisar si hay una versión
      // nueva, y si la que ya estaba pendiente no alcanzó a aplicarse antes
      // de que la pestaña se ocultara, esta también es una vuelta segura.
      recargarSiToca();
      navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {}));
    }
    document.addEventListener("visibilitychange", alVolverVisible);

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin SW la app funciona igual: solo pierde el aviso de sin conexión */
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar);

    return () => {
      document.removeEventListener("visibilitychange", alVolverVisible);
    };
  }, []);

  return null;
}
