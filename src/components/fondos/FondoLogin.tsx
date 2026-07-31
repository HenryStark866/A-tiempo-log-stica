import { Fondo, Rejilla, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";

/**
 * ENTRAR — "el radar del CEDI".
 *
 * Del otro lado de esta pantalla hay una operación despierta: alguien mirando
 * dónde va cada mensajero. El fondo es ese radar barriendo, con el anillo de
 * marcas horarias del cronómetro del logo alrededor.
 */

/** Las doce marcas del bisel, igual que en el logo. */
const MARCAS = Array.from({ length: 12 }, (_, i) => i * 30);

export function FondoLogin() {
  return (
    <Fondo>
      <Rejilla paso={56} duracion={14} opacidad={0.4} />
      <Resplandor x="50%" y="50%" tamano={760} fuerza={0.1} duracion={9} />

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g className="opacity-30 dark:opacity-45">
          {/* Anillos de alcance */}
          {[140, 250, 360, 470].map((r) => (
            <circle key={r} cx="500" cy="500" r={r} stroke={NARANJA} strokeWidth="1" />
          ))}

          {/* Marcas horarias: largas en las cuatro cardinales, como el bisel */}
          {MARCAS.map((a) => {
            const larga = a % 90 === 0;
            const rad = ((a - 90) * Math.PI) / 180;
            const r1 = larga ? 448 : 458;
            return (
              <line
                key={a}
                x1={500 + Math.cos(rad) * r1}
                y1={500 + Math.sin(rad) * r1}
                x2={500 + Math.cos(rad) * 470}
                y2={500 + Math.sin(rad) * 470}
                stroke={NARANJA}
                strokeWidth={larga ? 3 : 1.5}
                strokeLinecap="round"
                opacity={larga ? 0.9 : 0.5}
              />
            );
          })}

          {/* Retículas */}
          <line x1="30" y1="500" x2="970" y2="500" stroke={NARANJA} strokeWidth="0.75" />
          <line x1="500" y1="30" x2="500" y2="970" stroke={NARANJA} strokeWidth="0.75" />
        </g>

        {/* El barrido. Un sector con degradado que gira: es lo único que se
            mueve de verdad, y por eso puede permitirse ser el protagonista. */}
        <defs>
          <linearGradient id="atl-barrido-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={NARANJA} stopOpacity="0" />
            <stop offset="100%" stopColor={NARANJA} stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <g
          className="opacity-40 dark:opacity-60"
          style={{
            transformOrigin: "500px 500px",
            animation: "atl-barrido 7s linear infinite",
          }}
        >
          <path d="M500,500 L500,30 A470,470 0 0,1 900,265 Z" fill="url(#atl-barrido-grad)" />
          <line x1="500" y1="500" x2="500" y2="30" stroke={NARANJA} strokeWidth="2" />
        </g>

        {/* Contactos: mensajeros detectados por el barrido */}
        {[
          { x: 690, y: 300, d: 0 },
          { x: 330, y: 620, d: 2.3 },
          { x: 640, y: 700, d: 4.6 },
          { x: 380, y: 330, d: 5.8 },
        ].map((c) => (
          <circle
            key={`${c.x}-${c.y}`}
            cx={c.x}
            cy={c.y}
            r="6"
            fill={NARANJA}
            style={{ animation: `atl-pulso 7s ease-in-out ${c.d}s infinite` }}
          />
        ))}
      </svg>

      <Vinneta />
    </Fondo>
  );
}
