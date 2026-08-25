import type {
  CourierType,
  DocStatus,
  DocType,
  FacilityDocType,
  GuideStatus,
  InvoiceStatus,
  PackageSize,
  PackageType,
  PaymentKind,
  PickupStatus,
  Role,
  SecurityEventType,
  SecuritySeverity,
  SettlementStatus,
  SocialPlatform,
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

// ── Tipificación del paquete ────────────────────────────────────────────
// Los `hint` no son decoración: son el criterio con el que el comercio elige
// sin tener que preguntar. Los valores están en la base con un CHECK; si se
// agrega uno aquí, hay que agregarlo allá (migración 0042).

export const PACKAGE_TYPES: { value: PackageType; label: string; hint: string }[] = [
  { value: "sobre", label: "Sobre",  hint: "Documentos, algo plano que no se dobla mal" },
  { value: "caja",  label: "Caja",   hint: "Lo más común: cartón cerrado" },
  { value: "bolsa", label: "Bolsa",  hint: "Ropa, textiles, empaque flexible" },
  { value: "tubo",  label: "Tubo",   hint: "Cuadros, planos, algo enrollado" },
  { value: "otro",  label: "Otro",   hint: "Cualquier cosa que no encaje arriba" },
];

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = Object.fromEntries(
  PACKAGE_TYPES.map((t) => [t.value, t.label])
) as Record<PackageType, string>;

/**
 * El tamaño se pide con referencias de la vida real y no en centímetros: el
 * comercio empaca a ojo y a nadie le sirve obligarlo a medir. Lo que el CEDI
 * necesita saber es si cabe en un maletín de moto.
 */
export const PACKAGE_SIZES: { value: PackageSize; label: string; hint: string }[] = [
  { value: "pequeno", label: "Pequeño", hint: "Cabe en un bolsillo o en un sobre" },
  { value: "mediano", label: "Mediano", hint: "Cabe en el maletín de la moto" },
  { value: "grande",  label: "Grande",  hint: "No cabe en el maletín: hay que amarrarlo" },
];

export const PACKAGE_SIZE_LABELS: Record<PackageSize, string> = Object.fromEntries(
  PACKAGE_SIZES.map((t) => [t.value, t.label])
) as Record<PackageSize, string>;

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
  admin_cedi: "Administrador de CEDI",
  asesor: "Asesor comercial",
};

export const STAFF_ROLES: Role[] = ["admin", "coordinador", "operario", "mensajero"];

/**
 * Gente del comercio: el dueño y sus asesores.
 *
 * Las pantallas venían preguntando `role === "cliente"` para decir «esto lo está
 * mirando alguien de un comercio, no del CEDI». Al nacer el asesor esa pregunta
 * empezó a mentir: en Pedidos gobernaba el botón de crear —el asesor no habría
 * podido hacer su trabajo principal— y en Recogidas elegía a qué comercio
 * pertenece la solicitud, con lo que un asesor habría pedido recogidas a nombre
 * de otro.
 *
 * Para «solo el DUEÑO» se compara con "cliente" a secas, que es lo que hacen las
 * pantallas de sedes, equipo, facturación y recaudo.
 */
export const ROLES_DEL_COMERCIO: Role[] = ["cliente", "asesor"];
export const OPS_ROLES: Role[] = ["admin", "coordinador"];

// Roles que una persona puede solicitar al registrarse por su cuenta.
// El resto (operario, coordinador, admin) se asignan internamente desde Usuarios.
export const REQUESTABLE_ROLES: Extract<Role, "cliente" | "mensajero">[] = ["cliente", "mensajero"];

// ── Medios de pago que el comercio publica en el QR de pago ────────────
//
// La tabla `at_payment_methods` guarda dos campos para esto: `kind`, un código
// de una lista cerrada por un CHECK, e `identifier`, un texto libre. El
// formulario, en cambio, pregunta por partes —banco, tipo de cuenta, número;
// o plataforma y llave; o descripción y enlace— porque preguntarlo todo junto
// en una casilla es lo que hacía imposible exigir que un número de cuenta
// fuera un número.
//
// Aquí vive la traducción entre las dos formas, en un solo lugar, para que el
// modal de Mi perfil y la vista pública del QR no la reinventen cada uno por
// su lado y terminen en desacuerdo.

