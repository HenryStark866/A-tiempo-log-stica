export type Role =
  | "admin"
  | "coordinador"
  | "operario"
  | "mensajero"
  | "cliente"
  | "pendiente"
  // El administrador de UN CEDI afiliado: ve y gestiona solo su propia
  // operación (su `facility_id`), nunca la del CEDI Principal ni la de otro
  // afiliado. Ver src/lib/types.ts:Client.facility_id y la migración 0046.
  | "admin_cedi"
  // Trabaja PARA un comercio: registra pedidos y pide recogidas. Comparte el
  // `client_id` de su jefe —lo necesita para que RLS le deje ver los pedidos
  // del comercio— pero NO ve facturas, pagos, remesas ni medios de pago. Esa
  // frontera vive en la base, no en las pantallas. Ver migración 0074.
  | "asesor";

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

// `en_curso` lo añadió la migración 0028 cuando el mensajero pasó a arrancar la
// recogida desde su teléfono, pero el tipo se quedó atrás: la pantalla del CEDI
// no sabía distinguir «asignada» de «el mensajero ya va en camino».
export type PickupStatus =
  | "pendiente"
  | "asignada"
  | "en_curso"
  | "completada"
  | "cancelada";
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
  /** Del rol admin_cedi (y del personal futuro afiliado a un CEDI). Null = personal nacional. */
  facility_id: string | null;
  max_capacity: number;
  active: boolean;
  created_at: string;
  // Solicitud de registro (se llenan al registrarse; se limpian al aprobar)
  requested_role: Role | null;
  business_type: string | null;
  business_name: string | null;
  business_nit: string | null;
  business_address: string | null;
  /** Ciudad propuesta por quien pide afiliar un CEDI. */
  proposed_city: string | null;
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

/** Documentos de quien pide afiliar un CEDI: de la persona y del local. */
export type FacilityDocType =
  | "cedula_frente"
  | "cedula_reverso"
  | "documento_local"
  | "recibo_servicio_publico"
  | "foto_local";

export interface FacilityDocument {
  id: string;
  applicant_id: string;
  doc_type: FacilityDocType;
  file_path: string;
  status: DocStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
}

/** Lo que arma at_list_solicitudes_cedi para el panel del admin. */
export interface SolicitudCedi {
  id: string;
  full_name: string;
  phone: string | null;
  business_name: string | null;
  business_address: string | null;
  proposed_city: string | null;
  created_at: string;
  documentos: FacilityDocument[];
}

export interface Client {
  id: string;
  business_name: string;
  nit: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Municipio donde está el comercio: de aquí se deduce su zona de origen. */
  city: string | null;
  billing_cycle: BillingCycle;
  delivery_rate: number;
  return_rate: number;
  active: boolean;
  created_at: string;
  /** Logo de la marca, en el bucket público at-brand-logos. */
  logo_url: string | null;
  /** El comercio autorizó que su marca salga en la portada. */
  show_in_landing: boolean;
  /** Presencia en línea del comercio: todos opcionales, los edita él mismo. */
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  /** El CEDI que ejecuta la logística de este comercio. Null = CEDI Principal. */
  facility_id: string | null;
  /** Zona desde la que SALEN sus envíos: es el origen del par de tarifa. */
  zone_id: string | null;
}

/** Una fila del tarifario personalizado que ve un comercio (at_mi_tarifario). */
export interface TarifaDestino {
  id: string;
  name: string;
  coverage: string | null;
  sort_order: number;
  delivery_rate: number;
  es_mi_zona: boolean;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  method: string | null;
  reference: string | null;
  receipt_path: string | null;
  reported_at: string;
  status: "pendiente" | "verificado" | "rechazado";
  review_notes: string | null;
  verified_at: string | null;
}

/** Lo que responde at_estado_cartera: si puede seguir despachando y cuánto debe. */
export interface EstadoCartera {
  al_dia: boolean;
  saldo: number;
  vence_en: string | null;
}

/**
 * La devolución del contraentrega al comercio. Es el tercer tramo de la plata,
 * distinto de at_settlements (mensajero → ATL) y de at_invoices (comercio → ATL).
 */
export interface CodRemittance {
  id: string;
  remittance_number: string;
  client_id: string;
  period_start: string;
  period_end: string;
  guide_count: number;
  /** Todo lo que pagó el comprador. */
  gross_amount: number;
  /** La parte del recaudo que era nuestra: el domicilio dentro del COD. */
  shipping_kept: number;
  /** Lo que se le abonó a sus facturas con este mismo recaudo. */
  invoice_offset: number;
  /** Lo que efectivamente se le gira. */
  net_amount: number;
  status: "pendiente" | "pagada";
  method: string | null;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
  at_clients?: { business_name: string } | null;
}

