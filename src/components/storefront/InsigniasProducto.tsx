"use client";

import type { SyntheticEvent } from "react";
import { Flame, PackageX, TrendingUp } from "lucide-react";
import { cn, formatCOP } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import {
  disponibilidad,
  leerInventarioOferta,
  textoBajoPedido,
  textoVendidos,
  type Disponibilidad,
  type InventarioOferta,
} from "@/lib/inventario";
import { IMAGEN_SIN_FOTO } from "@/lib/vitrina";
import type { MockProduct } from "@/data/mockProducts";

export interface InfoProductoVitrina {
  info: InventarioOferta;
  disp: Disponibilidad;
}

/** Inventario, oferta y disponibilidad de un producto de la vitrina. */
export function infoProductoVitrina(product: MockProduct): InfoProductoVitrina {
  // Con el interruptor apagado se lee un `extra` vacío: precio único, sin
  // insignias y sin tope de stock (exactamente como estaba la vitrina).
  const info = leerInventarioOferta(FEATURES.VITRINA_INVENTARIO_Y_OFERTAS ? product.extra : {}, product.price);
  return { info, disp: disponibilidad(info) };
}

/** Si la foto no carga (host retirado, CSP), se cambia por la imagen neutra. */
export function alFallarImagen(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(IMAGEN_SIN_FOTO)) img.src = IMAGEN_SIN_FOTO;
}

/** Insignia flotante sobre la foto: «-15% OFF» o «OFERTA». */
export function InsigniaOferta({ info, className }: { info: InventarioOferta; className?: string }) {
  if (!info.enOferta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide",
        "bg-gradient-to-r from-rose-500 to-[#ff812c] text-white shadow-lg shadow-rose-500/30 ring-1 ring-white/30",
        className
      )}
    >
      <Flame className="w-3 h-3" />
      {info.descuentoPct > 0 ? `-${info.descuentoPct}% OFF` : "OFERTA"}
    </span>
  );
}

/** Precio actual destacado y, si hay oferta, el anterior tachado en gris. */
export function PrecioProducto({
  product,
  info,
  tamano = "tarjeta",
}: {
  product: MockProduct;
  info: InventarioOferta;
  tamano?: "tarjeta" | "modal" | "mini";
}) {
  const clasesActual = {
    tarjeta: "text-xl font-black",
    modal: "text-2xl sm:text-3xl font-black",
    mini: "text-xs font-black",
  }[tamano];
  const clasesTachado = {
    tarjeta: "text-xs",
    modal: "text-sm",
    mini: "text-[10px]",
  }[tamano];

  return (
    <span className="inline-flex items-baseline gap-2 flex-wrap justify-end">
      {info.enOferta && (
        <s className={cn("text-slate-400 dark:text-slate-500 font-medium tabular-nums", clasesTachado)}>
          {formatCOP(info.precioOriginal)}
        </s>
      )}
      <span
        className={cn(
          "tabular-nums",
          clasesActual,
          info.enOferta
            ? "text-rose-600 dark:text-rose-400"
            : tamano === "modal"
            ? "text-[#ff812c]"
            : "text-slate-900 dark:text-white"
        )}
      >
        {formatCOP(product.price)}
      </span>
    </span>
  );
}

/** Insignias de inventario: Agotado, ¡Últimas unidades!, Bajo pedido y vendidos. */
export function InsigniasInventario({
  info,
  disp,
  compacto = false,
}: {
  info: InventarioOferta;
  disp: Disponibilidad;
  compacto?: boolean;
}) {
  const vendidos = textoVendidos(info.vendidos);
  if (!disp.agotado && !disp.ultimasUnidades && !disp.bajoPedido && !vendidos) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {disp.agotado && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-900/90 text-white dark:bg-white/15">
          <PackageX className="w-3 h-3" /> Agotado
        </span>
      )}
      {disp.ultimasUnidades && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
          ¡Últimas unidades!
        </span>
      )}
      {disp.bajoPedido && (
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold",
            "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25"
          )}
        >
          <span>
            🕒{" "}
            {compacto
              ? `Bajo pedido · ${info.diasElaboracion} ${info.diasElaboracion === 1 ? "día hábil" : "días hábiles"}`
              : textoBajoPedido(info.diasElaboracion)}
          </span>
        </span>
      )}
      {vendidos && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
          <TrendingUp className="w-3 h-3" /> {vendidos}
        </span>
      )}
    </div>
  );
}
