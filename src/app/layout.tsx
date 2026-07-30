import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { RegistrarSW } from "@/components/RegistrarSW";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "A Tiempo Logística — Última milla para e-commerce",
    template: "%s | A Tiempo Logística",
  },
  description:
    "Plataforma de logística de última milla para e-commerce en Medellín: recogida, CEDI, ruteo, recaudo contraentrega y facturación con trazabilidad en tiempo real.",
  // Instalable en el teléfono del mensajero: en pantalla completa el navegador
  // no suspende el rastreo tan agresivamente como en una pestaña más.
  manifest: "/manifest.webmanifest",
  applicationName: "A Tiempo",
  appleWebApp: {
    capable: true,
    title: "A Tiempo",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <RegistrarSW />
        </ThemeProvider>
      </body>
    </html>
  );
}
