import { cn } from "@/lib/utils";
import { MARCA } from "@/lib/marca";

/**
 * El relevo — marca de YAM.
 *
 * Hereda de A Tiempo Logística exactamente lo que hace familia: el mismo bisel
 * abierto por la izquierda (es el mismo arco, carácter por carácter), la misma
 * estela de velocidad entrando por ese costado y el mismo naranja. Quien
 * conoce una reconoce la otra al instante.
 *
 * Lo que cambia es el interior, porque cambia lo que se cuenta. El cronómetro
 * de ATL habla de tiempo, que es el nombre de la empresa. Esto habla de
 * relevo, que es el nombre de la app:
 *
 *   · El galón es el gesto de pasar adelante — el mensajero que entrega y
 *     sigue. Ocupa el centro porque el relevo es el centro del oficio.
 *   · El punto naranja es la posta siguiente: adonde va el paquete ahora.
 *
 * Se probó a 16, 20 y 40 px antes de fijarla: el naranja es macizo y no un
 * detalle fino, que es lo único que sobrevive en un favicon.
 *
 * Los trazos usan `currentColor`, así que hereda el color del contenedor y
 * funciona en claro y oscuro. El naranja es fijo.
 */
export const LogoIcon = ({
  className,
  accent = "#ff812c",
}: {
  className?: string;
  accent?: string;
}) => (
  <svg
    viewBox="-14 26 200 148"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Estela de velocidad: el mismo gesto que entra por el costado en ATL */}
    <line x1="-8" y1="100" x2="52" y2="100" strokeWidth="11" />
    <line x1="8" y1="80" x2="48" y2="80" strokeWidth="9" strokeOpacity="0.75" />
    <line x1="8" y1="120" x2="48" y2="120" strokeWidth="9" strokeOpacity="0.75" />

    {/* Bisel abierto por la izquierda — heredado tal cual del logo de ATL */}
    <path d="M 63.62 79.48 A 60 60 0 1 1 63.62 120.52" strokeWidth="12" />

    {/* El galón: pasar adelante */}
    <path d="M 88 64 L 128 100 L 88 136" strokeWidth="15" />

    {/* La posta siguiente */}
    <circle cx="156" cy="100" r="13" fill={accent} stroke="none" />
  </svg>
);

export function Logo({
  className,
  dark = false,
  variant = "horizontal",
  /** Añade «por A Tiempo Logística» debajo. Para las pantallas públicas. */
  conFirma = false,
}: {
  className?: string;
  dark?: boolean;
  variant?: "horizontal" | "vertical";
  conFirma?: boolean;
}) {
  const isVertical = variant === "vertical";

  return (
    <div
      className={cn(
        "flex",
        isVertical ? "flex-col items-center gap-2" : "items-center gap-3",
        className
      )}
    >
      <LogoIcon
        className={cn(
          "text-slate-900 dark:text-white shrink-0",
          isVertical ? "w-16 h-16" : "w-10 h-10"
        )}
      />

      <div className={cn("flex flex-col", isVertical ? "items-center" : "items-start")}>
        <span
          className={cn(
            "font-semibold leading-none",
            // YAM son tres letras: sin un poco de aire se leen como un bloque.
            isVertical ? "text-2xl tracking-[0.18em]" : "text-xl tracking-[0.16em]",
            dark ? "text-white" : "text-slate-900 dark:text-white"
          )}
        >
          {MARCA.app}
        </span>
        <span
          className={cn(
            "font-light uppercase",
            isVertical
              ? "text-[11px] tracking-[0.3em] mt-1"
              : "text-[9px] tracking-[0.26em] mt-0.5",
            dark ? "text-slate-300" : "text-slate-500 dark:text-slate-400"
          )}
        >
          {MARCA.descriptor}
        </span>
        {conFirma && (
          <span
            className={cn(
              "mt-1 font-normal",
              isVertical ? "text-[11px]" : "text-[10px]",
              dark ? "text-slate-400" : "text-slate-400 dark:text-slate-500"
            )}
          >
            {MARCA.firma}
          </span>
        )}
      </div>
    </div>
  );
}
