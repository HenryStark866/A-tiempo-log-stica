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
      ],
    },
  ],
};

export default nextConfig;
