import Link from "next/link";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BuscadorGuia } from "@/components/BuscadorGuia";
import { FondoRastreo } from "@/components/fondos/FondoRastreo";
import { PieMarca } from "@/components/PieMarca";

export const metadata: Metadata = {
  title: "Rastrea tu envío",
  description:
    "Consulta dónde va tu paquete con el número de pedido. No necesitas cuenta ni registrarte.",
};

/**
 * /rastreo — la puerta pública del rastreo.
 *
 * Existe porque es la URL que la gente comparte y teclea de memoria («entra a
 * .../rastreo y pon tu código»), y hasta ahora devolvía un 404: solo estaba
 * /rastreo/<numero>, que sirve si ya tienes el enlace completo, no si te lo
 * dictaron por teléfono.
 *
 * Sin sesión y sin cuenta, a propósito: quien compró algo no es cliente
 * nuestro, es cliente del comercio, y no tiene por qué registrarse en una
 * plataforma logística para saber dónde está su paquete.
 */
export default function RastreoPage() {
  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300 pb-12">
      <FondoRastreo />

      <div className="sticky top-0 z-10 atl-relleno  backdrop-blur-xl border-b border-slate-900/[0.06] dark:border-white/[0.08] transition-colors duration-300">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/" className="transition-opacity active:opacity-70">
            <Logo />
          </Link>
          <Link
            href="/login"
            className="-mx-2 flex min-h-[44px] items-center px-2 text-[15px] font-semibold text-[#ff812c] transition-opacity active:opacity-70"
          >
            Ingresar
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-6 px-4 pt-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff812c]/10 dark:bg-[#ff812c]/20">
            <PackageSearch className="h-7 w-7 text-[#ff812c]" />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900 dark:text-white">
            Rastrea tu envío
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
            Escribe el número de pedido que te dio el comercio. No necesitas cuenta.
          </p>
        </div>

        <section className="rounded-3xl atl-superficie p-6 shadow-sm transition-colors duration-300 ">
          <BuscadorGuia autoFocus />
        </section>

        <p className="px-2 text-center text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
          Si el paquete trae un código QR, escanéalo: te lleva al seguimiento en vivo,
          con el mensajero en el mapa cuando va en camino.
        </p>

        <PieMarca className="pt-4" />
      </main>
    </div>
  );
}
