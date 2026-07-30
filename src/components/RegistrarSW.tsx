"use client";

import { useEffect } from "react";

/**
 * Registra el service worker.
 *
 * Va en un componente propio y no en el layout para que el registro ocurra
 * después de que la página esté pintada: el mensajero abre la app para
 * trabajar, no para esperar a que se instale nada.
 *
 * En desarrollo no se registra, y además se desinstala cualquiera que haya
 * quedado de una sesión anterior: un SW cacheando en local vuelve loco a
 * cualquiera que esté editando código.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin SW la app funciona igual: solo pierde el aviso de sin conexión */
      });
    };

    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar);
      return () => window.removeEventListener("load", registrar);
    }
  }, []);

  return null;
}
