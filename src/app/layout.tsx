import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "A Tiempo Logística — Última milla para e-commerce",
    template: "%s | A Tiempo Logística",
  },
  description:
    "Plataforma de logística de última milla para e-commerce en Medellín: recogida, CEDI, ruteo, recaudo contraentrega y facturación con trazabilidad en tiempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
