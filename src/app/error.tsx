"use client";

import { PantallaError } from "@/components/PantallaError";

/** Cubre las pantallas públicas: portada, login, registro, rastreo y pago. */
export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PantallaError {...props} />;
}
