import { cn } from "@/lib/utils";

/**
 * Piezas comunes de los fondos animados.
 *
 * IDENTIDAD
 * Todo sale del logo: el cronómetro de bisel abierto, sus marcas horarias y la
 * estela de velocidad que entra por el costado. El acento es siempre el naranja
 * de marca (#ff812c); el resto es el gris de la app. Ninguna pantalla estrena
 * colores nuevos —lo que cambia de una a otra es el gesto, no la paleta—, y así
 * seis fondos distintos siguen leyéndose como la misma casa.
 *
 * LEGIBILIDAD PRIMERO
 * Un fondo que compite con el texto es un fondo mal hecho. Todo va por debajo
 * del 12 % de opacidad, con una viñeta encima que apaga el centro, que es
 * justo donde vive el contenido.
 */

export const NARANJA = "#ff812c";

/** Envoltorio: fijo, detrás de todo y sordo al puntero. */
export function Fondo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("atl-fondo", className)} aria-hidden="true">
      {children}
    </div>
  );
}

/**
 * Rejilla en fuga. El suelo de la ciudad pasando por debajo: es lo que le da a
 * todos los fondos el aire futurista sin recurrir a un solo color nuevo.
 */
export function Rejilla({
  paso = 64,
  opacidad = 0.5,
  duracion = 8,
}: {
  paso?: number;
  opacidad?: number;
  duracion?: number;
}) {
  return (
    <div className="absolute inset-0 opacity-[0.07] dark:opacity-[0.12]">
      <div
        className="absolute -inset-y-[20%] inset-x-0"
        style={{
          opacity: opacidad,
          backgroundImage: `linear-gradient(to right, ${NARANJA} 1px, transparent 1px), linear-gradient(to bottom, ${NARANJA} 1px, transparent 1px)`,
          backgroundSize: `${paso}px ${paso}px`,
          // Se desvanece hacia arriba: da profundidad sin dibujar un horizonte.
          maskImage: "linear-gradient(to bottom, transparent, black 45%, black 75%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 45%, black 75%, transparent)",
          animation: `atl-rejilla ${duracion}s linear infinite`,
          ["--atl-paso" as string]: `${paso}px`,
        }}
      />
    </div>
  );
}

/**
 * Apaga el centro de la pantalla, que es donde va el contenido, y deja el
 * movimiento asomando por los bordes.
 */
export function Vinneta() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 70% 60% at 50% 45%, var(--atl-centro, rgba(242,242,247,0.92)) 0%, transparent 100%)",
      }}
    />
  );
}

/** Resplandor de marca, muy tenue, para que el naranja no aparezca de golpe. */
export function Resplandor({
  x = "50%",
  y = "30%",
  tamano = 620,
  fuerza = 0.1,
  duracion = 11,
}: {
  x?: string;
  y?: string;
  tamano?: number;
  fuerza?: number;
  duracion?: number;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: tamano,
        height: tamano,
        marginLeft: -tamano / 2,
        marginTop: -tamano / 2,
        background: `radial-gradient(circle, ${NARANJA} 0%, transparent 68%)`,
        filter: "blur(28px)",
        animation: `atl-respira ${duracion}s ease-in-out infinite`,
        ["--atl-min" as string]: `${fuerza * 0.5}`,
        ["--atl-max" as string]: `${fuerza}`,
        opacity: fuerza,
      }}
    />
  );
}
