/**
 * Inventario híbrido, precios de oferta y liquidación de la vitrina.
 *
 * Todo vive dentro del JSONB `extra` de `at_products`: la migración 0143 le da
 * a `anon` lectura de `extra` (y de nada más que no sea público), así que la
 * vitrina puede leer estas llaves sin abrir columnas nuevas ni tocar RLS.
 *
 * Llaves que este módulo administra dentro de `extra`:
 *
 *   is_made_to_order  boolean  Modo B: hecho bajo pedido (no se agota).
 *   lead_time_days    number   Días hábiles de elaboración (Modo B).
 *   stock_quantity    number   Modo A: unidades listas. Si NO existe la llave,
 *                              el producto no lleva conteo (catálogo heredado)
 *                              y se vende sin tope — así los productos que ya
 *                              estaban publicados no amanecen «Agotados».
 *   units_sold        number   Contador acumulado para la prueba social.
 *   is_on_sale        boolean  Oferta activa.
 *   original_price    number   Precio antes del descuento (se muestra tachado).
 *   discount_percent  number   Porcentaje de descuento.
 *
 * `price` (la columna) es SIEMPRE el precio final neto que se cobra: con
 * oferta activa ya trae el descuento aplicado. La pasarela, la guía y la
 * comisión trabajan sobre ese valor y nunca sobre `original_price`.
 *
 * Las demás llaves de `extra` (columnas del CSV, imagen, categoría…) se
 * conservan tal cual: ver `fusionarExtra`.
 */

/** Valores que pueden vivir en `extra`. El CSV solo escribe strings. */
export type ExtraValor = string | number | boolean | null;
export type ExtraProducto = Record<string, ExtraValor>;

/** Comisión de YAM sobre el valor neto final cobrado al cliente. */
export const COMISION_YAM = 0.07;

/** Con 1..N unidades se muestra «¡Últimas unidades!». */
export const UMBRAL_ULTIMAS_UNIDADES = 3;

/** Tope de días hábiles de elaboración que acepta el formulario. */
export const MAX_DIAS_ELABORACION = 90;

/** Tope de descuento: más que esto casi siempre es un error de digitación. */
export const MAX_DESCUENTO = 90;

/** Tope de unidades por compra cuando el producto no lleva conteo. */
export const MAX_CANTIDAD_POR_COMPRA = 99;

/** Llaves de `extra` que gobierna este módulo (no se pintan como etiqueta suelta). */
export const LLAVES_INVENTARIO_OFERTA = [
  "is_made_to_order",
  "lead_time_days",
  "stock_quantity",
  "units_sold",
  "is_on_sale",
  "original_price",
  "discount_percent",
] as const;

export type ModoInventario = "stock" | "pedido";

export interface InventarioOferta {
  modo: ModoInventario;
  /** Solo en modo pedido. */
  diasElaboracion: number;
  /** `null` = sin conteo (no se agota ni muestra stock). */
  stock: number | null;
  vendidos: number;
  enOferta: boolean;
  precioOriginal: number;
  descuentoPct: number;
}

export interface Disponibilidad {
  agotado: boolean;
  ultimasUnidades: boolean;
  bajoPedido: boolean;
  /** Máximo que se deja elegir en el selector de cantidad. */
  maxCantidad: number;
}

// ── Lectura tolerante de `extra` ─────────────────────────────────────────
// `extra` viene de JSONB y del CSV: los números pueden llegar como "12",
// los booleanos como "true"/"si". Se normaliza aquí una sola vez.

function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function aEnteroNoNegativo(v: unknown): number | null {
  const n = aNumero(v);
  return n === null ? null : Math.max(0, Math.floor(n));
}

