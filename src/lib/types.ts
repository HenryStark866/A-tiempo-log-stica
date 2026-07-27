export type Role =
  | "admin"
  | "coordinador"
  | "operario"
  | "mensajero"
  | "cliente"
  | "pendiente";

export type GuideStatus =
  | "creada"
  | "recogida"
  | "en_cedi"
  | "zonificada"
  | "en_ruta"
  | "entregada"
  | "novedad"
  | "reprogramada"
  | "en_devolucion"
  | "devuelta"
  | "cancelada";

export type PickupStatus = "pendiente" | "asignada" | "completada" | "cancelada";
export type SettlementStatus = "pendiente" | "consignado" | "conciliado" | "con_diferencia";
export type InvoiceStatus = "borrador" | "emitida" | "pagada" | "anulada";
export type BillingCycle = "quincenal" | "mensual";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  client_id: string | null;
  zone_id: string | null;
  max_capacity: number;
  active: boolean;
  created_at: string;
  // Solicitud de registro (se llenan al registrarse; se limpian al aprobar)
  requested_role: Role | null;
  business_type: string | null;
  business_name: string | null;
  business_nit: string | null;
  business_address: string | null;
  // Mensajeros. `active` dice si puede entrar a la app; `verified_at` si el
  // admin revisó sus papeles y puede recibir trabajo. Son cosas distintas.
  courier_type: CourierType | null;
  verified_at: string | null;
  verified_by: string | null;
  vehicle_plate: string | null;
}

export type CourierType = "corporativo" | "colaborativo";

export type DocStatus = "pendiente" | "aprobado" | "rechazado";

export type DocType =
  | "cedula_frente"
  | "cedula_reverso"
  | "licencia_conduccion"
  | "tarjeta_propiedad"
  | "soat"
  | "tecnomecanica"
  | "foto_vehiculo"
  | "certificado_eps"
  | "antecedentes";

export interface CourierDocument {
  id: string;
  courier_id: string;
  doc_type: DocType;
  file_path: string;
  status: DocStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_on: string | null;
  uploaded_at: string;
}

export interface Client {
  id: string;
  business_name: string;
  nit: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  billing_cycle: BillingCycle;
  delivery_rate: number;
  return_rate: number;
  active: boolean;
  created_at: string;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  /** Municipios/sectores cubiertos, separados por coma. */
  coverage: string | null;
  /** Ciudades que esta zona cubre como último recurso, si no se reconoce el barrio. */
  city_fallback: string | null;
  /** Tarifa cobrada al e-commerce por entrega (modelo financiero V2). */
  delivery_rate: number;
  sort_order: number;
  active: boolean;
}

/** Pago al domiciliario. Vive aparte de Zone: el rol cliente no puede leerlo. */
export interface ZoneCost {
  zone_id: string;
  courier_fee: number;
}

/** Destinatario predeterminado sincronizado por el e-commerce. */
export interface Recipient {
  id: string;
  client_id: string;
  external_id: string | null;
  full_name: string;
  phone: string | null;
  address: string;
  city: string;
  zone_id: string | null;
  notes: string | null;
  times_used: number;
  last_used_at: string | null;
  active: boolean;
  created_at: string;
  /** Columnas del archivo del cliente que no mapean a un campo propio. */
  extra: Record<string, string>;
  at_zones?: { name: string } | null;
}

/** Producto del catálogo del e-commerce. */
export interface Product {
  id: string;
  client_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number;
  extra: Record<string, string>;
  active: boolean;
  created_at: string;
}

/** Cómo quiere el comercio que le paguen lo que se recauda contraentrega. */
export type PaymentKind =
  | "nequi"
  | "daviplata"
  | "bancolombia"
  | "otro_banco"
  | "link"
  | "efectivo";

