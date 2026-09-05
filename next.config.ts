import type { NextConfig } from "next";

/**
 * La versión publicada. Sale del commit desplegado, que es el único dato que
 * Vercel garantiza igual en compilación y en ejecución — y que cambia solo,
 * sin que nadie tenga que acordarse de subir un número a mano.
 *
 * Fuera de Vercel queda en "local": ahí no hay despliegues que detectar y un
 * valor cambiante haría que la app se recargara sola sin motivo.
 */
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  /**
   * El paquete del navegador va comprimido y SIN mapas de origen.
   *
   * Las dos líneas siguientes son el valor por omisión de Next, y están
   * escritas igual: un ajuste que protege algo y que solo existe por omisión
   * se pierde el día que alguien cambie la versión de Next o copie este
   * archivo a otro proyecto, y se pierde en silencio.
   *
   * Por qué sin mapas: un `.map` es el código fuente entero servido en
   * público. En esta app eso enseñaría los nombres de las RPC, la forma de
   * cada tabla y el orden en que se comprueban los roles — el mapa de la
   * casa para quien quiera buscarle la vuelta a RLS. No estorba para
   * depurar: los errores del navegador llegan a /api/telemetria con la
   * versión (el SHA del commit), y con ese SHA se reconstruye el mapa en
   * local cuando haga falta.
   *
   * `scripts/verificar-paquete.mjs` lo comprueba sobre el build de verdad, y
   * CI lo corre en cada cambio: así esto no depende de que nadie lo relea.
   */
  productionBrowserSourceMaps: false,
  compress: true,
  // `env` inyecta el valor en tiempo de compilación tanto en el paquete del
  // navegador como en el del servidor: los dos lados comparan exactamente la
  // misma cadena, que es lo que hace fiable la detección de versión nueva.
  env: { NEXT_PUBLIC_VERSION: VERSION },
  // Que el identificador de compilación sea el commit hace que las rutas de
  // /_next/static/ cambien con cada despliegue y no con cada build: dos
  // compilaciones del mismo commit sirven los mismos archivos.
  generateBuildId: async () => (VERSION === "local" ? null : VERSION),
  /**
   * «Guías» pasó a llamarse «Pedidos», y con ella la ruta.
   *
   * Sin esto, quien tuviera /guias en favoritos —o en un enlace que le pasamos
   * por WhatsApp— entraba, pasaba por el login y aterrizaba en un 404. El
   * middleware disimula el problema mientras no hay sesión, porque redirige
   * todo al login antes de mirar si la página existe; el 404 aparece justo
   * después de escribir la contraseña, que es el peor momento.
   *
   * Permanente (308): la ruta vieja no va a volver, y así el navegador deja de
   * pedirla y actualiza el favorito.
   */
  redirects: async () => [
    { source: "/guias", destination: "/pedidos", permanent: true },
    { source: "/guias/:resto*", destination: "/pedidos/:resto*", permanent: true },
  ],
  headers: async () => [
    // ── El service worker y el manifest ─────────────────────────────────
    // Los dos archivos que deciden si la PWA se instala y si se actualiza.
    // Sin esto quedan a merced de la caché por omisión del CDN: un sw.js
    // servido de caché es una app congelada en la versión anterior, y un
    // manifest viejo es un icono viejo y un nombre viejo en la pantalla de
    // inicio. `must-revalidate` no impide guardarlos, obliga a preguntar.
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        // Deja que el SW gobierne todo el sitio aunque se sirva desde /sw.js.
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
      ],
    },
    // Los iconos sí son eternos: el nombre del archivo cambia si cambia el
    // dibujo, así que se pueden guardar un año sin volver a preguntar.
    {
      source: "/icons/:archivo*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // La geolocalización es la herramienta de trabajo del mensajero: si se
        // niega aquí, el navegador ni siquiera muestra el diálogo de permiso y
        // watchPosition falla en silencio con PERMISSION_DENIED, aunque la
        // persona nunca haya dicho que no. Se abre solo para el propio origen.
        {
          key: "Permissions-Policy",
          // La cámara la usa el operario del CEDI para escanear guías
          // (EscanerQR.tsx, con getUserMedia): cerrada del todo, ese escáner
          // no podía pedir permiso nunca, en ningún entorno. Se abre solo
          // para el propio origen, igual que la ubicación.
          value: "camera=(self), microphone=(), geolocation=(self)",
        },
        // Un año, con subdominios: una vez que el navegador la recuerda no
        // vuelve a intentar http:// para este dominio ni para uno colgante.
        // La Content-Security-Policy va aparte, en el middleware: necesita un
        // nonce distinto por request para el script de next-themes, y eso no
        // se puede fijar aquí (este bloque es estático).
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        // "cross-origin" y no "same-origin": los rótulos y el QR de pago se
        // abren desde el navegador de cualquiera, muchas veces sin cuenta.
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
