"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  MapPinned,
  PackageSearch,
  Search,
  Warehouse,
  Truck,
  Receipt
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FondoInicio } from "@/components/fondos/FondoInicio";

const PILLARS = [
  {
    icon: Warehouse,
    title: "Recogida y CEDI",
    text: "Digitalización desde el origen con validación en tiempo real y zonificación inteligente en bodega.",
  },
  {
    icon: Truck,
    title: "Última milla y recaudo",
    text: "Enrutamiento inteligente con máquina de estados y conciliación inmediata de pagos contraentrega.",
  },
  {
    icon: Receipt,
    title: "Control y facturación",
    text: "Logística inversa sin fricciones y ciclos de facturación automatizados basados en entregas reales.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [guide, setGuide] = useState("");

  function track(e: React.FormEvent) {
    e.preventDefault();
    if (guide.trim()) router.push(`/rastreo/${encodeURIComponent(guide.trim())}`);
  }

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 pb-16 transition-colors duration-300">
      <FondoInicio />

      {/* Top Nav Bar */}
      <nav className="sticky top-0 z-50 flex items-center justify-end px-6 py-3 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 transition-colors duration-300">
        <ThemeToggle />
      </nav>

      {/* Welcoming Header — translúcido para que la red de rutas se vea correr
          por detrás sin restarle contraste al logo. */}
      <header className="atl-encima px-6 py-10 flex flex-col items-center text-center bg-white/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl shadow-sm rounded-b-[32px] mb-10 transition-colors duration-300">
        <Logo variant="vertical" className="mb-2 scale-110" />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Bienvenido a ATL</h1>
        <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Tu paquete a tiempo y con trazabilidad de punta a punta.
        </p>
      </header>

      <main className="atl-encima max-w-5xl mx-auto px-6 space-y-12">

        {/* Tracking Section (Centered) */}
        <div className="max-w-md mx-auto">
          <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] p-6 rounded-3xl shadow-sm transition-colors duration-300">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white mb-4">Rastrear Envío</h2>
            <form onSubmit={track} className="flex flex-col gap-4">
              <div className="flex items-center px-4 min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus-within:border-[#ff812c] focus-within:ring-1 focus-within:ring-[#ff812c] rounded-2xl transition-all">
                <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
                <input
                  value={guide}
                  onChange={(e) => setGuide(e.target.value)}
                  placeholder="Ej. ATL-100008"
                  className="flex-1 bg-transparent text-[16px] font-medium focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 hover:scale-[1.01] active:scale-[0.98] transition-all text-[#1C1C1E] font-bold rounded-2xl min-h-[52px] shadow-sm"
              >
                <span className="text-[16px]">Rastrear Paquete</span>
                <ArrowRight className="w-5 h-5 text-[#1C1C1E]" />
              </button>
            </form>
          </section>
        </div>

        {/* Profiles Section (Grid) */}
        <section>
          <h2 className="text-[14px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center mb-6">Accesos a la Plataforma</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cliente */}
            <Link href="/login?role=cliente" className="group flex items-center p-4 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[88px] border border-transparent dark:border-gray-800">
              <div className="w-12 h-12 rounded-2xl bg-[#ff812c]/10 dark:bg-[#ff812c]/20 flex items-center justify-center mr-4 shrink-0 transition-colors">
                <PackageSearch className="w-6 h-6 text-[#ff812c]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white group-hover:text-[#ff812c] transition-colors">Cliente</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">Solicita y gestiona envíos</p>
              </div>
            </Link>

            {/* Conductor */}
            <Link href="/login?role=conductor" className="group flex items-center p-4 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[88px] border border-transparent dark:border-gray-800">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mr-4 shrink-0 transition-colors">
                <MapPinned className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">Conductor</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">Rutas de entrega y recaudo</p>
              </div>
            </Link>

            {/* Administrador */}
            <Link href="/login?role=admin" className="group flex items-center p-4 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[88px] border border-transparent dark:border-gray-800">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mr-4 shrink-0 transition-colors">
                <Warehouse className="w-6 h-6 text-purple-500 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">Administrador</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium leading-tight mt-0.5">Control total del CEDI</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Pillars / Features Section */}
        <section className="pt-8 border-t border-gray-200 dark:border-gray-800">
          <h2 className="text-[14px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center mb-8">Nuestros Pilares Operativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PILLARS.map((p, idx) => (
              <div key={idx} className="bg-[#FFFFFF] dark:bg-[#2C2C2E] p-6 rounded-3xl shadow-sm border border-transparent dark:border-gray-800 flex flex-col items-start transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                <div className="w-12 h-12 rounded-2xl bg-[#ff812c]/10 dark:bg-[#ff812c]/20 flex items-center justify-center mb-5 shrink-0 transition-colors">
                  <p.icon className="w-6 h-6 text-[#ff812c]" />
                </div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white mb-2 leading-tight">
                  {p.title}
                </h3>
                <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
            © 2026 A Tiempo Logística · Medellín, Colombia
          </p>
        </footer>

      </main>
    </div>
  );
}
