import { Fondo, Rejilla, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";
import { MapaAburra } from "@/components/fondos/MapaAburra";
import { MarcasFlotantes } from "@/components/fondos/MarcasFlotantes";

/**
 * PORTADA — "la red de última milla".
 *
 * Es el fondo que más cuenta, porque es lo primero que ve alguien que todavía
 * no nos conoce. La idea: un despacho visto desde arriba. Del CEDI salen rutas
 * que se van trazando solas hacia los destinos, y por ellas viajan paquetes.
 * Encima flotan las marcas de los comercios que ya trabajan con nosotros.
 *
 * Las rutas se dibujan con stroke-dashoffset y los paquetes se mueven con
 * offset-path sobre esas mismas curvas, así que ruta y paquete no se pueden
 * desalinear: son literalmente el mismo trazo.
 */

/** El CEDI, en coordenadas del lienzo. */
const CEDI = { x: 250, y: 470 };

/**
 * Las rutas del despacho. Salen todas del CEDI y se abren hacia la ciudad;
 * cada una con su ritmo, porque una flota real no sale en bloque.
 */
const RUTAS = [
  { d: "M250,470 C 470,330 640,300 880,210", destino: { x: 880, y: 210 }, dur: 13, retraso: 0 },
  { d: "M250,470 C 500,470 700,430 1010,400", destino: { x: 1010, y: 400 }, dur: 16, retraso: 2.5 },
  { d: "M250,470 C 480,560 680,620 940,640", destino: { x: 940, y: 640 }, dur: 15, retraso: 1.2 },
  { d: "M250,470 C 420,660 560,780 820,830", destino: { x: 820, y: 830 }, dur: 18, retraso: 4 },
  { d: "M250,470 C 430,380 520,180 690,90", destino: { x: 690, y: 90 }, dur: 14, retraso: 5.5 },
];

export function FondoInicio() {
  return (
    <Fondo>
      <Rejilla paso={72} duracion={11} />
      <Resplandor x="18%" y="55%" tamano={720} fuerza={0.12} />
      <Resplandor x="78%" y="22%" tamano={520} fuerza={0.07} duracion={14} />

      {/* El valle, debajo de todo lo demás: es el terreno sobre el
          que pasa lo que dibuja esta pantalla. */}
      <MapaAburra opacidad={0.8} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Las rutas, dibujándose */}
        {RUTAS.map((r, i) => (
          <path
            key={`ruta-${i}`}
            d={r.d}
            stroke={NARANJA}
            strokeWidth="1.5"
            strokeLinecap="round"
            className="opacity-25 dark:opacity-40"
            style={{
              strokeDasharray: 1400,
              strokeDashoffset: 1400,
              animation: `atl-recorre ${r.dur}s ease-in-out ${r.retraso}s infinite`,
              ["--atl-largo" as string]: "1400",
            }}
          />
        ))}

        {/* Los paquetes, viajando por esas mismas rutas */}
        {RUTAS.map((r, i) => (
          <rect
            key={`paquete-${i}`}
            x="-5"
            y="-5"
            width="10"
            height="10"
            rx="2"
            fill={NARANJA}
            style={{
              opacity: 0,
              offsetPath: `path("${r.d}")`,
              offsetRotate: "0deg",
              animation: `atl-avanza ${r.dur}s linear ${r.retraso + 1}s infinite`,
            }}
          />
        ))}

        {/* Destinos: laten cuando el paquete va llegando */}
        {RUTAS.map((r, i) => (
          <circle
            key={`destino-${i}`}
            cx={r.destino.x}
            cy={r.destino.y}
            r="5"
            fill={NARANJA}
            style={{ animation: `atl-pulso ${r.dur / 3}s ease-in-out ${r.retraso}s infinite` }}
          />
        ))}

        {/* El CEDI: anillo abierto por la izquierda, igual que el bisel del logo */}
        <g className="opacity-50 dark:opacity-70">
          <path
            d={`M ${CEDI.x + 21} ${CEDI.y - 26} A 34 34 0 1 1 ${CEDI.x + 21} ${CEDI.y + 26}`}
            stroke={NARANJA}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={CEDI.x} cy={CEDI.y} r="6" fill={NARANJA} />
          {/* Ondas de despacho */}
          {[0, 2.4, 4.8].map((d) => (
            <circle
              key={`onda-${d}`}
              cx={CEDI.x}
              cy={CEDI.y}
              r="120"
              stroke={NARANJA}
              strokeWidth="1.5"
              style={{ opacity: 0, animation: `atl-onda 7.2s ease-out ${d}s infinite` }}
            />
          ))}
          {/* Estela de velocidad entrando por el costado abierto */}
          <line
            x1={CEDI.x - 96}
            y1={CEDI.y}
            x2={CEDI.x - 44}
            y2={CEDI.y}
            stroke={NARANJA}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* Las marcas que ya viajan con nosotros */}
      <MarcasFlotantes />

      <Vinneta />
    </Fondo>
  );
}
