import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { RegistrarSW } from "@/components/RegistrarSW";
import { CapturaDeErrores } from "@/components/CapturaDeErrores";
import { Splash } from "@/components/Splash";
import { MARCA } from "@/lib/marca";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    // YAM es la plataforma; A Tiempo Logística es quien responde por el
    // paquete. En el título van las dos: el nombre que la gente reconoce y la
    // empresa que lo respalda.
    default: `${MARCA.app} — Red de mensajería de ${MARCA.empresa}`,
    template: `%s | ${MARCA.app}`,
  },
  description: `${MARCA.app} es la plataforma de última milla de ${MARCA.empresa} en Medellín: recogida, CEDI, ruteo, recaudo contraentrega y facturación con trazabilidad en tiempo real.`,
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
    // `data-scroll-behavior` le confirma a Next que el scroll suave de
    // globals.css es a propósito. Sin él, avisa en consola que en una versión
    // futura dejará de desactivarlo solo al cambiar de ruta — y ahí cada
    // navegación se iría deslizando en vez de empezar arriba de una.
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          themes={["light", "dark", "tema-multicolor"]}
          nonce={nonce}
        >
          {children}
          {/* Va de último y tapa por z-index, no por orden del DOM: así el
              contenido real ya está pintado debajo cuando el splash se
              retira, y nadie ve la app armándose. */}
          <Splash />
          <RegistrarSW />
          <CapturaDeErrores />
        </ThemeProvider>
      </body>
    </html>
  );
}
