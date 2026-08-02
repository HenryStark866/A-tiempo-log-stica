import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  headers: async () => [
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
          value: "camera=(), microphone=(), geolocation=(self)",
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
