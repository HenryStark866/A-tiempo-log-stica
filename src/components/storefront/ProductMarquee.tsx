"use client";

import { Sparkles, ArrowRight } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import type { MockProduct } from "@/data/mockProducts";

interface ProductMarqueeProps {
  products: MockProduct[];
  onSelectProduct: (product: MockProduct) => void;
}

export function ProductMarquee({ products, onSelectProduct }: ProductMarqueeProps) {
  if (!products || products.length === 0) return null;

  // Duplicar elementos para que el scroll continuo sea infinito y fluido sin cortes
  const items = [...products, ...products];

  return (
    <section className="w-full overflow-hidden py-4 select-none" aria-label="Productos destacados">
      {/* Encabezado discreto del ticker */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-[#ff812c] animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Destacados del comercio local
          </h2>
        </div>
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          Pasa el cursor para pausar
        </span>
      </div>

      {/* Contenedor del desplazamiento continuo con máscaras de gradiente lateral */}
      <div className="relative w-full overflow-hidden">
        {/* Máscara de desvanecimiento izquierda */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-r from-[rgb(var(--atl-suelo))] to-transparent z-10" />

        {/* Fila animada con CSS marquee */}
        <div className="animate-marquee flex gap-3 sm:gap-4 py-1">
          {items.map((prod, index) => (
            <button
              key={`${prod.id}-marquee-${index}`}
              type="button"
              onClick={() => onSelectProduct(prod)}
              className="w-64 sm:w-72 shrink-0 p-2.5 sm:p-3 rounded-2xl bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-md border border-slate-200/80 dark:border-white/10 flex items-center gap-3 text-left hover:border-[#ff812c] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all group focus:outline-none focus:ring-2 focus:ring-[#ff812c]/40"
              title={`Ver ${prod.name} de ${prod.store_name}`}
            >
              {/* Foto compacta */}
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-black/30 shrink-0">
                <img
                  src={prod.image_url}
                  alt={prod.name}
                  loading="lazy"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Textos del producto */}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[10px] font-bold text-[#ff812c] truncate uppercase tracking-wider">
                  {prod.store_name}
                </p>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[#ff812c] transition-colors">
                  {prod.name}
                </h3>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                    {formatCOP(prod.price)}
                  </span>
                  <span className="inline-flex items-center text-[10px] font-bold text-[#ff812c] opacity-0 group-hover:opacity-100 transition-opacity">
                    Comprar <ArrowRight className="w-3 h-3 ml-0.5" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Máscara de desvanecimiento derecha */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-l from-[rgb(var(--atl-suelo))] to-transparent z-10" />
      </div>
    </section>
  );
}
