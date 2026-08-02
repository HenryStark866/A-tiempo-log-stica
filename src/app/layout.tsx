import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { RegistrarSW } from "@/components/RegistrarSW";
import { MARCA } from "@/lib/marca";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    // JAM es la plataforma; A Tiempo Logística es quien responde por el
    // paquete. En el título van las dos: el nombre que la gente reconoce y la
    // empresa que lo respalda.
    default: `${MARCA.app} — Red de mensajería de ${MARCA.empresa}`,
    template: `%s | ${MARCA.app}`,
  },
  description:
    "JAM es la plataforma de última milla de A Tiempo Logística en Medellín: recogida, CEDI, ruteo, recaudo contraentrega y facturación con trazabilidad en tiempo real.",
  // Instalable en el teléfono del mensajero: en pantalla completa el navegador
  // no suspende el rastreo tan agresivamente como en una pestaña más.
  manifest: "/manifest.webmanifest",
  applicationName: MARCA.app,
  appleWebApp: {
    capable: true,
    title: MARCA.app,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C1C1E",
  // El mensajero trabaja con el teléfono en la mano y a veces con guantes:
  // que no se descuadre la pantalla por un pellizco accidental.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // El middleware genera un nonce por request y lo pasa a next-themes: es el
  // script que decide el tema antes del primer pintado, el único inline que
  // esta app necesita, y con nonce no hace falta abrir 'unsafe-inline' en la
  // CSP para dejarlo pasar.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} nonce={nonce}>
          {children}
          <RegistrarSW />
        </ThemeProvider>
      </body>
    </html>
  );
}
