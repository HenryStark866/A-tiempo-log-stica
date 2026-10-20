"use client";

import Link from "next/link";
import { Search, LogIn, Store, X, PackageSearch } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavbarStorefrontProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenRastreo?: () => void;
}

export function NavbarStorefront({
  searchQuery,
  onSearchChange,
  onOpenRastreo,
}: NavbarStorefrontProps) {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-[#121214]/85 backdrop-blur-xl border-b border-slate-200/70 dark:border-white/10 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3 sm:gap-6">
          
          {/* Logo YAM */}
          <Link
            href="/"
            className="flex items-center gap-2 group shrink-0 focus:outline-none"
            aria-label="Ir a la portada de YAM"
          >
            <Logo
              variant="horizontal"
              className="scale-95 sm:scale-100 transition-transform group-hover:opacity-90"
            />
          </Link>

          {/* Barra de búsqueda interactiva */}
          <div className="flex-1 max-w-lg hidden md:block">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar productos o comercios locales..."
                className="w-full pl-10 pr-9 py-2 text-sm bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-full text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50 focus:border-[#ff812c] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Acciones del Navbar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Alternador de tema */}
            <ThemeToggle />

            {/* Botón secundario: Iniciar sesión (para compradores registrados) */}
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-white/5 active:scale-[0.98] transition-all"
              title="Para compradores que ya tienen cuenta en YAM"
            >
              <LogIn className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">Iniciar sesión</span>
              <span className="sm:hidden">Entrar</span>
            </Link>

            {/* Botón destacado: Portal Comercios (para tiendas y administradores) */}
            <Link
              href="/portal-comercios"
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[#ff812c] text-[#1C1C1E] shadow-sm hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform duration-150"
              title="Acceso exclusivo para tiendas, aliados y equipo de operaciones"
            >
              <Store className="h-4 w-4 shrink-0 text-[#1C1C1E]" />
              <span className="whitespace-nowrap">Portal Comercios</span>
            </Link>
          </div>
        </div>

        {/* Barra de búsqueda móvil */}
        <div className="pb-3 md:hidden">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar productos o tiendas..."
              className="w-full pl-10 pr-9 py-2 text-sm bg-slate-100/90 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