function aBooleano(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") return ["true", "1", "si", "sí", "yes"].includes(v.trim().toLowerCase());
  return false;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Redondea al peso: la pasarela cobra enteros. */
export function redondearPeso(valor: number): number {
  return Math.round(valor);
}

/** Precio final tras aplicar el porcentaje sobre el original. */
export function precioConDescuento(precioOriginal: number, descuentoPct: number): number {
  const pct = Math.min(Math.max(descuentoPct, 0), 100);
  return redondearPeso((precioOriginal * (100 - pct)) / 100);
}

/** Porcentaje entero equivalente entre un precio original y uno final. */
export function porcentajeEntre(precioOriginal: number, precioFinal: number): number {
  if (precioOriginal <= 0 || precioFinal >= precioOriginal) return 0;
  return Math.round(((precioOriginal - precioFinal) / precioOriginal) * 100);
}

/**
 * Lee las llaves de inventario y oferta de `extra`.
 * `precio` es la columna `price` (precio final neto).
 */
export function leerInventarioOferta(extra: unknown, precio: number): InventarioOferta {
  const e = esObjeto(extra) ? extra : {};
  const bajoPedido = aBooleano(e.is_made_to_order);
  const original = aNumero(e.original_price) ?? 0;
  const pctGuardado = aNumero(e.discount_percent) ?? 0;

  // Una oferta solo cuenta si de verdad rebaja: original por encima del
  // precio que se cobra. Si alguien editó el precio y dejó la marca puesta,
  // la vitrina no promete un descuento que no existe.
  const enOferta = aBooleano(e.is_on_sale) && original > precio && precio > 0;
  let descuentoPct = 0;
  if (enOferta) {
    descuentoPct = pctGuardado > 0 ? Math.round(pctGuardado) : porcentajeEntre(original, precio);
  }

  return {
    modo: bajoPedido ? "pedido" : "stock",
    diasElaboracion: bajoPedido ? Math.max(1, aEnteroNoNegativo(e.lead_time_days) ?? 1) : 0,
    stock: bajoPedido ? null : aEnteroNoNegativo(e.stock_quantity),
    vendidos: aEnteroNoNegativo(e.units_sold) ?? 0,
    enOferta,
    precioOriginal: enOferta ? original : precio,
    descuentoPct,
  };
}

export function disponibilidad(info: InventarioOferta): Disponibilidad {
  if (info.modo === "pedido") {
    return { agotado: false, ultimasUnidades: false, bajoPedido: true, maxCantidad: MAX_CANTIDAD_POR_COMPRA };
  }
  if (info.stock === null) {
    return { agotado: false, ultimasUnidades: false, bajoPedido: false, maxCantidad: MAX_CANTIDAD_POR_COMPRA };
  }
  return {
    agotado: info.stock <= 0,
    ultimasUnidades: info.stock >= 1 && info.stock <= UMBRAL_ULTIMAS_UNIDADES,
    bajoPedido: false,
    maxCantidad: Math.min(info.stock, MAX_CANTIDAD_POR_COMPRA),
  };
}

/** «Elaborado bajo pedido (Listo para envío en X días hábiles)». */
export function textoBajoPedido(dias: number): string {
  return `Elaborado bajo pedido (Listo para envío en ${dias} ${dias === 1 ? "día hábil" : "días hábiles"})`;
}

/**
 * Prueba social. Con pocas ventas se dice el número exacto; desde 10 se
 * redondea hacia abajo («Más de 50 vendidos») para no prometer de más.
 * Devuelve `null` si no hay ventas que contar.
 */
export function textoVendidos(vendidos: number): string | null {
  if (vendidos <= 0) return null;
  if (vendidos < 10) return `${vendidos} ${vendidos === 1 ? "vendido" : "vendidos"}`;
  const paso = vendidos >= 1000 ? 1000 : vendidos >= 100 ? 100 : 10;
  return `Más de ${Math.floor(vendidos / paso) * paso} vendidos`;
}

// ── Liquidación ──────────────────────────────────────────────────────────

export interface Liquidacion {
  /** Lo que paga el cliente (precio neto con descuento × cantidad). */
  total: number;
  /** 7 % de YAM sobre el total neto. */
  comisionYam: number;
  /** Lo que recibe el comercio. */
  netoComercio: number;
  /** Lo que el cliente se ahorra frente al precio tachado. */
  ahorro: number;
}

/**
 * Regla contable: la comisión de YAM se liquida sobre el valor neto FINAL
 * cobrado al cliente (ya con descuento), nunca sobre el precio tachado.
 */
export function liquidarVenta(
  precioUnitarioNeto: number,
  cantidad: number,
  precioUnitarioOriginal: number = precioUnitarioNeto
): Liquidacion {
  const qty = Math.max(1, Math.floor(cantidad));
  const total = redondearPeso(precioUnitarioNeto * qty);
  const comisionYam = redondearPeso(total * COMISION_YAM);
  const ahorro = Math.max(0, redondearPeso((precioUnitarioOriginal - precioUnitarioNeto) * qty));
  return { total, comisionYam, netoComercio: total - comisionYam, ahorro };
}

// ── Escritura ────────────────────────────────────────────────────────────

/**
 * Mezcla las llaves de inventario/oferta sobre el `extra` que ya tenía el
 * producto, sin perder lo demás (columnas del CSV, foto, categoría…).
 * Una llave con `undefined` se retira (p. ej. stock vacío = sin conteo).
 */
export function fusionarExtra(
  previo: unknown,
  cambios: Partial<Record<(typeof LLAVES_INVENTARIO_OFERTA)[number], ExtraValor | undefined>>
): ExtraProducto {
  const base: ExtraProducto = {};
  if (esObjeto(previo)) {
    for (const [k, v] of Object.entries(previo)) {
      if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
        base[k] = v as ExtraValor;
      } else {
        // Un objeto anidado no se pierde: se guarda serializado.
        base[k] = JSON.stringify(v);
      }
    }
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

/** ¿La llave la administra este módulo? (para no pintarla como etiqueta suelta). */
export function esLlaveInventarioOferta(llave: string): boolean {
  return (LLAVES_INVENTARIO_OFERTA as readonly string[]).includes(llave);
}
