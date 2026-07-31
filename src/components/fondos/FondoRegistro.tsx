import { Fondo, Rejilla, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";

/**
 * CREAR CUENTA — "la red que crece".
 *
 * Quien llega aquí se está sumando a algo. El fondo lo dice sin decirlo: nodos
 * sueltos que se van enlazando, y los enlaces dibujándose uno tras otro hasta
 * formar la malla. Es la misma paleta y el mismo trazo de las rutas de la
 * portada, pero el gesto es el contrario: allí se sale del centro, aquí se teje.
 */

const NODOS = [
  { x: 150, y: 200 }, { x: 420, y: 120 }, { x: 700, y: 230 }, { x: 980, y: 140 },
  { x: 1270, y: 260 }, { x: 260, y: 470 }, { x: 560, y: 420 }, { x: 850, y: 500 },
  { x: 1150, y: 440 }, { x: 180, y: 730 }, { x: 470, y: 690 }, { x: 780, y: 780 },
  { x: 1080, y: 700 }, { x: 1330, y: 620 },
];

/** Qué se enlaza con qué. Elegido a mano para que la malla respire. */
const ENLACES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 6], [2, 7], [3, 8],
  [4, 8], [5, 6], [6, 7], [7, 8], [5, 9], [6, 10], [7, 11], [8, 12], [8, 13],
  [9, 10], [10, 11], [11, 12], [12, 13],
];

export function FondoRegistro() {
  return (
    <Fondo>
      <Rejilla paso={80} duracion={16} opacidad={0.35} />
      <Resplandor x="72%" y="68%" tamano={640} fuerza={0.1} duracion={12} />
      <Resplandor x="22%" y="26%" tamano={480} fuerza={0.07} duracion={15} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Los enlaces, tejiéndose por turnos */}
        {ENLACES.map(([a, b], i) => (
          <line
            key={`e-${a}-${b}`}
            x1={NODOS[a].x}
            y1={NODOS[a].y}
            x2={NODOS[b].x}
            y2={NODOS[b].y}
            stroke={NARANJA}
            strokeWidth="1"
            strokeLinecap="round"
            className="opacity-20 dark:opacity-35"
            style={{
              strokeDasharray: 420,
              strokeDashoffset: 420,
              animation: `atl-recorre 9s ease-out ${(i % 11) * 0.75}s infinite`,
              ["--atl-largo" as string]: "420",
            }}
          />
        ))}

        {/* Los nodos, encendiéndose */}
        {NODOS.map((n, i) => (
          <g key={`n-${i}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r="26"
              stroke={NARANJA}
              strokeWidth="1"
              className="opacity-15 dark:opacity-25"
            />
            <circle
              cx={n.x}
              cy={n.y}
              r="5"
              fill={NARANJA}
              className="opacity-50 dark:opacity-70"
              style={{ animation: `atl-pulso ${6 + (i % 5)}s ease-in-out ${i * 0.6}s infinite` }}
            />
          </g>
        ))}
      </svg>

      <Vinneta />
    </Fondo>
  );
}