// ── 1. Lo que se elige en pantalla ─────────────────────────────────────

/** La primera pregunta del modal: qué clase de medio se va a registrar. */
export type CategoriaDePago = "cuenta" | "billetera" | "enlace";

export const CATEGORIAS_DE_PAGO: { value: CategoriaDePago; label: string }[] = [
  { value: "cuenta", label: "Cuenta Bancaria" },
  { value: "billetera", label: "Billetera Digital / Llave" },
  { value: "enlace", label: "Enlace de Pago / Otro" },
];

/**
 * Bancos de la lista. `Otro` al final deja escribir el nombre a mano: la lista
 * cubre lo que se usa a diario sin pretender ser el registro completo de la
 * Superintendencia.
 */
export const BANCOS = [
  "Bancolombia",
  "Davivienda",
  "Banco de Bogotá",
  "BBVA",
  "Banco Caja Social",
  "Scotiabank Colpatria",
  "AV Villas",
  "Banco Popular",
  "Banco de Occidente",
  "Nu Bank",
  "Itaú",
  "Bancoomeva",
  "Serfinanza",
  "Lulo Bank",
  "Otro",
] as const;

export const BANCO_OTRO = "Otro";

export const TIPOS_DE_CUENTA = ["Ahorros", "Corriente"] as const;
export type TipoDeCuenta = (typeof TIPOS_DE_CUENTA)[number];

export const BILLETERAS = ["Nequi", "Daviplata", "Transfiya", "Dale!", "NuBank", "Otra"] as const;

export const BILLETERA_OTRA = "Otra";

export const LARGO_MAXIMO = {
  marca: 40,
  numero: 20,
  llave: 60,
  descripcion: 40,
  enlace: 300,
};

// ── 2. Lo que se guarda en la base ─────────────────────────────────────

/**
 * Los códigos de `kind`. Son una casilla gruesa, no la marca: el CHECK de la
 * base solo admite estos ocho valores, así que un Dale! o un Wompi no caben
 * ahí — su nombre viaja adelante del identificador.
 */
export const PAYMENT_KIND_LABELS: Record<string, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia: "Bancolombia",
  otro_banco: "Cuenta bancaria",
  billetera: "Billetera digital",
  link: "Link de pago",
  otro: "Otro medio",
  efectivo: "Efectivo al mensajero",
};

/**
 * Lo que une las partes dentro de `identifier`.
 *
 * Los espacios alrededor del guion no son decoración: son lo que permite
 * volver a separarlas al editar. Por eso las marcas y descripciones se guardan
 * sin guiones (ver `limpiarMarca`) — si alguien escribiera «Banco - Pop» la
 * partición saldría mal.
 */
export const SEPARADOR = " - ";

/**
 * La regla de todo el formato, en una frase: **la última parte es siempre el
 * dato con el que se paga, y todo lo de antes es contexto.**
 *
 *   «Davivienda - Ahorros - 12345678»  → contexto: Davivienda, Ahorros
 *   «Ahorros - 12345678»               → contexto: Ahorros (el banco lo dice el kind)
 *   «3001234567»                       → sin contexto
 *   «Dale! - 3001234567»               → contexto: Dale!
 *   «Link de Wompi - https://…»        → contexto: Link de Wompi
 *
 * Gracias a eso el QR público puede mostrar el contexto pequeño, el dato
 * grande, y copiar SOLO el dato — que es lo único que sirve pegado en la app
 * del banco.
 */
export function armarDato(contexto: string[], dato: string): string | null {
  const partes = [...contexto.map((c) => c.trim()).filter(Boolean), dato.trim()].filter(Boolean);
  return partes.join(SEPARADOR) || null;
}

export function partirDato(identifier: string | null | undefined): {
  contexto: string[];
  dato: string;
} {
  const crudo = (identifier ?? "").trim();
  if (!crudo) return { contexto: [], dato: "" };
  const partes = crudo.split(SEPARADOR).map((p) => p.trim()).filter(Boolean);
  return { contexto: partes.slice(0, -1), dato: partes[partes.length - 1] ?? "" };
}

