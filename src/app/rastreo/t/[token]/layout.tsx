import type { Metadata } from "next";

/**
 * El enlace del QR del paquete. Igual que el rastreo por número, la página es
 * de cliente y el título se pone aquí.
 *
 * El token no va en el título ni en la descripción: es la llave que abre el
 * seguimiento en vivo, con la ubicación del mensajero, y no tiene por qué
 * quedar copiado en la vista previa de un chat.
 */
export const metadata: Metadata = {
  title: "Sigue tu pedido",
  description: "Mira dónde va tu paquete en tiempo real. No necesitas cuenta.",
  robots: { index: false, follow: false },
};

export default function RastreoTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
