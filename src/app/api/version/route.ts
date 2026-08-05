import { NextResponse } from "next/server";

/**
 * Qué versión está publicada y qué hora es en el servidor.
 *
 * Existe por dos motivos que se resuelven con la misma respuesta:
 *
 *  · Una app instalada puede quedarse abierta días. El service worker no
 *    cachea el JS, así que basta con recargar para tener lo último — pero
 *    nadie recarga por gusto. Comparando esta versión con la que trae el
 *    paquete que ya está corriendo, la app se entera sola de que hay algo
 *    nuevo (ver `RegistrarSW`).
 *
 *  · El reloj de la barra se contrasta contra esta hora, para no depender de
 *    que el teléfono del mensajero esté bien puesto en hora.
 *
 * Es pública a propósito (ver PUBLIC_PATHS en el middleware): no dice nada de
 * nadie y se consulta también desde la pantalla de login.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      // Inyectada en tiempo de compilación desde next.config.ts. El mismo
      // valor queda dentro del paquete del navegador, y comparar los dos es
      // justamente cómo se detecta un despliegue nuevo.
      version: process.env.NEXT_PUBLIC_VERSION ?? "local",
      ahora: new Date().toISOString(),
    },
    {
      headers: {
        // Si esto se cachea, deja de servir para lo único que sirve.
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