// ── 3. De los campos de pantalla al par (kind, identifier) ─────────────

/** Todo lo que el modal captura, sin importar la categoría. */
export interface CamposDePago {
  categoria: CategoriaDePago;
  /** Cuenta: banco de la lista, y el nombre escrito a mano si eligió «Otro». */
  banco: string;
  bancoOtro: string;
  tipo: TipoDeCuenta;
  numero: string;
  /** Billetera: plataforma de la lista, y el nombre a mano si eligió «Otra». */
  plataforma: string;
  plataformaOtra: string;
  llave: string;
  /** Enlace / otro. */
  descripcion: string;
  enlace: string;
}

export const CAMPOS_DE_PAGO_VACIOS: CamposDePago = {
  categoria: "cuenta",
  banco: "Bancolombia",
  bancoOtro: "",
  tipo: "Ahorros",
  numero: "",
  plataforma: "Nequi",
  plataformaOtra: "",
  llave: "",
  descripcion: "",
  enlace: "",
};

/** El nombre que el comercio eligió, ya resuelto el caso «Otro». */
export function marcaElegida(c: CamposDePago): string {
  if (c.categoria === "cuenta") {
    return (c.banco === BANCO_OTRO ? c.bancoOtro : c.banco).trim();
  }
  if (c.categoria === "billetera") {
    return (c.plataforma === BILLETERA_OTRA ? c.plataformaOtra : c.plataforma).trim();
  }
  return c.descripcion.trim();
}

/**
 * La casilla de `kind` que le toca. Se elige por la marca cuando la base tiene
 * un código propio para ella —Bancolombia, Nequi, Daviplata—, y si no, por la
 * categoría.
 *
 * En «Enlace de Pago / Otro» decide el dato mismo: si empieza por http es un
 * link y el QR lo muestra como botón; si no hay dato, es que se cobra sin
 * dato, o sea efectivo.
 */
export function kindDeLosCampos(c: CamposDePago): PaymentKind {
  const marca = marcaElegida(c).toLowerCase();

  if (c.categoria === "cuenta") {
    return marca === "bancolombia" ? "bancolombia" : "otro_banco";
  }
  if (c.categoria === "billetera") {
    if (marca === "nequi") return "nequi";
    if (marca === "daviplata") return "daviplata";
    return "billetera";
  }
  const dato = c.enlace.trim();
  if (!dato) return "efectivo";
  return /^https?:\/\//i.test(dato) ? "link" : "otro";
}

/**
 * El texto que va a `identifier`. Deja fuera la marca cuando el `kind` ya la
 * dice, para que el QR no muestre «Bancolombia · Bancolombia».
 */
export function identifierDeLosCampos(c: CamposDePago): string | null {
  const kind = kindDeLosCampos(c);
  const marca = marcaElegida(c);
  const marcaEnElKind = kind === "bancolombia" || kind === "nequi" || kind === "daviplata";
  const contexto = marcaEnElKind ? [] : [marca];

  if (c.categoria === "cuenta") return armarDato([...contexto, c.tipo], c.numero);
  if (c.categoria === "billetera") return armarDato(contexto, c.llave);
  return armarDato(contexto, c.enlace);
}

/**
 * El camino de vuelta: de lo guardado a los campos del formulario, para poder
 * editar. Tolera lo que hay de antes —medios escritos en una sola línea,
 * cuando el formulario todavía no preguntaba por partes—: en ese caso el dato
 * que no encaja se devuelve aparte, en `sinUbicar`, y la pantalla se lo enseña
 * al comercio en vez de adivinar o de borrárselo.
 */
