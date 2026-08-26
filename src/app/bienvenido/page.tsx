import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Crosshair,
  CheckCircle2,
  Clock,
  MapPinned,
  Package,
  ScrollText,
  Truck,
  Warehouse,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { MARCA } from "@/lib/marca";
import type { Role } from "@/lib/types";

import { FondoBienvenido } from "@/components/fondos/FondoBienvenido";
export const metadata = {
  // La plantilla del layout le añade « | YAM » al final.
  title: "Cuenta confirmada",
};

/**
 * Qué ve cada quien al entrar por primera vez.
 *
 * El texto cambia por rol porque lo que acaba de pasar es distinto: al comercio
 * se le activó todo y puede despachar hoy mismo; el mensajero entra pero
 * todavía le falta que revisemos sus papeles; al personal ni siquiera se le
 * abrió el acceso. Un «bienvenido» igual para los tres le mentiría a dos.
 */
const BIENVENIDA: Record<string, {
  saludo: string;
  /** El párrafo emotivo. Es lo único que esta pantalla tiene de irrepetible. */
  emotivo: string;
  destino: string;
  cta: string;
  pasos: { icon: typeof Package; titulo: string; detalle: string }[];
}> = {
  cliente: {
    saludo: "Tu comercio ya está listo para despachar.",
    emotivo:
      "Detrás de cada pedido que despaches hay alguien esperando en una puerta. " +
      "Nosotros nos encargamos de ese tramo —el último, el que más se recuerda— " +
      "para que tú te dediques a vender.",
    destino: "/inicio",
    cta: "Entrar a la plataforma",
    pasos: [
      { icon: Package, titulo: "Carga tus productos", detalle: "Sube tu catálogo y así el valor a recaudar se llena solo." },
      { icon: MapPinned, titulo: "Registra tus clientes", detalle: "Importa tu base de destinatarios desde un archivo." },
      { icon: Truck, titulo: "Crea tu primer pedido", detalle: "Y solicita la recogida cuando tengas los paquetes listos." },
    ],
  },
  mensajero: {
    saludo: "Ya puedes empezar a rodar con nosotros.",
    emotivo:
      "Eres el que llega a la puerta. De todo lo que hacemos, lo único que el " +
      "comprador ve eres tú: por eso el oficio es más viejo que las empresas y " +
      "sigue sin poder automatizarse.",
    destino: "/mi-perfil",
    cta: "Subir mis documentos",
    pasos: [
      { icon: ScrollText, titulo: "Sube tus documentos", detalle: "Cédula, licencia y papeles del vehículo. Es lo único que falta para que puedas recibir entregas." },
      { icon: MapPinned, titulo: "Revisa tu ruta", detalle: "Apenas te habilitemos, ahí ves las entregas del día en orden." },
      { icon: Truck, titulo: "Atiende las recogidas", detalle: "Te llega una notificación cuando te asignen una." },
    ],
  },
};

/**
 * Los cuatro detalles del yam que son, literalmente, esta plataforma.
 *
 * Los dos últimos van juntos y en ese orden a propósito: son la misma idea
 * vista desde los dos lados. En el yam la señal siempre viajaba por delante
 * del mensajero — el cascabel avisaba de que ya llegaba, la flecha avisaba
 * antes de que saliera. La fuente de todo esto es `marca.ts`.
 */
