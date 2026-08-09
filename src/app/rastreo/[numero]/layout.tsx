import type { Metadata } from "next";

/**
 * El título de la pestaña lleva el número de pedido.
 *
 * La página de resultado es un componente de cliente y no puede exportar
 * `metadata`, así que el título se pone aquí, en el layout, que sí corre en el
 * servidor. Importa porque estos enlaces se comparten por WhatsApp: sin esto,
 * el destinatario recibía una tarjeta que solo decía el nombre de la app y no
 * de qué envío se trataba.
 *
 * No se consulta el pedido para armar el título: haría falta un viaje a la base
 * en cada carga para no ganar nada, y expondría en el título si el pedido existe
 * o no a quien vaya probando números.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ numero: string }>;
}): Promise<Metadata> {
  const { numero } = await params;
  const guia = decodeURIComponent(numero).trim().toUpperCase();
  return {
    title: `Pedido ${guia}`,
    description: `Estado y movimientos del envío ${guia}. Consulta pública: no necesitas cuenta.`,
    // Un rastreo no aporta nada a un buscador y sí filtra números de pedido
    // reales al índice. Se sirve a quien tenga el enlace, no a Google.
    robots: { index: false, follow: false },
  };
}

export default function RastreoNumeroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