export function camposDeUnMedio(
  kind: PaymentKind,
  identifier: string | null | undefined
): { campos: CamposDePago; sinUbicar: string | null } {
  const { contexto, dato } = partirDato(identifier);
  const c: CamposDePago = { ...CAMPOS_DE_PAGO_VACIOS };

  const enLista = (lista: readonly string[], valor: string) =>
    lista.find((x) => x.toLowerCase() === valor.toLowerCase()) ?? "";

  if (kind === "bancolombia" || kind === "otro_banco") {
    c.categoria = "cuenta";
    // Contexto de una cuenta: [banco?, tipo]. El banco falta cuando lo dice el kind.
    const tipoTexto = contexto[contexto.length - 1] ?? "";
    const tipo = enLista(TIPOS_DE_CUENTA, tipoTexto) as TipoDeCuenta | "";
    const bancoTexto =
      kind === "bancolombia" ? "Bancolombia" : contexto.slice(0, tipo ? -1 : undefined).join(SEPARADOR);

    const bancoConocido = enLista(BANCOS, bancoTexto);
    c.banco = bancoConocido || (bancoTexto ? BANCO_OTRO : "Bancolombia");
    c.bancoOtro = bancoConocido ? "" : bancoTexto;
    c.tipo = tipo || "Ahorros";
    c.numero = /^\d+$/.test(dato) ? dato : "";
    // Si el número no era un número, o no se reconoció el tipo, lo guardado no
    // tenía esta forma: se devuelve entero para que lo reescriba.
    const encaja = c.numero !== "" && tipo !== "";
    return { campos: c, sinUbicar: encaja ? null : (identifier ?? "") || null };
  }

  if (kind === "nequi" || kind === "daviplata" || kind === "billetera") {
    c.categoria = "billetera";
    const marca = kind === "nequi" ? "Nequi" : kind === "daviplata" ? "Daviplata" : contexto[0] ?? "";
    const conocida = enLista(BILLETERAS, marca);
    c.plataforma = conocida || (marca ? BILLETERA_OTRA : "Nequi");
    c.plataformaOtra = conocida ? "" : marca;
    c.llave = dato;
    return { campos: c, sinUbicar: null };
  }

  c.categoria = "enlace";
  if (kind === "efectivo") {
    // En efectivo no hay dato de cobro: lo guardado, si hay algo, ES el nombre.
    c.descripcion = (identifier ?? "").trim() || "Efectivo al mensajero";
    c.enlace = "";
  } else {
    c.descripcion = contexto.join(SEPARADOR);
    c.enlace = dato;
  }
  return { campos: c, sinUbicar: null };
}

// ── 4. Filtros de tecleo ───────────────────────────────────────────────
// Corren en cada pulsación, así que tienen que aguantar lo que está a medio
// escribir.

/** Número de cuenta: un número. Ni el banco, ni «ahorros», ni guiones. */
export function limpiarNumero(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, LARGO_MAXIMO.numero);
}

/**
 * Marcas y descripciones: letras, números, espacio, punto y signos de nombre
 * comercial. El guion queda fuera a propósito, porque es el separador con el
 * que se arma `identifier`.
 */