/** Lo que hay listo para girarle a un comercio (at_recaudo_por_girar). */
export interface RecaudoPorGirar {
  guias: number;
  bruto: number;
  flete_nuestro: number;
  disponible: number;
  deuda_fletes: number;
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
  /**
   * Código del QR del lote. Nace con la solicitud, no al asignarla: el comercio
   * tiene que poder imprimirlo y pegarlo en la estiba desde el primer momento.
   * En el CEDI, un escaneo ingresa todas las guías de esta recogida.
   */
  pickup_token: string;
  at_clients?: { business_name: string } | null;
  operator?: { full_name: string } | null;
  /** Guías asociadas a la recogida; se embeben solo los ids para contarlas. */
  at_guides?: { id: string }[];
}

/** Cómo viene empacado. Decide quién puede cargarlo y cómo se manipula. */
export type PackageType = "sobre" | "caja" | "bolsa" | "tubo" | "otro";
export type PackageSize = "pequeno" | "mediano" | "grande";

/**
 * Una línea del contenido del paquete.
 *
 * Es una copia congelada de lo que había en el catálogo al crear la guía, no
 * una referencia viva: si el comercio le sube el precio al producto o lo borra,
 * lo que viajó en esa caja sigue diciendo lo que viajó. `product_id` se guarda
 * solo por trazabilidad, y puede apuntar a un producto que ya no existe.
 */
export interface GuideItem {
  product_id: string | null;
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
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
  /** Instrucciones para quien entrega («timbre dañado, llamar»). */
  notes: string | null;
  /** Qué va adentro, en palabras. No confundir con `notes`. */
  content_description: string | null;
  package_type: PackageType | null;
  package_size: PackageSize | null;
  package_weight_kg: number | null;
  is_fragile: boolean;
  items: GuideItem[];
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
  client_id: string;
  /** Solo lo necesita staff, que ve el seguimiento de todos los comercios a
   * la vez: para el rol cliente siempre es el mismo, así que no se usa. */
  client_name: string | null;
  zone_name: string | null;
  delivery_rate: number | null;
  courier_name: string | null;
  /** Solo llega con valor mientras la guía está en_ruta. */
  courier_lat: number | null;
  courier_lng: number | null;
  courier_position_at: string | null;
}

export type SecurityEventType =
  | "login_fallido"
  | "escalar_rol_bloqueado"
  | "cambio_rol_admin"
  | "mensajero_habilitado"
  | "mensajero_revocado"
  | "documento_rechazado";

export type SecuritySeverity = "info" | "advertencia" | "critico";

/** Fila de at_security_events. Ver at_log_security_event: lista cerrada de
 * tipos, nunca texto libre — lo que llegue por fuera de ese catálogo la base
 * ya lo descarta antes de guardarlo. */
export interface SecurityEvent {
  id: string;
  created_at: string;
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  actor_id: string | null;
  actor_role: Role | null;
  detail: Record<string, unknown>;
  path: string | null;
  user_agent: string | null;
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

/**
 * Dónde está el dinero contraentrega de un pedido ya entregado.
 *
 * Son cuatro y no dos a propósito: "¿tienen mi plata?" tiene respuestas
 * distintas según el momento, y juntarlas sería mentir por simplificación.
 * Mientras el mensajero no cierre su caja, la plata es del comercio pero
 * todavía NO está en nuestras manos.
 */
export type EstadoDelDinero =
  | "con_el_mensajero"
  | "en_nuestras_manos"
  | "en_remesa"
  | "girado";

export interface RecaudoPedido {
  guide_number: string;
  recipient_name: string;
  delivered_at: string | null;
  cod_amount: number;
  shipping_fee: number;
  cod_includes_shipping: boolean;
  /** Lo que le toca al comercio: el contraentrega menos el domicilio si venía dentro. */
  le_corresponde: number;
  estado_dinero: EstadoDelDinero;
  remittance_number: string | null;
  paid_at: string | null;
}

export interface RecaudoRemesa {
  remittance_number: string;
  period_start: string;
  period_end: string;
  guide_count: number;
  gross_amount: number;
  shipping_kept: number;
  invoice_offset: number;
  net_amount: number;
  status: "pendiente" | "pagada";
  method: string | null;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
}

/** Lo que devuelve at_mi_recaudo(). */
export interface MiRecaudo {
  resumen: Record<EstadoDelDinero, { pedidos: number; monto: number }> & {
    recaudado_total: number;
    domicilios_cobrados_al_comprador: number;
  };
  pedidos: RecaudoPedido[];
  remesas: RecaudoRemesa[];
}


/** Una sede del comercio. Su zona es la mitad del precio de cada domicilio. */
export interface Sede {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  zone_id: string | null;
  zone_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  es_principal: boolean;
  active: boolean;
  asesores: number;
  pedidos: number;
}

/** Un asesor del comercio, visto por su jefe (at_mis_asesores). */
export interface Asesor {
  id: string;
  full_name: string;
  phone: string | null;
  /** `por_aprobar` todavía no entra; `suspendido` entró y se le quitó el acceso. */
  estado: "por_aprobar" | "habilitado" | "suspendido";
  site_id: string | null;
  site_name: string | null;
  created_at: string;
  pedidos: number;
}
