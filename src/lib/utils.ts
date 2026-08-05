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
