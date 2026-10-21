import { BEYOND_ACCESS } from "@/lib/aliados";
import { cn } from "@/lib/utils";

/**
 * Beyond Access en pantalla.
 *
 * Somos aliados de la iniciativa y eso se anuncia en las pantallas públicas.
 * Son dos piezas, no una, porque son dos sitios con dos aires distintos:
 *
 *   · `SelloBeyondAccess` — una línea con el sello, para el pie. Es lo que ve
 *     cualquiera que entre a rastrear un paquete: tiene que decir el hecho y
 *     quitarse de en medio.
 *   · `BloqueBeyondAccess` — la sección con el logotipo y el párrafo entero,
 *     para quien se quedó leyendo la pantalla de inicio.
 *
 * Las dos cambian de archivo con el tema en lugar de recolorear el SVG: los
 * archivos nos los entregaron ya resueltos en tinta y en negativo, y repintar
 * una marca ajena con un filtro CSS es exactamente lo que no se hace con la
 * marca de un tercero. El par `dark:hidden` / `hidden dark:block` los
 * intercambia sin JavaScript, así que no hay parpadeo ni error de hidratación
 * en el arranque, que es cuando next-themes todavía no ha decidido el tema.
 *
 * El texto sale de `src/lib/aliados.ts`. No se escribe a mano aquí: el nombre
 * de la iniciativa no se altera, y esa regla solo se puede sostener si hay un
 * único sitio donde está escrito.
 */

/** Las dos versiones del mismo archivo, intercambiadas por el tema. */
function ImagenSegunTema({
  claro,
  oscuro,
  alt,
  className,
}: {
  claro: string;
  oscuro: string;
  alt: string;
  className?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={claro}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn("dark:hidden", className)}
      />
      {/* El segundo lleva alt vacío: para un lector de pantalla los dos son
          la misma marca y anunciarla dos veces sobra. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={oscuro}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

/** Una línea para el pie: el sello y la frase corta. */
export function SelloBeyondAccess({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 px-6 text-left",
        className
      )}
    >
      <ImagenSegunTema
        claro={BEYOND_ACCESS.assets.selloTinta}
        oscuro={BEYOND_ACCESS.assets.selloNegativo}
        alt={BEYOND_ACCESS.nombre}
        className="h-8 w-8 shrink-0 opacity-80"
      />
      <p className="max-w-xs text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {BEYOND_ACCESS.textos.corto}
      </p>
    </div>
  );
}

/** La sección entera, para la pantalla de inicio. */
export function BloqueBeyondAccess({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "pt-8 border-t border-slate-900/[0.06] dark:border-white/[0.08]",
        className
      )}
    >
      <div className="rounded-3xl border border-white/20 bg-white/15 p-6 shadow-sm backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-white/5 sm:p-8">
        <h2 className="mb-5 text-[14px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Hacemos parte de
        </h2>

        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start md:gap-8">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-4">
            <ImagenSegunTema
              claro={BEYOND_ACCESS.assets.logoTinta}
              oscuro={BEYOND_ACCESS.assets.logoNegativo}
              alt={BEYOND_ACCESS.nombre}
              className="h-14 w-auto md:h-20"
            />
            <p
              className="text-[13px] font-semibold uppercase tracking-widest"
              style={{ color: BEYOND_ACCESS.colores.granadilla }}
            >
              {BEYOND_ACCESS.hashtag}
            </p>
          </div>

          <div className="space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            <p>{BEYOND_ACCESS.textos.corto}</p>
            <p>{BEYOND_ACCESS.textos.boilerplate}</p>
            <p className="text-slate-500 dark:text-slate-400">
              Firmamos su compromiso: participar, compartir, diseñar para la
              gente, construir puentes y dar visibilidad. Porque el acceso fue
              solo la semilla.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
