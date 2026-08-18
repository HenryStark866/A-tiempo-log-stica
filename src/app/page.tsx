"use client";

import Link from "next/link";
import {
  History,
  LogIn,
  Warehouse,
  Truck,
  Receipt
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BuscadorGuia } from "@/components/BuscadorGuia";
import { FondoInicio } from "@/components/fondos/FondoInicio";
import { PieMarca } from "@/components/PieMarca";
import { InstalarApp } from "@/components/InstalarApp";
import { MARCA } from "@/lib/marca";

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
  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 pb-16 transition-colors duration-300">
      <FondoInicio />

      {/* Quien acaba de confirmar su correo aterriza aquí (ver
          /auth/confirmar): esta es la única pantalla pública donde de verdad
          se puede instalar la app, así que el banner vive aquí y no solo
          dentro de la plataforma. */}
      <InstalarApp enPagina />

      {/* Top Nav Bar */}
      <nav className="sticky top-0 z-50 flex items-center justify-end px-6 py-3 bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 transition-colors duration-300">
        <ThemeToggle />
      </nav>

      {/* Welcoming Header — translúcido para que la red de rutas se vea correr
          por detrás sin restarle contraste al logo. */}
      <header className="atl-encima px-6 py-10 flex flex-col items-center text-center bg-white/10 dark:bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-sm rounded-b-[32px] mb-10 transition-colors duration-300">
        <Logo variant="vertical" conFirma className="mb-2 scale-110" />
        <h1 className="mt-6 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Bienvenido a {MARCA.app}
        </h1>
        <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Tu paquete a tiempo y con trazabilidad de punta a punta.
        </p>
      </header>

      <main className="atl-encima max-w-5xl mx-auto px-6 space-y-12">

        {/* Tracking Section (Centered) */}
        <div className="max-w-md mx-auto">
          <section className="bg-white/15 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-3xl shadow-sm transition-colors duration-300">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white mb-1">
              Rastrear envío
            </h2>
            <p className="mb-4 text-[14px] text-slate-500 dark:text-slate-400">
              Con tu número de pedido. No necesitas cuenta.
            </p>
            <BuscadorGuia />
          </section>
        </div>

        {/* Acceso a la plataforma
            Antes eran tres tarjetas —Cliente, Conductor, Administrador— que
            llevaban a `/login?role=…`. Y el login nunca leyó ese parámetro: los
            tres iban exactamente al mismo formulario. O sea que la pantalla
            hacía elegir algo que no cambiaba nada, y de paso obligaba a quien
            llega a decidir cómo se llama a sí mismo antes de poder entrar.
            La cuenta ya sabe quién es cada quien; con entrar basta. */}
        <section>
          <div className="mx-auto max-w-md rounded-3xl border border-white/20 dark:border-white/10 bg-white/15 dark:bg-white/5 backdrop-blur-xl p-6 text-center shadow-sm transition-colors duration-300">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white">
              ¿Ya trabajas con nosotros?
            </h2>
            <p className="mx-auto mt-1 mb-5 max-w-xs text-[14px] leading-snug text-slate-500 dark:text-slate-400">
              Entra con tu cuenta. Al hacerlo verás lo tuyo, seas comercio,
              mensajero o parte del equipo.
            </p>
            <Link
              href="/login"
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] text-[17px] font-bold text-[#1C1C1E] transition-transform hover:bg-[#ff812c]/90 active:scale-[0.98]"
            >
              <LogIn className="h-5 w-5" />
              Ingresar a la plataforma
            </Link>
            <Link
              href="/registro"
              className="mt-3 inline-block text-[15px] font-semibold text-[#ff812c] transition-opacity hover:underline active:opacity-70"
            >
              Crear una cuenta
            </Link>
          </div>
        </section>

        {/* Pillars / Features Section */}
        <section className="pt-8 border-t border-slate-900/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[14px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center mb-8">Nuestros Pilares Operativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PILLARS.map((p, idx) => (
              <div key={idx} className="bg-white/15 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-3xl shadow-sm flex flex-col items-start transition-all duration-300 hover:shadow-md hover:-translate-y-1">
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

        {/* De dónde sale el nombre. Va después de los pilares y antes del pie:
            quien vino a rastrear un paquete ya resolvió lo suyo arriba, y a
            quien se quedó leyendo le explica por qué la app se llama así. */}
        <section className="pt-8 border-t border-slate-900/[0.06] dark:border-white/[0.08]">
          <div className="bg-white/15 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-[14px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-5">
              Por qué {MARCA.app}
            </h2>
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-8 md:items-start">
              <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
                <History className="w-7 h-7 text-[#ff812c] shrink-0" />
                <p className="text-[13px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 md:leading-relaxed">
                  Siglo&nbsp;XIII
                </p>
              </div>
              <div className="space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  El <strong className="font-semibold text-slate-900 dark:text-white">yam</strong>{" "}
                  —o <em>jam</em>, <span className="whitespace-nowrap">örtöö</span> en mongol— fue
                  la red de postas del Imperio Mongol. Estaciones cada 30 o 60 kilómetros
                  donde el mensajero no descansaba: entregaba, cambiaba de caballo y seguía.
                  Así movían un mensaje 300 kilómetros en un día, ochocientos años antes de
                  que existiera un camión.
                </p>
                <p>
                  Dos cosas de ese sistema son, literalmente, esta plataforma. La{" "}
                  <strong className="font-semibold text-slate-900 dark:text-white">paiza</strong> —
                  «lo que da testimonio»— era la tablilla que el mensajero mostraba en cada
                  posta para que le entregaran caballo fresco: una guía que se valida en cada
                  punto del trayecto. Y sus corredores llevaban cascabeles al cinto, para que
                  en la estación siguiente los oyeran llegar y tuvieran el relevo listo antes
                  de verlos.
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  El CEDI es la posta, la guía es la paiza y la campana de las notificaciones
                  es el cascabel. El oficio no cambió tanto; nosotros solo le pusimos pantalla.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-900/[0.06] dark:border-white/[0.08]">
          <PieMarca className="py-6" />
        </footer>

      </main>
    </div>
  );
}
