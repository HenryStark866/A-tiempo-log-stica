"use client";

import { useEffect } from "react";
import { esErrorDeVersion, recargarPorVersionNueva } from "@/lib/recuperacion";
import { reportarError } from "@/lib/observabilidad";

/**
 * Última red de la app.
 *
 * Sin este archivo, cualquier error del cliente deja la pantalla en blanco con
 * el texto crudo de Next ("Application error: a client-side exception has
 * occurred..."), sin estilos, sin botón y sin decir qué pasó. Al mensajero en
 * la calle eso le parece —con razón— que la app se murió.
 *
 * global-error reemplaza el layout raíz entero, así que tiene que traer su
 * propio <html> y <body> y no puede apoyarse en nada de la app: los estilos van
 * en línea a propósito, porque si lo que falló fue justamente la hoja de
 * estilos, esta pantalla debe seguir viéndose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recargarPorVersionNueva(error);
    // Los errores de versión no se reportan: no son un fallo, son la app
    // dándose cuenta de que hay un despliegue nuevo. Reportarlos llenaría el
    // log de ruido cada vez que publicamos.
    if (!esErrorDeVersion(error)) {
      reportarError(error, { origen: "global-error" });
    }
  }, [error]);

  const porVersion = esErrorDeVersion(error);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#1C1C1E",
          color: "#fff",
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 44, color: "#ff812c" }}>⚠</div>
          <h1 style={{ fontSize: 21, margin: "16px 0 8px" }}>
            {porVersion ? "Hay una versión nueva" : "Algo se rompió en esta pantalla"}
          </h1>
          <p style={{ color: "#98989D", fontSize: 15, lineHeight: 1.5, margin: 0 }}>
            {porVersion
              ? "Estamos recargando para traerte la última. Un segundo."
              : "No perdiste nada de lo que ya habías guardado. Reintenta y, si vuelve a pasar, avísale al CEDI."}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={() => reset()}
              style={{
                flex: 1,
                minHeight: 52,
                border: 0,
                borderRadius: 14,
                background: "#ff812c",
                color: "#1C1C1E",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1,
                minHeight: 52,
                border: 0,
                borderRadius: 14,
                background: "#2C2C2E",
                color: "#fff",
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              Recargar
            </button>
          </div>

          {/* El detalle técnico, legible. Es lo único que permite arreglar un
              fallo que solo aparece en el teléfono de alguien más. */}
          <p
            style={{
              marginTop: 20,
              fontSize: 12,
              color: "#636366",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </div>
      </body>
    </html>
  );
}
