import type {
  CourierType,
  DocStatus,
  DocType,
  GuideStatus,
  InvoiceStatus,
  PickupStatus,
  Role,
  SecurityEventType,
  SecuritySeverity,
  SettlementStatus,
} from "./types";

// Los nombres de la marca viven en `lib/marca.ts`, que distingue la plataforma
// (YAM) de la empresa (A Tiempo Logística). Aquí había un APP_NAME suelto que
// no usaba nadie y que ya decía el nombre equivocado.

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
  en_curso: "En curso",
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

// ── Mensajeros: tipo y documentos ──────────────────────────────────────

export const COURIER_TYPE_LABELS: Record<CourierType, string> = {
  corporativo: "Corporativo",
  colaborativo: "Colaborativo",
};

export const COURIER_TYPE_HINTS: Record<CourierType, string> = {
  corporativo: "De la empresa, con vehículo de la empresa.",
  colaborativo: "Externo, pone su propio vehículo.",
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pendiente: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  pendiente: "bg-amber-50 text-amber-700 border-amber-200",
  aprobado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rechazado: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * Catálogo de documentos. `expires` marca los que se vencen y por eso piden
 * fecha: un SOAT vencido invalida al mensajero aunque ya se lo hayan aprobado.
 *
 * Qué es obligatorio lo decide COURIER_REQUIRED_DOCS, no este catálogo.
 */
export const COURIER_DOCS: { value: DocType; label: string; hint: string; expires: boolean }[] = [
  { value: "cedula_frente",       label: "Cédula (frente)",      hint: "Foto legible por el lado de la foto.", expires: false },
  { value: "cedula_reverso",      label: "Cédula (reverso)",     hint: "El otro lado del documento.",          expires: false },
  { value: "licencia_conduccion", label: "Licencia de conducción", hint: "Vigente y de la categoría del vehículo.", expires: true },
  { value: "tarjeta_propiedad",   label: "Tarjeta de propiedad", hint: "Del vehículo con el que va a trabajar.", expires: false },
  { value: "soat",                label: "SOAT",                 hint: "Seguro obligatorio vigente.",          expires: true },
  { value: "tecnomecanica",       label: "Tecnomecánica",        hint: "Obligatoria si el vehículo tiene más de 2 años.", expires: true },
  { value: "foto_vehiculo",       label: "Foto del vehículo",    hint: "Donde se vea la placa.",               expires: false },
  { value: "certificado_eps",     label: "Certificado de EPS",   hint: "Afiliación vigente a salud.",          expires: false },
  { value: "antecedentes",        label: "Antecedentes",         hint: "Certificado de la Policía Nacional.",  expires: false },
];

export const DOC_LABELS: Record<DocType, string> = Object.fromEntries(
  COURIER_DOCS.map((d) => [d.value, d.label])
) as Record<DocType, string>;

/**
 * Espejo en cliente de public.at_required_courier_docs. Si cambia allá, cambia
 * aquí: la base es la que manda y rechaza la habilitación, esto solo evita que
 * la pantalla prometa algo distinto.
 *
 * El colaborativo pone su propio vehículo, así que responde con él ante un
 * siniestro y se le exigen los papeles del vehículo.
 */
export const COURIER_REQUIRED_DOCS: Record<CourierType, DocType[]> = {
  corporativo: ["cedula_frente", "cedula_reverso", "licencia_conduccion"],
  colaborativo: [
    "cedula_frente",
    "cedula_reverso",
    "licencia_conduccion",
    "tarjeta_propiedad",
    "soat",
  ],
};

// ── Registro de seguridad ───────────────────────────────────────────────

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  login_fallido: "Credenciales fallidas",
  escalar_rol_bloqueado: "Intento de escalar rol bloqueado",
  cambio_rol_admin: "Cambio de rol/comercio por un admin",
  mensajero_habilitado: "Mensajero habilitado",
  mensajero_revocado: "Habilitación de mensajero retirada",
  documento_rechazado: "Documento de mensajero rechazado",
};

export const SECURITY_SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  info: "Informativo",
  advertencia: "Advertencia",
  critico: "Crítico",
};

export const SECURITY_SEVERITY_COLORS: Record<SecuritySeverity, string> = {
  info: "bg-slate-100 text-slate-700 border-slate-200",
  advertencia: "bg-amber-50 text-amber-700 border-amber-200",
  critico: "bg-rose-50 text-rose-700 border-rose-200",
};

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
