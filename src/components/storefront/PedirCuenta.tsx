"use client";

import Link from "next/link";
import { UserPlus, LogIn, X } from "lucide-react";

interface PedirCuentaProps {
  productName: string;
  onClose: () => void;
}

/**
 * Se muestra cuando alguien sin sesión intenta comprar. La vitrina se ve sin
 * cuenta; comprar sí la exige, para que el pedido quede a nombre de alguien
 * y se pueda rastrear y cobrar.
 */
export function PedirCuenta({ productName, onClose }: PedirCuentaProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pedir-cuenta-titulo"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-white/10 p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="pedir-cuenta-titulo" className="text-lg font-black text-slate-900 dark:text-white">
            Crea tu cuenta para comprar
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Para pedir <strong className="text-slate-900 dark:text-white">{productName}</strong> necesitas
          una cuenta en YAM. Así tu pedido queda a tu nombre y puedes seguirlo hasta tu puerta.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Link
            href="/registro"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-sm font-bold hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all"
          >
            <UserPlus className="h-4 w-4" />
            Crear cuenta
          </Link>
          <Link
            href="/login?next=/"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-white/15 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 transition-all"
          >
            <LogIn className="h-4 w-4" />
            Ya tengo cuenta: ingresar
          </Link>
        </div>
      </div>
    </div>
  );
}
