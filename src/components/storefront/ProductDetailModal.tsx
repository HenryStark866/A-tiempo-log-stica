"use client";

import { useEffect, useState } from "react";
import {
  X,
  Store,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Plus,
  Minus,
  Sparkles,
  Truck,
} from "lucide-react";
import { formatCOP } from "@/lib/utils";
import type { MockProduct } from "@/data/mockProducts";

export interface ProductDetailModalProps {
  product: MockProduct | null;
  onClose: () => void;
  onBuyNow: (product: MockProduct, quantity: number) => void;
}

export function ProductDetailModal({
  product,
  onClose,
  onBuyNow,
}: ProductDetailModalProps) {
  const [quantity, setQuantity] = useState(1);

  // Reiniciar cantidad cada vez que cambia el producto
  useEffect(() => {
    setQuantity(1);
  }, [product]);

  // Cerrar modal al presionar tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!product) return null;

  const subtotal = product.price * quantity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden my-6 transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón flotante para cerrar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-md border border-slate-200/60 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Cerrar detalle"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Estructura responsiva a 2 columnas */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Columna Izquierda: Imagen principal de alta calidad e insignias */}
          <div className="relative bg-slate-100 dark:bg-black/40 flex flex-col justify-between p-4 sm:p-6 border-b md:border-b-0 md:border-r border-slate-200/60 dark:border-white/10">
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-200 dark:bg-black/30 shadow-inner group">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />
              {product.store_badge && (
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold bg-[#1C1C1E]/90 text-[#ff812c] backdrop-blur-md border border-white/10 shadow-sm flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#ff812c]" />
                  <span>{product.store_badge}</span>
                </span>
              )}
              <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 dark:bg-[#1C1C1E]/90 text-slate-700 dark:text-slate-300 backdrop-blur-md shadow-sm">
                {product.category}
              </span>
            </div>

            {/* Metadatos complementarios al pie de la foto */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#ff812c] shrink-0" />
                <span className="truncate">{product.store_location}</span>
              </div>
              <span className="font-mono text-[11px] bg-slate-200/70 dark:bg-white/5 px-2 py-0.5 rounded">
                SKU: {product.sku}
              </span>
            </div>
          </div>

          {/* Columna Derecha: Información detallada, precio, selector y acciones */}
          <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Marca y categoría */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ff812c] uppercase tracking-wider">
                  <Store className="w-4 h-4 shrink-0" />
                  <span>{product.store_name}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  {product.name}
                </h2>
              </div>

              {/* Precio destacado */}
              <div className="py-2 border-y border-slate-100 dark:border-white/10 flex items-baseline justify-between">
                <span className="text-xs text-slate-400 font-medium">Precio unitario</span>
                <span className="text-2xl sm:text-3xl font-black text-[#ff812c]">
                  {formatCOP(product.price)}
                </span>
              </div>

              {/* Descripción completa */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Descripción
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>

              {/* Nota de coordinación y despacho directo */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-[#ff812c]/10 border border-amber-500/20 dark:border-[#ff812c]/20 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[#ff812c]">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span>Despacho o retiro coordinado con la tienda</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                  Este producto se despacha desde <strong className="text-slate-900 dark:text-white">{product.store_location}</strong>. Tu pago está 100% asegurado en plataforma; tras la compra, podrás coordinar el retiro gratuito en punto físico o envío a convenir directamente con la marca.
                </p>
              </div>

              {/* Selector de cantidad */}
              <div className="pt-2 flex items-center justify-between gap-4">
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Cantidad:
                </span>

                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.04] p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Disminuir cantidad"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center font-bold text-sm text-slate-900 dark:text-white">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                      disabled={quantity >= 99}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Aumentar cantidad"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {quantity > 1 && (
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      = {formatCOP(subtotal)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Acción principal: Todo el tráfico enfocado a la compra en plataforma */}
            <div className="pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => onBuyNow(product, quantity)}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-sm font-bold shadow-md hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all"
              >
                <ShoppingBag className="w-4 h-4 text-[#1C1C1E]" />
                <span>Comprar ahora {quantity > 1 ? `(${formatCOP(subtotal)})` : ""}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
