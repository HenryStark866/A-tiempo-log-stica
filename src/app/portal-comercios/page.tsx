import Link from "next/link";
import { Store, ArrowRight, ShieldCheck, ShoppingBag, ArrowLeft, Layers, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FondoInicio } from "@/components/fondos/FondoInicio";
import { PieMarca } from "@/components/PieMarca";
import { BloquePropuestaContable } from "@/components/storefront/BloquePropuestaContable";
import { MARCA } from "@/lib/marca";

export const metadata = {
  title: "Portal Comercios — Vende y liquida en 24h con YAM",
  description: "Crea o migra tu tienda e-commerce a YAM. Conciliación contable automática, conexión con Shopify y recaudos liquidados en tu cuenta bancaria en menos de 24 horas.",
};

export default function PortalComerciosPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-[#ff812c]/20 bg-slate-50 dark:bg-[#121214] text-slate-900 dark:text-white transition-colors duration-300">
      <FondoInicio />

      {/* Navegación Superior del Portal */}
      <header className="atl-encima border-b border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Logo />
            </Link>
            <span className="hidden sm:inline-block text-xs font-bold px-2.5 py-1 rounded-md bg-[#ff812c]/10 text-[#ff812c] border border-[#ff812c]/20">
              Portal Comercios
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Vitrina pública</span>
            </Link>
            <Link
              href="/login?portal=comercios"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#ff812c] text-[#1C1C1E] hover:bg-[#ff812c]/90 active:scale-95 transition-all shadow-sm"
            >
              <span>Ingresar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="atl-encima max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-16">
        
        {/* Banner Hero del Portal de Comercios */}
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-[#1C1C1E] to-black text-white p-8 sm:p-14 border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#ff812c]/20 text-[#ff812c] border border-[#ff812c]/30">
              <Store className="w-4 h-4 text-[#ff812c]" />
              <span>Para Emprendedores y Comercios de Antioquia</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Crea o migra tu e-commerce con {MARCA.app}
            </h1>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Trae tus productos a YAM, el stock e-commerce del Valle de Aburrá y el Oriente antioqueño.
              Crea tu tienda directamente o intégrala con pocos clics trayéndola desde Shopify. Centraliza
              tus ventas y recibe la liquidación de tus recaudos en menos de 24 horas garantizadas.
            </p>

            <div className="pt-3 flex flex-wrap gap-4">
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-sm sm:text-base font-bold hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all shadow-lg"
              >
                <span>Crear cuenta de comercio</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login?portal=comercios"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm sm:text-base font-semibold border border-white/20 transition-all"
              >
                <span>Ingresar al Portal Comercios</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Bloque Detallado de Propuesta de Valor Contable y Financiera */}
        <BloquePropuestaContable mostrarBotones={false} />

        {/* Resumen de Pasos para Comenzar */}
        <section className="rounded-3xl p-8 sm:p-10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-md border border-slate-200/80 dark:border-white/10 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">
              ¿Cómo funciona comenzar a vender en {MARCA.app}?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Tres pasos sencillos para vender con respaldo logístico y financiero total.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/10 space-y-3">
              <span className="w-8 h-8 rounded-full bg-[#ff812c]/10 text-[#ff812c] font-black flex items-center justify-center text-sm">
                1
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Registra tu marca
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Crea tu cuenta de comercio en 2 minutos con el nombre de tu marca, teléfono y datos de contacto.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/10 space-y-3">
              <span className="w-8 h-8 rounded-full bg-[#ff812c]/10 text-[#ff812c] font-black flex items-center justify-center text-sm">
                2
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Publica o sincroniza
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Sube tu catálogo directamente o vincúlalo desde tu tienda de Shopify sin duplicar productos ni fotos.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/10 space-y-3">
              <span className="w-8 h-8 rounded-full bg-[#ff812c]/10 text-[#ff812c] font-black flex items-center justify-center text-sm">
                3
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Vende y recibe en 24h
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Llega a miles de compradores en el Valle de Aburrá y el Oriente. Recibe tu dinero liquidado y conciliado en menos de 24h.
              </p>
            </div>
          </div>

          <div className="text-center pt-4">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-base font-bold shadow-md hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all"
            >
              <span>Comenzar ahora como Comercio</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

      </main>

      <footer className="mt-16">
        <PieMarca />
      </footer>
    </div>
  );
}
