import { Fondo, Rejilla, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";

/**
 * RASTREO — "la línea de vida del paquete".
 *
 * Quien abre esta pantalla quiere una sola cosa: saber por dónde va lo suyo. El
 * fondo repite esa pregunta en grande —una ruta que atraviesa la pantalla con
 * sus hitos, y un pulso recorriéndola sin parar— y le hace eco al hilo de
 * estados que muestra la página encima.
 */

/** La ruta del paquete, de un borde al otro. */
const RUTA = "M-40,620 C 220,600 300,430 520,420 S 900,520 1080,380 S 1350,240 1500,270";

/** Los hitos del camino: recogido, CEDI, en ruta, entregado. */
const HITOS = [
  { x: 180, y: 596, d: 0 },
  { x: 520, y: 420, d: 1.6 },
  { x: 1080, y: 380, d: 3.2 },
  { x: 1420, y: 276, d: 4.8 },
];

export function FondoRastreo() {
  return (
    <Fondo>
      <Rejilla paso={64} duracion={13} opacidad={0.35} />
      <Resplandor x="30%" y="70%" tamano={620} fuerza={0.09} />
      <Resplandor x="85%" y="28%" tamano={520} fuerza={0.09} duracion={13} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* El camino completo, en punteado: lo que falta por recorrer */}
        <path
          d={RUTA}
          stroke={NARANJA}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 14"
          className="opacity-25 dark:opacity-40"
        />

        {/* Lo ya recorrido, trazándose encima */}
        <path
          d={RUTA}
          stroke={NARANJA}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-40 dark:opacity-60"
          style={{
            strokeDasharray: 2200,
            strokeDashoffset: 2200,
            animation: "atl-recorre 12s ease-in-out infinite",
            ["--atl-largo" as string]: "2200",
          }}
        />

        {/* El paquete */}
        <g
          style={{
            opacity: 0,
            offsetPath: `path("${RUTA}")`,
            offsetRotate: "0deg",
            animation: "atl-avanza 12s linear 0.8s infinite",
          }}
        >
          <rect x="-8" y="-8" width="16" height="16" rx="3" fill={NARANJA} />
          <line x1="-8" y1="0" x2="8" y2="0" stroke="#1C1C1E" strokeWidth="1.5" opacity="0.5" />
        </g>

        {/* Los hitos: se encienden al paso del paquete */}
        {HITOS.map((h) => (
          <g key={`${h.x}-${h.y}`}>
            <circle
              cx={h.x}
              cy={h.y}
              r="18"
              stroke={NARANJA}
              strokeWidth="1"
              className="opacity-20 dark:opacity-30"
            />
            <circle
              cx={h.x}
              cy={h.y}
              r="6"
              fill={NARANJA}
              style={{ animation: `atl-pulso 12s ease-in-out ${h.d}s infinite` }}
            />
            <circle
              cx={h.x}
              cy={h.y}
              r="52"
              stroke={NARANJA}
              strokeWidth="1.5"
              style={{ opacity: 0, animation: `atl-onda 12s ease-out ${h.d}s infinite` }}
            />
          </g>
        ))}
      </svg>

      <Vinneta />
    </Fondo>
  );
}
