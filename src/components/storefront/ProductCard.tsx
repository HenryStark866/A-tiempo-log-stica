"use client";

import { Store, Eye, ShoppingCart } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import type { MockProduct } from "@/data/mockProducts";

export interface ProductCardProps {
  product: MockProduct;
  onViewDetail: (product: MockProduct) => void;
  onQuickBuy: (product: MockProduct) => void;
}

export function ProductCard({
  product,
  onViewDetail,
  onQuickBuy,
}: ProductCardProps) {
  return (
    <article className="group flex flex-col justify-between rounded-3xl bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-sm hover:shadow-xl hover:border-[#ff812c]/40 transition-all duration-300">
      {/* Zona de Imagen del Producto (Clic abre vista detallada) */}
      <div
        onClick={() => onViewDetail(product)}
        className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-black/30 cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onViewDetail(product);
          }
        }}
        aria-label={`Ver detalles de ${product.name}`}
      >
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
        />

        {/* Insignia de tienda / comercio verificado */}
        {product.store_badge && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#1C1C1E]/85 text-[#ff812c] backdrop-blur-md border border-white/10 shadow-sm">
            {product.store_badge}
          </span>
        )}

        {/* Categoría del producto */}
        <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-white/90 dark:bg-[#1C1C1E]/90 text-slate-700 dark:text-slate-300 backdrop-blur-md shadow-sm">
          {product.category}
        </span>

        {/* Botón flotante accesible de Compra Rápida en la esquina superior derecha */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickBuy(product);
          }}
          title="Compra rápida directa"
          aria-label={`Comprar ${product.name} directamente`}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#1C1C1E]/80 dark:bg-[#1C1C1E]/90 text-[#ff812c] hover:bg-[#ff812c] hover:text-[#1C1C1E] backdrop-blur-md border border-white/10 shadow-md flex items-center justify-center transition-all duration-200 active:scale-95 group/float"
        >
          <ShoppingCart className="w-4 h-4 transition-transform group-hover/float:scale-110" />
        </button>
      </div>

      {/* Detalles y Metadatos */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-1.5">
          {/* Nombre del comercio */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#ff812c]">
            <Store className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{product.store_name}</span>
          </div>

          {/* Título del producto (Clic abre vista detallada) */}
          <h2
            onClick={() => onViewDetail(product)}
            className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug group-hover:text-[#ff812c] transition-colors cursor-pointer"
          >
            {product.name}
          </h2>

          {/* Descripción breve */}
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-white/10 space-y-3">
          {/* Precio en COP */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">Precio</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {formatCOP(product.price)}
            </span>
          </div>

          {/* Leyenda obligatoria de coordinación directa */}
          <p className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.03] p-2 rounded-xl text-center font-medium border border-slate-100 dark:border-white/5">
            Entrega o retiro coordinado directamente con{" "}
            <span className="font-bold text-slate-800 dark:text-white">
              {product.store_name}
            </span>
          </p>

          {/* Acciones desacopladas: Ver Detalle vs. Compra Rápida (Carrito 🛒) */}
          <div className="flex items-center gap-2 pt-1">
            {/* a) Botón principal: Ver detalle */}
            <button
              type="button"
              onClick={() => onViewDetail(product)}
              className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-white text-xs sm:text-sm font-bold border border-slate-200/80 dark:border-white/10 active:scale-[0.98] transition-all"
            >
              <Eye className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              <span>Ver detalle</span>
            </button>

            {/* b) Botón iconográfico de Carrito / Compra Rápida (🛒) */}
            <button
              type="button"
              onClick={() => onQuickBuy(product)}
              title="Compra rápida"
              aria-label={`Comprar ${product.name} directamente`}
              className="shrink-0 w-[46px] h-[46px] inline-flex items-center justify-center rounded-xl bg-[#ff812c] text-[#1C1C1E] hover:bg-[#ff812c]/90 active:scale-[0.96] shadow-sm font-black transition-all group/cart"
            >
              <ShoppingCart className="w-5 h-5 text-[#1C1C1E] group-hover/cart:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
