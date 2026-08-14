import Link from "next/link";
import { Wrench } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MARCA } from "@/lib/marca";
import { FondoRastreo } from "@/components/fondos/FondoRastreo";

export const metadata = {
  title: "Volvemos en unos minutos",
};

/**
 * La pantalla del cambio de casa.
 *
 * Se enciende con la variable MANTENIMIENTO en Vercel y solo cubre la
 * plataforma —donde la gente ESCRIBE—. El rastreo público y la pantalla de
 * pago siguen en pie: ahí solo se lee, y dejar a un destinatario sin saber
 * dónde va su paquete sería el peor momento para hacerlo.
 *
 * Existe por una razón concreta: mientras se mueve la base de un proyecto a
 * otro, cualquier cosa que alguien guarde se escribiría en la base VIEJA y no
 * llegaría a la nueva. No es que la app se caiga, es que ese trabajo se
 * perdería sin que nadie lo note hasta días después. Media hora de «volvemos
 * enseguida» es mucho más barato que un mensajero perdiendo las entregas de
 * una tarde.
 *
 * El texto no dice «error» ni «problema»: no lo hay. Estamos mudándonos, y a
 * quien trabaja con esto se le debe una explicación en esos términos.
 */
export default function MantenimientoPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 font-sans text-slate-900 transition-colors duration-300 dark:text-white">
      {/* La única pública que se quedó sin fondo cuando la creé. Lleva el del
          rastreo a propósito: durante la ventana de mantenimiento el rastreo
          sigue en pie, y es a donde manda el botón de esta pantalla. */}
      <FondoRastreo />
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-3xl bg-[#FFFFFF] p-8 shadow-sm dark:bg-[#2C2C2E]">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#ff812c]/10">
            <Wrench className="h-8 w-8 text-[#ff812c]" />
          </div>

          <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
            Volvemos en unos minutos
          </h1>

          <p className="mt-3 text-[16px] leading-relaxed text-slate-600 dark:text-slate-300">
            Estamos haciendo una mejora en {MARCA.app}. Es corto y está previsto.
          </p>

          <p className="mt-3 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
            Preferimos cerrar un rato a que se pierda algo de tu trabajo. Nada de
            lo que ya guardaste se ve afectado: tus pedidos, tus entregas y tu
            recaudo están a salvo.
          </p>

          <div className="mt-6 rounded-2xl bg-[#F2F2F7] px-4 py-4 text-left dark:bg-[#1C1C1E]">
            <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
              <strong className="font-semibold text-slate-900 dark:text-white">
                ¿Tienes un paquete en camino?
              </strong>{" "}
              El rastreo sigue funcionando con normalidad.
            </p>
            <Link
              href="/rastreo"
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
            >
              Rastrear un pedido
            </Link>
          </div>
        </div>

        <p className="mt-6 text-[13px] text-slate-400 dark:text-slate-500">
          {MARCA.app} es una plataforma de {MARCA.empresa}
        </p>
      </div>
    </div>
  );
}
