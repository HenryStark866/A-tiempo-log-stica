"use client";

import { LoaderCircle, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS PIEZAS COMUNES
 *
 * Once pantallas se dibujan con esto: Pedidos, Recogidas, Recaudo, CEDI,
 * Mensajeros, Sedes, Códigos, Mapa, Seguridad, Mi perfil y el detalle del
 * pedido. Cambiar algo aquí las cambia todas a la vez, que es justamente para
 * lo que existen.
 *
 * Nacieron cuando la app era clara y se quedaron ahí: tarjeta blanca, título
 * navy, modal blanco. Al llegar el tema oscuro —que es el que usa casi todo el
 * mundo— esas once pantallas quedaron con tarjetas blancas encima del fondo
 * oscuro y títulos azul marino sobre negro, ilegibles. No era un detalle de
 * gusto: había texto que no se podía leer.
 *
 * ── El lenguaje visual ──────────────────────────────────────────────────
 * · Superficie de vidrio: translúcida y desenfocada, para que el fondo de la
 *   app (el valle de Medellín) se insinúe debajo sin estorbar la lectura.
 * · Borde de un pelo, más claro que la superficie en oscuro y más oscuro en
 *   claro: define el borde sin dibujar una caja.
 * · Naranja de marca solo donde hay que actuar o mirar. Si todo brilla, nada
 *   resalta.
 * · Radios generosos y números tabulares: las cifras de una tabla tienen que
 *   quedar alineadas en columna aunque cambien.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** La superficie base. Se reutiliza para que todo lo elevado se vea igual. */
export const superficie =
  "border border-slate-900/[0.06] atl-superficie " +
  "dark:border-white/[0.08]";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] sm:text-[30px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[15px] leading-snug text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("rounded-3xl shadow-sm", superficie, className)}>{children}</div>;
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
      <LoaderCircle className="size-7 animate-spin text-[#ff812c]" />
      <p className="text-[15px]">{label}</p>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="py-14 text-center text-slate-400 dark:text-slate-500">
      <SearchX className="mx-auto mb-3 size-9" />
      <p className="mx-auto max-w-[38ch] text-[15px] leading-snug">{label}</p>
    </div>
  );
}

/**
 * «Esta pantalla llegó filtrada desde otra».
 *
 * Las tarjetas de Mi panel abren cada sección con el filtro puesto en la URL.
 * Sin este aviso la tabla parece incompleta y no hay manera de saber por qué
 * faltan filas: la ✕ devuelve la vista entera y limpia la dirección.
 */
export function FiltroActivo({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#ff812c]/10 py-1.5 pl-3.5 pr-1.5 text-[13px] font-semibold text-[#ff812c] ring-1 ring-inset ring-[#ff812c]/20">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Quitar el filtro «${label}»`}
        className="grid size-6 place-items-center rounded-full transition-colors hover:bg-[#ff812c]/20 active:scale-95"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  // El primario es el naranja de marca con texto oscuro, igual que los botones
  // escritos a mano en el resto de la app. Antes era `brand-500` con texto
  // blanco: parecido de lejos, distinto al lado, y se notaba en las pantallas
  // que mezclan los dos.
  const variants = {
    primary:
      "bg-[#ff812c] text-[#1C1C1E] font-bold hover:bg-[#ff812c]/90 shadow-sm shadow-[#ff812c]/20 disabled:opacity-50",
    secondary:
      "border border-slate-900/[0.08] atl-relleno atl-relleno-hover text-slate-700 " +
      "dark:border-white/[0.10] dark:text-slate-200 disabled:opacity-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:opacity-50",
    ghost:
      "text-slate-600 hover:bg-slate-900/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.08] disabled:opacity-50",
  };
  return (
    <button
      className={cn(
        // 44 px de alto mínimo: es lo que se puede tocar con el dedo en la
        // calle, que es donde se usa esta app.
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold",
        "transition-all active:scale-[0.98] disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "w-full min-h-[44px] rounded-xl border border-slate-900/[0.10] atl-relleno px-3.5 text-sm text-slate-900 outline-none transition " +
  "placeholder:text-slate-400 focus:border-[#ff812c] focus:ring-2 focus:ring-[#ff812c]/25 " +
  "dark:border-white/[0.10] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    // En el teléfono sube desde abajo y se pega al borde inferior, que es donde
    // está el pulgar; en escritorio se centra.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl",
          "border-slate-900/[0.06] atl-superficie ",
          "dark:border-white/[0.08] border"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-900/[0.06] px-5 py-4 dark:border-white/[0.08]">
          <h2 className="min-w-0 truncate text-[17px] font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900/[0.06] text-slate-500 transition-colors hover:bg-slate-900/[0.12] dark:bg-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.16]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
