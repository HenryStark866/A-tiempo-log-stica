import { Fondo, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";
import { MapaAburra } from "@/components/fondos/MapaAburra";

/**
 * PAGAR — "el cobro que se confirma".
 *
 * Esta pantalla la abre el destinatario en la puerta de su casa, con el
 * mensajero esperando. Es el momento de menos paciencia de todo el recorrido,
 * así que el fondo es el más quieto de los seis: módulos de código que se van
 * leyendo y una onda que sale del centro cuando el cobro cuadra. Nada cruza la
 * pantalla, nada corre.
 */

/**
 * Módulos del patrón. Deterministas a propósito: con Math.random el servidor y
 * el navegador pintarían cosas distintas y React se quejaría de la diferencia.
 */
function modulos(filas: number, columnas: number) {
  const salida: { x: number; y: number; retraso: number }[] = [];
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      // Mezcla barata pero suficiente para que no se vea el patrón de la fórmula.
      const h = (f * 73856093) ^ (c * 19349663);
      if ((h >>> 3) % 5 < 2) {
        salida.push({ x: c, y: f, retraso: ((h >>> 7) % 60) / 10 });
      }
    }
  }
  return salida;
}

const MODULOS = modulos(14, 22);
const LADO = 46;

export function FondoPago() {
  return (
    <Fondo>
      <Resplandor x="50%" y="42%" tamano={700} fuerza={0.11} duracion={7} />

      {/* El valle, debajo de todo lo demás: es el terreno sobre el
          que pasa lo que dibuja esta pantalla. */}
      <MapaAburra opacidad={0.75} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1012 644"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Los módulos, encendiéndose y apagándose como una lectura en curso */}
        <g className="opacity-25 dark:opacity-40">
          {MODULOS.map((m) => (
            <rect
              key={`${m.x}-${m.y}`}
              x={m.x * LADO}
              y={m.y * LADO}
              width={LADO - 8}
              height={LADO - 8}
              rx="4"
              fill={NARANJA}
              style={{
                animation: `atl-respira 6s ease-in-out ${m.retraso}s infinite`,
                ["--atl-min" as string]: "0.08",
                ["--atl-max" as string]: "0.55",
              }}
            />
          ))}
        </g>

        {/* Las tres marcas de esquina del QR: es lo que hace reconocible el
            patrón de un vistazo, aunque esté al 25 % de opacidad. */}
        <g className="opacity-35 dark:opacity-50">
          {[
            { x: 30, y: 30 },
            { x: 800, y: 30 },
            { x: 30, y: 460 },
          ].map((e) => (
            <g key={`${e.x}-${e.y}`}>
              <rect
                x={e.x}
                y={e.y}
                width="150"
                height="150"
                rx="18"
                stroke={NARANJA}
                strokeWidth="10"
              />
              <rect x={e.x + 45} y={e.y + 45} width="60" height="60" rx="8" fill={NARANJA} />
            </g>
          ))}
        </g>

        {/* La onda del cobro confirmado, saliendo del centro */}
        {[0, 2.6, 5.2].map((d) => (
          <circle
            key={d}
            cx="506"
            cy="322"
            r="300"
            stroke={NARANJA}
            strokeWidth="2"
            className="opacity-60 dark:opacity-80"
            style={{ opacity: 0, animation: `atl-onda 7.8s ease-out ${d}s infinite` }}
          />
        ))}
      </svg>

      <Vinneta />
    </Fondo>
  );
}
