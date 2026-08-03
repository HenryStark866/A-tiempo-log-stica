import { MARCA } from "@/lib/marca";
import { cn } from "@/lib/utils";

/**
 * El pie de las pantallas públicas.
 *
 * Dice tres cosas, y el orden importa porque son tres dueños distintos:
 *
 *   1. La plataforma es de A Tiempo Logística — quien responde por el paquete.
 *   2. El copyright y la ciudad de la operación.
 *   3. La tecnología es de CDH Maker IT, que es otra empresa. El enlace va a su
 *      portafolio.
 *
 * Vive en un componente y no copiado en cada pantalla porque es información
 * legal y de atribución: si el día de mañana cambia el año o el nombre de
 * cualquiera de las dos empresas, tiene que cambiar en un solo sitio y no en
 * los seis donde aparece.
 */
export function PieMarca({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400",
        className
      )}
    >
      {MARCA.app} es una plataforma de {MARCA.empresa}
      {/* En el teléfono el punto medio se cambia por un salto: la línea
          entera no cabe y partirla por la mitad de «A Tiempo» queda peor. */}
      <br className="sm:hidden" />
      <span className="hidden sm:inline"> · </span>© {MARCA.anioCopyright} ·{" "}
      {MARCA.ciudad}
      <br />
      <span className="text-slate-400 dark:text-slate-500">
        Tecnología y desarrollo por{" "}
        <a
          href={MARCA.desarrolladorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-500 underline-offset-2 transition-colors hover:text-[#ff812c] hover:underline active:opacity-70 dark:text-slate-400"
        >
          {MARCA.desarrollador}
        </a>
      </span>
    </p>
  );
}
