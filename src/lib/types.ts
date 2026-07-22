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
  active: boolean;
  created_at: string;
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
  active: boolean;
}

export interface Pickup {
  id: string;
  client_id: string;
  scheduled_date: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: PickupStatus;
  operator_id: string | null;
  requested_at: string;
  completed_at: string | null;
  at_clients?: { business_name: string } | null;
  operator?: { full_name: string } | null;
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
  notes: string | null;
  created_at: string;
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