export function limpiarMarca(valor: string, tope: number): string {
  return valor
    .replace(/[^\p{L}\p{N} .&!']/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, tope);
}

/**
 * Llave de billetera: alfanumérico normal. Cabe un celular, un @usuario, un
 * correo o una llave Bre-B. Sin guiones, para no chocar con el separador.
 */
export function limpiarLlave(valor: string): string {
  return valor
    .replace(/[^\p{L}\p{N} .@_+]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, LARGO_MAXIMO.llave);
}

/**
 * El enlace NO se limpia tecla a tecla: quitarle los dos puntos y las barras
 * impediría escribir «https://». Se revisa entero al guardar.
 */
export function limpiarEnlace(valor: string): string {
  return valor.slice(0, LARGO_MAXIMO.enlace);
}

// ── 5. Revisión al guardar ─────────────────────────────────────────────

/**
 * Devuelve el reclamo para mostrar, o `null` si el medio está bien. Vive junto
 * a todo lo demás para que el formulario y la restricción de la base
 * (migración 0099) cuenten exactamente la misma historia: si aquí se dejara
 * pasar algo que allá se rechaza, el comercio se llevaría un error crudo de
 * Postgres en vez de una frase en español.
 */
export function revisarMedioDePago(c: CamposDePago): string | null {
  if (c.categoria === "cuenta") {
    if (c.banco === BANCO_OTRO && !c.bancoOtro.trim()) return "Escribe el nombre del banco.";
    if (!c.tipo) return "Elige si la cuenta es de ahorros o corriente.";
    const numero = c.numero.trim();
    if (!numero) return "Falta el número de cuenta.";
    if (numero.length < 6) return "El número de cuenta se ve incompleto: son al menos 6 dígitos.";
    return null;
  }

  if (c.categoria === "billetera") {
    if (c.plataforma === BILLETERA_OTRA && !c.plataformaOtra.trim()) {
      return "Escribe el nombre de la billetera.";
    }
    if (!c.llave.trim()) return "Falta el número o la llave con la que te pagan.";
    return null;
  }

  if (!c.descripcion.trim()) return "Ponle un nombre a este medio de pago.";
  const dato = c.enlace.trim();
  if (dato && /^https?:\/\//i.test(dato) && !/^https?:\/\/\S{3,}$/i.test(dato)) {
    // El espacio en la mitad delata un link pegado a medias. Es la misma
    // condición que exige la base, palabra por palabra.
    return "El enlace está incompleto o lleva espacios en la mitad.";
  }
  return null;
}

// ── 6. Cómo se muestra al público ──────────────────────────────────────

/**
 * El título que lee quien va a pagar.
 *
 * Manda la marca guardada en el identificador —«Davivienda», «Dale!», «Link de
 * Wompi»— y solo cuando no hay ninguna se usa la etiqueta del código. Así el
 * destinatario ve el nombre del banco de verdad y no un genérico «Cuenta
 * bancaria», sin que la base tenga que conocer todas las marcas del país.
 */
export function tituloDelMedio(kind: PaymentKind, identifier: string | null | undefined): string {
  const { contexto } = partirDato(identifier);
  return contexto[0] || PAYMENT_KIND_LABELS[kind] || kind;
}

/** El contexto que va debajo del título: el tipo de cuenta y demás. */
export function detalleDelMedio(kind: PaymentKind, identifier: string | null | undefined): string {
  const { contexto } = partirDato(identifier);
  return contexto.slice(1).join(" · ");
}

/**
 * Lo que el botón «copiar» le entrega a quien va a pagar: SOLO el dato. Pegar
 * «Ahorros - 12345» en la app del banco no sirve, y quien está en la puerta
 * con el paquete en la mano no está para editar texto.
 */
export function datoParaCopiar(identifier: string | null | undefined): string {
  return partirDato(identifier).dato;
}

/** La URL a la que lleva el botón, si de verdad hay una. */
export function enlaceDelMedio(identifier: string | null | undefined): string | null {
  const { dato } = partirDato(identifier);
  return /^https?:\/\/\S{3,}$/i.test(dato) ? dato : null;
}

/**
 * Parte un celular de diez dígitos en «300 123 4567» para poder leerlo o
 * dictarlo sin perder uno. Es solo presentación: lo que se guarda y lo que
 * copia el botón del QR sigue siendo la tira de dígitos seguidos. Cualquier
 * otro valor sale tal cual.
 */
export function agruparDigitos(valor: string | null | undefined): string {
  const v = valor ?? "";
  if (!/^\d{10}$/.test(v)) return v;
  return `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}`;
}

// ── Mi perfil: la red social que cada quien elige mostrar ───────────────
// Un enlace por persona, no una lista — por eso es texto libre con un tipo
// fijo al lado, igual que los medios de pago de arriba, y no una tabla aparte.

export const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string; hint: string }[] = [
  { value: "whatsapp", label: "WhatsApp", hint: "Número con indicativo, ej: 573001234567" },
  { value: "instagram", label: "Instagram", hint: "@usuario" },
  { value: "facebook", label: "Facebook", hint: "Nombre de la página o perfil" },
  { value: "tiktok", label: "TikTok", hint: "@usuario" },
  { value: "x", label: "X", hint: "@usuario" },
];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.value, p.label])
) as Record<SocialPlatform, string>;

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
export const COURIER_DOCS: {
  value: DocType;
  label: string;
  hint: string;
  expires: boolean;
  /** Trámite en línea para sacarlo, cuando lo hay. Se pinta como un botón. */
  tramite?: { url: string; label: string };
}[] = [
  { value: "cedula_frente",       label: "Cédula (frente)",      hint: "Foto legible por el lado de la foto.", expires: false },
  { value: "cedula_reverso",      label: "Cédula (reverso)",     hint: "El otro lado del documento.",          expires: false },
  { value: "licencia_conduccion", label: "Licencia de conducción", hint: "Vigente y de la categoría del vehículo.", expires: true },
  { value: "tarjeta_propiedad",   label: "Tarjeta de propiedad", hint: "Del vehículo con el que va a trabajar.", expires: false },
  {
    value: "certificado_medidas_correctivas",
    label: "Certificado de medidas correctivas",
    hint: "Lo saca gratis en la página de la Policía con la cédula. Descárgalo en PDF y súbelo aquí.",
    expires: false,
    tramite: {
      url: "https://srvcnpc.policia.gov.co/PSC/frm_cnp_consulta.aspx",
      label: "Sacarlo en la página de la Policía",
    },
  },
  { value: "soat",                label: "SOAT",                 hint: "Seguro obligatorio vigente.",          expires: true },
  { value: "tecnomecanica",       label: "Tecnomecánica",        hint: "Obligatoria si el vehículo tiene más de 2 años.", expires: true },
  { value: "foto_vehiculo",       label: "Foto del vehículo",    hint: "Donde se vea la placa.",               expires: false },
  { value: "certificado_eps",     label: "Certificado de EPS",   hint: "Afiliación vigente a salud.",          expires: false },
  { value: "antecedentes",        label: "Antecedentes judiciales", hint: "Certificado de la Policía Nacional.", expires: false },
];

