"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  MapPinned,
  PackageSearch,
  RotateCcw,
  ScanBarcode,
  Search,
  Warehouse,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "Digitalización en el punto",
    text: "Cada paquete se registra al recogerlo: correlación guía-paquete validada desde el primer contacto.",
  },
  {
    icon: Warehouse,
    title: "Trazabilidad CEDI",
    text: "Escaneo de recepción en bodega, picking y zonificación por zonas de Medellín en tiempo real.",
  },
  {
    icon: MapPinned,
    title: "Última milla inteligente",
    text: "Rutas por mensajero con máquina de estados: en ruta, entregada o novedad con máximo 2 intentos.",
  },
  {
    icon: Banknote,
    title: "Recaudo contraentrega",
    text: "Cierre de caja diario, consignación bancaria y conciliación inmediata que reduce el riesgo de fraude.",
  },
  {
    icon: RotateCcw,
    title: "Logística inversa controlada",
    text: "Los fallos definitivos entran a devolución al e-commerce sin inflar costos de transporte.",
  },
  {
    icon: PackageSearch,
    title: "Facturación automática",
    text: "Cortes quincenales o mensuales por cliente, generados desde las entregas y devoluciones reales.",
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
    <div className="min-h-screen bg-navy-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo dark />
        <Link
          href="/login"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Ingresar a la plataforma
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
          <p className="mx-auto mb-4 w-fit rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-300">
            Última milla e-commerce · Medellín
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight text-white md:text-5xl">
            Tu paquete, <span className="text-brand-400">a tiempo</span>, con
            trazabilidad de punta a punta
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Operamos la recogida, el centro de distribución, la entrega y el
            recaudo contraentrega de tu e-commerce con procesos estándar ISO 9001.
          </p>

          <form
            onSubmit={track}
            className="mx-auto mt-10 flex max-w-xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl shadow-brand-500/10"
          >
            <div className="flex flex-1 items-center gap-2 px-3">
              <Search className="size-5 shrink-0 text-slate-400" />
              <input
                value={guide}
                onChange={(e) => setGuide(e.target.value)}
                placeholder="Rastrea tu guía — ej: ATL-100008"
                className="w-full bg-transparent py-2 text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white transition hover:bg-brand-600"
            >
              Rastrear
              <ArrowRight className="size-4" />
            </button>
          </form>
        </section>

        <section className="rounded-t-[2.5rem] bg-slate-50 px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <f.icon className="size-6" />
                </span>
                <h3 className="mb-1 font-bold text-navy-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-14 text-center text-sm text-slate-400">
            © {new Date().getFullYear()} A Tiempo Logística · Medellín, Colombia
          </p>
        </section>
      </main>
    </div>
  );
}
