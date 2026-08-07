export function formatCOP(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

// Las fechas se fueron a `tiempo.ts`, donde quedaron ancladas a la zona de
// Medellín. Se siguen exportando desde aquí porque es de donde las importan
// las ~15 pantallas que ya existían, y no hay dos implementaciones: esto es
// el mismo código, solo que alcanzable por el nombre de siempre.
export { formatDate, formatDateTime, formatHora } from "./tiempo";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Minúsculas y sin tildes, para comparar como lo hace quien escribe rápido en
 * un teléfono. Quien busca «aji» tiene que encontrar «Ají» igual que quien
 * busca «ají»: nadie debería quedarse sin resultados por no haber mantenido
 * presionada la tecla del acento.
 */
export function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * El freno contra solicitudes masivas responde con PT429, que PostgREST
 * entrega como un HTTP 429.
 *
 * Hace falta distinguirlo porque las pantallas públicas trataban cualquier
 * error como «no encontramos esa guía»: a alguien frenado le habríamos dicho
 * que su pedido no existe, que es la peor noticia posible y además falsa.
 */
export function esDemasiadasSolicitudes(error: { code?: string } | null): boolean {
  return error?.code === "PT429";
}