export const DOC_LABELS: Record<DocType, string> = Object.fromEntries(
  COURIER_DOCS.map((d) => [d.value, d.label])
) as Record<DocType, string>;

/**
 * Espejo en cliente de public.at_required_courier_docs. Si cambia allá, cambia
 * aquí: la base es la que manda y rechaza la habilitación, esto solo evita que
 * la pantalla prometa algo distinto.
 *
 * Hoy es la misma lista para los dos tipos: sale a la calle con la marca
 * encima quien sea, y se verifica igual. El SOAT dejó de ser obligatorio para
 * habilitar —se puede subir, pero ya no frena a nadie— y entró el certificado
 * de medidas correctivas.
 */
const DOCS_OBLIGATORIOS: DocType[] = [
  "cedula_frente",
  "cedula_reverso",
  "licencia_conduccion",
  "tarjeta_propiedad",
  "certificado_medidas_correctivas",
];

export const COURIER_REQUIRED_DOCS: Record<CourierType, DocType[]> = {
  corporativo: DOCS_OBLIGATORIOS,
  colaborativo: DOCS_OBLIGATORIOS,
};

/**
 * Documentos de quien pide afiliar un CEDI: los mismos dos mundos que un
 * mensajero colaborativo (persona + lo que va a operar), pero el "vehículo"
 * aquí es el local. Todos obligatorios: sin ellos no hay con qué verificar
 * ni a la persona ni la dirección donde va a quedar la bodega.
 */
export const FACILITY_DOCS: { value: FacilityDocType; label: string; hint: string }[] = [
  { value: "cedula_frente", label: "Cédula (frente)", hint: "Foto legible por el lado de la foto." },
  { value: "cedula_reverso", label: "Cédula (reverso)", hint: "El otro lado del documento." },
  {
    value: "documento_local",
    label: "Propiedad o arriendo del local",
    hint: "Escritura si es propio, o contrato de arrendamiento si es alquilado.",
  },
  {
    value: "recibo_servicio_publico",
    label: "Recibo de servicio público",
    hint: "De agua, luz o gas, a nombre del local o de quien lo arrienda — confirma la dirección.",
  },
  {
    value: "foto_local",
    label: "Foto del local",
    hint: "Fachada y por dentro: de ahí va a salir y entrar la mercancía.",
  },
];

export const FACILITY_DOC_LABELS: Record<FacilityDocType, string> = Object.fromEntries(
  FACILITY_DOCS.map((d) => [d.value, d.label])
) as Record<FacilityDocType, string>;

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
