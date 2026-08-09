import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, MapPinned, Package, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import type { Role } from "@/lib/types";

import { FondoBienvenido } from "@/components/fondos/FondoBienvenido";
export const metadata = {
  // La plantilla del layout le añade « | YAM » al final.
  title: "Cuenta confirmada",
};

/** Qué ve cada quien al entrar por primera vez. */
const BIENVENIDA: Record<string, {
  saludo: string;
  destino: string;
  cta: string;
  pasos: { icon: typeof Package; titulo: string; detalle: string }[];
}> = {
  cliente: {
    saludo: "Tu comercio ya está listo para despachar.",
    destino: "/inicio",
    cta: "Ir a mi panel",
    pasos: [
      { icon: Package, titulo: "Carga tus productos", detalle: "Sube tu catálogo y así el valor a recaudar se llena solo." },
      { icon: MapPinned, titulo: "Registra tus clientes", detalle: "Importa tu base de destinatarios desde un archivo." },
      { icon: Truck, titulo: "Crea tu primera guía", detalle: "Y solicita la recogida cuando tengas los paquetes listos." },
    ],
  },
  mensajero: {
    saludo: "Ya puedes empezar a rodar con nosotros.",
    destino: "/entregas",
    cta: "Ver mi ruta",
    pasos: [
      { icon: MapPinned, titulo: "Revisa tu ruta", detalle: "Ahí ves las entregas del día en orden." },
      { icon: Package, titulo: "Registra cada entrega", detalle: "Con evidencia y firma, desde el celular." },
      { icon: Truck, titulo: "Atiende las recogidas", detalle: "Te llega una notificación cuando te asignen una." },
    ],
  },
};

export default async function BienvenidoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("at_profiles")
    .select("full_name, role, requested_role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "pendiente") as Role;
  const nombre = (profile?.full_name ?? "").trim().split(" ")[0];
  const config = BIENVENIDA[role];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 py-10 transition-colors duration-300">
      <FondoBienvenido />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
          </div>

          <div className="w-16 h-16 rounded-full bg-emerald-500/10 inline-flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-500" />
          </div>

          <h1 className="mt-5 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            {nombre ? `¡Bienvenido, ${nombre}!` : "¡Bienvenido!"}
          </h1>
          <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
            Confirmamos tu correo{config ? ` y activamos tu cuenta. ${config.saludo}` : "."}
          </p>
        </div>

        {config ? (
          <>
            <ul className="mt-8 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
              {config.pasos.map((paso) => (
                <li key={paso.titulo} className="flex items-start gap-3 px-4 py-4">
                  <span className="mt-0.5 w-9 h-9 shrink-0 rounded-full bg-[#ff812c]/10 inline-flex items-center justify-center">
                    <paso.icon className="w-[18px] h-[18px] text-[#ff812c]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{paso.titulo}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {paso.detalle}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href={config.destino}
              className="mt-8 w-full flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px]"
            >
              <span>{config.cta}</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </>
        ) : (
          /* Personal de ATL: el correo quedó confirmado, falta el visto bueno. */
          <div className="mt-8 space-y-8">
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm px-4 py-5 flex items-start gap-3">
              <span className="mt-0.5 w-9 h-9 shrink-0 rounded-full bg-amber-500/10 inline-flex items-center justify-center">
                <Clock className="w-[18px] h-[18px] text-amber-500" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Falta la aprobación de administración
                </p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Tu correo quedó verificado. Como te registraste como personal de
                  A Tiempo, un administrador revisará tus datos y activará tu
                  acceso. Te avisamos apenas esté listo.
                </p>
              </div>
            </div>

            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px]"
            >
              <span>Ir a ingresar</span>
            </Link>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 text-[15px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:opacity-70"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