const HERENCIA = [
  {
    icon: Warehouse,
    titulo: "La posta es el CEDI",
    detalle: "Estaciones cada 30 o 60 km donde el mensajero no descansaba: entregaba, cambiaba de caballo y seguía.",
  },
  {
    icon: ScrollText,
    titulo: "La paiza es tu pedido",
    detalle: "Una tablilla —«lo que da testimonio»— que se validaba en cada punto del trayecto.",
  },
  {
    icon: Bell,
    titulo: "El cascabel es la campana",
    detalle: "Los corredores lo llevaban al cinto para que en la posta siguiente los oyeran llegar y tuvieran el relevo listo.",
  },
  {
    icon: Crosshair,
    titulo: "La flecha silbadora es tu código",
    detalle: "Punta de hueso perforada que silbaba en vuelo. No se tiraba para herir: se tiraba para avisar, y su silbido llegaba antes que quien la había disparado.",
  },
];

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
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 py-10 transition-colors duration-300">
      <FondoBienvenido />
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
          </div>

          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
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
            {/* El párrafo emotivo va aquí, entre el saludo y las tareas: quien
                llega quiere primero saber que llegó bien, y solo después qué
                tiene que hacer. */}
            <div className="mt-6 rounded-3xl border-l-4 border-[#ff812c] atl-superficie px-5 py-5 shadow-sm ">
              <p className="text-[16px] leading-relaxed text-slate-700 dark:text-slate-200">
                {config.emotivo}
              </p>
            </div>

            <ul className="mt-6 divide-y divide-slate-900/[0.06] overflow-hidden rounded-2xl atl-superficie shadow-sm dark:divide-white/[0.08] ">
              {config.pasos.map((paso) => (
                <li key={paso.titulo} className="flex items-start gap-3 px-4 py-4">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff812c]/10">
                    <paso.icon className="h-[18px] w-[18px] text-[#ff812c]" />
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
              className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform hover:bg-[#ff812c]/90 active:scale-[0.98]"
            >
              <span>{config.cta}</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </>
        ) : (
          /* Personal de ATL y CEDIs afiliados: el correo quedó confirmado, pero
             el acceso lo abre un administrador. Se dice claro para que nadie se
             quede intentando entrar y creyendo que algo se rompió. */
          <div className="mt-6 space-y-6">
            <div className="flex items-start gap-3 rounded-2xl atl-superficie px-4 py-5 shadow-sm ">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                <Clock className="h-[18px] w-[18px] text-amber-500" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Falta la aprobación de administración
                </p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Tu correo quedó verificado. Como te registraste para trabajar con
                  nosotros, un administrador revisa tus datos antes de abrirte el
                  acceso. Ya le llegó tu solicitud; te avisamos apenas esté lista.
                </p>
              </div>
            </div>

            <Link
              href="/login"
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform hover:bg-[#ff812c]/90 active:scale-[0.98]"
            >
              <span>Ir a ingresar</span>
            </Link>
          </div>
        )}

        {/* De dónde viene el nombre. Va al final: quien tenía prisa ya se fue
            por el botón de arriba, y a quien se quedó le contamos en qué
            cadena de relevos acaba de entrar. */}
        <section className="mt-10 rounded-3xl atl-superficie p-6 shadow-sm ">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            Siglo XIII
          </p>
          <h2 className="mt-2 text-[19px] font-bold leading-snug text-slate-900 dark:text-white">
            Por qué nos llamamos {MARCA.app}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            El <strong className="font-semibold text-slate-900 dark:text-white">yam</strong> fue la
            red de postas del Imperio Mongol. Movían un mensaje 300 kilómetros en un día,
            ochocientos años antes de que existiera un camión. No por ir más rápido: por no
            detenerse nunca.
          </p>

          <ul className="mt-5 space-y-4">
            {HERENCIA.map((h) => (
              <li key={h.titulo} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full atl-relleno ">
                  <h.icon className="h-[18px] w-[18px] text-[#ff812c]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{h.titulo}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {h.detalle}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-5 border-t border-slate-900/[0.06] pt-4 text-[15px] leading-relaxed text-slate-600 dark:border-white/[0.08] dark:text-slate-300">
            El oficio no cambió tanto; nosotros solo le pusimos pantalla.{" "}
            <strong className="font-semibold text-slate-900 dark:text-white">
              Desde hoy eres parte de esa cadena de relevos.
            </strong>
          </p>
        </section>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 text-[15px] font-medium text-slate-400 transition-colors hover:text-slate-600 active:opacity-70 dark:text-slate-500 dark:hover:text-slate-300"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
