import { cn } from "@/lib/utils";

/**
 * Cronómetro "A Tiempo" — versión vectorizada de alta fidelidad.
 * Bisel abierto por la izquierda con estela de velocidad, anillo interior,
 * marcas horarias, manecillas dinámicas y pivote con acento de marca (#ff812c).
 * Los trazos usan `currentColor`, por lo que hereda el color del contenedor
 * y funciona en tema claro y oscuro. El acento naranja es fijo.
 */
export const LogoIcon = ({
  className,
  accent = "#ff812c",
}: {
  className?: string;
  accent?: string;
}) => (
  <svg
    viewBox="-16 8 202 162"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Estela de velocidad (entra por el costado abierto del bisel) */}
    <line x1="-10" y1="100" x2="58" y2="100" strokeWidth="11" strokeOpacity="1" />
    <line x1="6" y1="84" x2="52" y2="84" strokeWidth="9" strokeOpacity="0.82" />
    <line x1="6" y1="116" x2="52" y2="116" strokeWidth="9" strokeOpacity="0.82" />
    <line x1="24" y1="69" x2="46" y2="69" strokeWidth="7" strokeOpacity="0.6" />
    <line x1="24" y1="131" x2="46" y2="131" strokeWidth="7" strokeOpacity="0.6" />

    {/* Bisel exterior, abierto por la izquierda */}
    <path d="M 63.62 79.48 A 60 60 0 1 1 63.62 120.52" strokeWidth="10" />
    {/* Anillo interior */}
    <path d="M 71.95 86.2 A 50 50 0 1 1 71.95 113.8" strokeWidth="2.5" opacity="0.55" />

    {/* Corona / botón superior */}
    <line x1="120" y1="40" x2="120" y2="27" strokeWidth="7" />
    <line x1="107" y1="21" x2="133" y2="21" strokeWidth="9" />
    {/* Botón lateral */}
    <line x1="162.4" y1="57.6" x2="169.5" y2="50.5" strokeWidth="7" />

    {/* Marcas horarias */}
    <line x1="120" y1="51" x2="120" y2="61" strokeWidth="4" opacity="0.9" />
    <line x1="144.5" y1="57.6" x2="142" y2="61.9" strokeWidth="2.5" opacity="0.5" />
    <line x1="162.4" y1="75.5" x2="158.1" y2="78" strokeWidth="2.5" opacity="0.5" />
    <line x1="169" y1="100" x2="159" y2="100" strokeWidth="4" opacity="0.9" />
    <line x1="162.4" y1="124.5" x2="158.1" y2="122" strokeWidth="2.5" opacity="0.5" />
    <line x1="144.5" y1="142.4" x2="142" y2="138.1" strokeWidth="2.5" opacity="0.5" />
    <line x1="120" y1="149" x2="120" y2="139" strokeWidth="4" opacity="0.9" />
    <line x1="95.5" y1="142.4" x2="98" y2="138.1" strokeWidth="2.5" opacity="0.5" />
    <line x1="77.6" y1="124.5" x2="81.9" y2="122" strokeWidth="2.5" opacity="0.5" />
    <line x1="77.6" y1="75.5" x2="81.9" y2="78" strokeWidth="2.5" opacity="0.5" />
    <line x1="95.5" y1="57.6" x2="98" y2="61.9" strokeWidth="2.5" opacity="0.5" />

    {/* Manecillas */}
    <line x1="120" y1="100" x2="124.3" y2="69.3" strokeWidth="7" />
    <line x1="120" y1="100" x2="157" y2="71.1" strokeWidth="5" />

    {/* Pivote con acento de marca */}
    <circle cx="120" cy="100" r="6.5" fill="currentColor" stroke="none" />
    <circle cx="120" cy="100" r="3" fill={accent} stroke="none" />
  </svg>
);

export function Logo({
  className,
  dark = false,
  variant = "horizontal",
}: {
  className?: string;
  dark?: boolean;
  variant?: "horizontal" | "vertical";
}) {
  const isVertical = variant === "vertical";

  return (
    <div className={cn("flex", isVertical ? "flex-col items-center gap-2" : "items-center gap-3", className)}>
      <LogoIcon className={cn("text-slate-900 dark:text-white shrink-0", isVertical ? "w-16 h-16" : "w-10 h-10")} />

      <div className={cn("flex flex-col", isVertical ? "items-center" : "items-start")}>
        <span
          className={cn(
            "font-semibold tracking-wide leading-none",
            isVertical ? "text-2xl" : "text-xl",
            dark ? "text-white" : "text-slate-900 dark:text-white"
          )}
        >
          A TIEMPO
        </span>
        <span className={cn(
          "font-light uppercase",
          isVertical ? "text-[11px] tracking-[0.35em] mt-1" : "text-[9px] tracking-[0.3em] mt-0.5",
          dark ? "text-slate-300" : "text-slate-500 dark:text-slate-400"
        )}>
          LOGÍSTICA
        </span>
      </div>
    </div>
  );
}