export interface PaymentMethod {
  id: string;
  client_id: string;
  kind: PaymentKind;
  holder: string | null;
  identifier: string | null;
  instructions: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

/** Lo que devuelve at_payment_info: la vista pública del QR de pago. */
export interface PaymentInfo {
  guide_number: string;
  status: GuideStatus;
  is_cod: boolean;
  cod_amount: number;
  recipient_name: string;
  business_name: string;
  methods: Pick<PaymentMethod, "kind" | "holder" | "identifier" | "instructions">[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SyncRecipientsResult {
  creados: number;
  actualizados: number;
  omitidos: number;
}

export interface Pickup {
  id: string;
  client_id: string;
  scheduled_date: string;
  /** Hora deseada de recogida (requested_at guarda cuándo se solicitó). */
  scheduled_time: string | null;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: PickupStatus;
  operator_id: string | null;
  package_count: number | null;
  requested_at: string;
  completed_at: string | null;
  at_clients?: { business_name: string } | null;
  operator?: { full_name: string } | null;
  /** Guías asociadas a la recogida; se embeben solo los ids para contarlas. */
  at_guides?: { id: string }[];
}

export interface Guide {
  id: string;
  guide_number: string;
  client_id: string;
  pickup_id: string | null;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  recipient_city: string;
  zone_id: string | null;
  declared_value: number;
  is_cod: boolean;
  cod_amount: number;
  status: GuideStatus;
  delivery_attempts: number;
  courier_id: string | null;
  settlement_id: string | null;
  invoice_id: string | null;
  picked_up_at: string | null;
  received_cedi_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  delivery_evidence_url: string | null;
  delivery_signature_name: string | null;
  notes: string | null;
  created_at: string;
  /** Token aleatorio del QR de pago; no se deriva del número de guía. */
  payment_token: string;
  tracking_token: string;
  at_clients?: { business_name: string } | null;
  at_zones?: { name: string } | null;
  courier?: { full_name: string } | null;
}

export interface GuideEvent {
  id: string;
  guide_id: string;
  status: GuideStatus;
  note: string | null;
  actor_id: string | null;
  created_at: string;
  actor?: { full_name: string } | null;
}

export interface Settlement {
  id: string;
  courier_id: string;
  settlement_date: string;
  expected_amount: number;
  deposited_amount: number | null;
  bank_name: string | null;
  bank_reference: string | null;
  status: SettlementStatus;
  notes: string | null;
  reconciled_at: string | null;
  created_at: string;
  courier?: { full_name: string } | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
  at_clients?: { business_name: string } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  guide_id: string | null;
  description: string;
  amount: number;
}

/** Envío activo visto por el e-commerce (retorno de at_my_shipments). */
export interface Shipment {
  id: string;
  guide_number: string;
  status: GuideStatus;
  recipient_name: string;
  recipient_address: string;
  recipient_city: string;
  is_cod: boolean;
  cod_amount: number;
  delivery_attempts: number;
  created_at: string;
  delivered_at: string | null;
  zone_name: string | null;
  delivery_rate: number | null;
  courier_name: string | null;
  /** Solo llega con valor mientras la guía está en_ruta. */
  courier_lat: number | null;
  courier_lng: number | null;
  courier_position_at: string | null;
}

export interface DashboardKpis {
  by_status: Partial<Record<GuideStatus, number>>;
  guides_today: number;
  delivered_today: number;
  ltr_hours: number | null;
  tli_pct: number | null;
  cod_pending: number;
  settlements_pending: number;
  active_couriers: number;
}

export interface TrackingResult {
  guide_number: string;
  status: GuideStatus;
  recipient_city: string;
  created_at: string;
  delivered_at: string | null;
  delivery_attempts: number;
  events: { status: GuideStatus; created_at: string }[];
}

/**
 * Lo que ve quien escanea el QR del rótulo. Trae más que TrackingResult
 * —incluida la ubicación del mensajero— porque llega por un token que solo
 * tiene quien recibió el paquete, no por el número de guía, que es adivinable.
 */
export interface TrackingByToken extends TrackingResult {
  recipient_name: string;
  business_name: string | null;
  courier_name: string | null;
  courier_lat: number | null;
  courier_lng: number | null;
  courier_position_at: string | null;
}

/** Una guía lista para imprimir como rótulo. Viene de at_label_data. */
export interface LabelData {
  id: string;
  guide_number: string;
  tracking_token: string;
  payment_token: string;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_address: string;
  recipient_city: string;
  is_cod: boolean;
  cod_amount: number;
  notes: string | null;
  created_at: string;
  business_name: string;
  business_phone: string | null;
  zone_name: string | null;
}
