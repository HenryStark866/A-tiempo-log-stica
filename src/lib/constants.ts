import type { GuideStatus, InvoiceStatus, PickupStatus, Role, SettlementStatus } from "./types";

export const APP_NAME = "A Tiempo Logística";

export const GUIDE_STATUS_LABELS: Record<GuideStatus, string> = {
  creada: "Creada",
  recogida: "Recogida",
  en_cedi: "En CEDI",
  zonificada: "Zonificada",
  en_ruta: "En ruta",
  entregada: "Entregada",
  novedad: "Novedad",
  reprogramada: "Reprogramada",
  en_devolucion: "En devolución",
  devuelta: "Devuelta",
  cancelada: "Cancelada",
};

export const GUIDE_STATUS_COLORS: Record<GuideStatus, string> = {
  creada: "bg-slate-100 text-slate-700 border-slate-200",
  recogida: "bg-sky-50 text-sky-700 border-sky-200",
  en_cedi: "bg-indigo-50 text-indigo-700 border-indigo-200",
  zonificada: "bg-violet-50 text-violet-700 border-violet-200",
  en_ruta: "bg-blue-50 text-blue-700 border-blue-200",
  entregada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  novedad: "bg-amber-50 text-amber-700 border-amber-200",
  reprogramada: "bg-orange-50 text-orange-700 border-orange-200",
  en_devolucion: "bg-rose-50 text-rose-700 border-rose-200",
  devuelta: "bg-red-50 text-red-700 border-red-200",
  cancelada: "bg-gray-100 text-gray-500 border-gray-200",
};

export const PICKUP_STATUS_LABELS: Record<PickupStatus, string> = {
  pendiente: "Pendiente",
  asignada: "Asignada",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pendiente: "Pendiente",
  consignado: "Consignado",
  conciliado: "Conciliado",
  con_diferencia: "Con diferencia",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  pagada: "Pagada",
  anulada: "Anulada",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  coordinador: "Coordinador",
  operario: "Operario",
  mensajero: "Mensajero",
  cliente: "Cliente e-commerce",
  pendiente: "Pendiente de activación",
};

export const STAFF_ROLES: Role[] = ["admin", "coordinador", "operario", "mensajero"];
export const OPS_ROLES: Role[] = ["admin", "coordinador"];

// Roles que una persona puede solicitar al registrarse por su cuenta.
// El resto (operario, coordinador, admin) se asignan internamente desde Usuarios.
export const REQUESTABLE_ROLES: Extract<Role, "cliente" | "mensajero">[] = ["cliente", "mensajero"];

// Medios de pago que el comercio puede publicar en el QR de pago.
// `hint` es lo que se le pide escribir en el campo del identificador.
export const PAYMENT_KINDS = [
  { value: "nequi",       label: "Nequi",             hint: "Número de celular" },
  { value: "daviplata",   label: "Daviplata",         hint: "Número de celular" },
  { value: "bancolombia", label: "Bancolombia",       hint: "Número de cuenta" },
  { value: "otro_banco",  label: "Otro banco",        hint: "Banco y número de cuenta" },
  { value: "link",        label: "Link de pago",      hint: "https://…" },
  { value: "efectivo",    label: "Efectivo al mensajero", hint: "" },
] as const;

export const PAYMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_KINDS.map((k) => [k.value, k.label])
);

// Catálogo inicial de tipos de negocio para clientes e-commerce (editable).
export const BUSINESS_TYPES = [
  "Moda / Ropa",
  "Tecnología",
  "Alimentos",
  "Belleza y cuidado",
  "Hogar",
  "Accesorios",
  "Otro",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
