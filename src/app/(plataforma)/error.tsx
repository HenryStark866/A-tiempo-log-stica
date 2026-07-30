"use client";

import { PantallaError } from "@/components/PantallaError";

/**
 * Va dentro de la plataforma a propósito: si falla una pantalla, el menú y la
 * campana siguen ahí y la persona puede irse a otra sección sin recargar.
 */
export default function PlatformError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PantallaError {...props} />;
}
