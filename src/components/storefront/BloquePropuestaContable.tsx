import Link from "next/link";
import { Calculator, Zap, RefreshCw, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

interface BloquePropuestaContableProps {
  mostrarBotones?: boolean;
}

export function BloquePropuestaContable({ mostrarBotones = true }: BloquePropuestaContableProps) {
  return (
    <section className="text-center space-y-10">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
          <span>✦ Finanzas Claras y Sin Estrés</span>
        </div>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Dile adiós a los cuadres manuales y las hojas de cálculo
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
          Automatizamos la conciliación contable de cada venta para que te concentres únicamente en hacer crecer tu marca.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {/* Tarjeta 1: Conciliación automática */}
        <article className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-white/[0.03] backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-sm hover:border-[#ff812c]/40 hover:shadow-md transition-all duration-300 group flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#ff812c]/10 dark:bg-[#ff812c]/15 text-[#ff812c] flex items-center justify-center mb-5 border border-[#ff812c]/20 group-hover:scale-105 transition-transform duration-300">
              <Calculator className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#ff812c] bg-[#ff812c]/10 px-2 py-0.5 rounded-md">
                Ledger inmutable
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-[#ff812c] transition-colors">
              Conciliación financiera en tiempo real
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Cada pedido, comisión y cobro queda registrado y cuadrado automáticamente. Conoce al instante el estado exacto de tu dinero sin tener que conciliar facturas ni armar balances manuales a fin de mes.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>0 descuadres a fin de mes</span>
          </div>
        </article>

        {/* Tarjeta 2: Liquidez y flujo de caja */}
        <article className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-white/[0.03] backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-sm hover:border-[#ff812c]/40 hover:shadow-md transition-all duration-300 group flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-5 border border-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
              <Zap className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                Garantía &lt; 24h
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-emerald-500 transition-colors">
              Recaudos liquidados en máximo 24 horas
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              No financies tu operación esperando cortes quincenales. Los pagos en efectivo y digitales recaudados por tus ventas se transfieren directo a tu cuenta bancaria en menos de 24 horas garantizadas.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Dispersión bancaria garantizada</span>
          </div>
        </article>

        {/* Tarjeta 3: Control de balance y catálogo */}
        <article className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-white/[0.03] backdrop-blur-md border border-slate-200/80 dark:border-white/10 shadow-sm hover:border-[#ff812c]/40 hover:shadow-md transition-all duration-300 group flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 text-blue-500 flex items-center justify-center mb-5 border border-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                Shopify & Nativo
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-500 transition-colors">
              Control transparente y sincronizado
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Monitorea tus saldos disponibles para retiro desde un panel intuitivo y mantén tu inventario sincronizado desde Shopify o tu catálogo directo sin duplicar trabajo administrativo.
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Catálogo unificado sin doble carga</span>
          </div>
        </article>
      </div>

      {mostrarBotones && (
        <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#ff812c] text-[#1C1C1E] text-sm font-bold shadow-md hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all"
          >
            <span>Crear cuenta de comercio</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login?portal=comercios"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/15 text-white text-sm font-semibold border border-slate-800 dark:border-white/20 transition-all"
          >
            <span>Ingresar al Portal Comercios</span>
          </Link>
        </div>
      )}
    </section>
  );
}
