import { Fondo, Resplandor, Vinneta, NARANJA } from "@/components/fondos/Fondo";

/**
 * BIENVENIDO — "el arranque".
 *
 * Es la pantalla del primer día: la cuenta quedó lista y esto empieza a rodar.
 * El fondo es la estela de velocidad del logo llevada a toda la pantalla —las
 * mismas cinco líneas que entran por el costado abierto del cronómetro, ahora
 * cruzando de lado a lado y ganando velocidad hacia el centro.
 */

/** Cada franja: dónde va, qué gruesa es y cuánto tarda en cruzar. */
const ESTELAS = [
  { top: "12%", alto: 3, ancho: "22%", dur: 3.6, retraso: 0, op: 0.5 },
  { top: "21%", alto: 2, ancho: "14%", dur: 4.8, retraso: 1.4, op: 0.35 },
  { top: "34%", alto: 5, ancho: "30%", dur: 3.1, retraso: 0.6, op: 0.7 },
  { top: "46%", alto: 8, ancho: "38%", dur: 2.6, retraso: 2.1, op: 0.85 },
  { top: "58%", alto: 5, ancho: "28%", dur: 3.3, retraso: 0.2, op: 0.7 },
  { top: "70%", alto: 2, ancho: "16%", dur: 5.2, retraso: 2.8, op: 0.35 },
  { top: "80%", alto: 3, ancho: "24%", dur: 4.1, retraso: 1.1, op: 0.5 },
  { top: "89%", alto: 2, ancho: "12%", dur: 5.8, retraso: 3.4, op: 0.3 },
];

export function FondoBienvenido() {
  return (
    <Fondo>
      <Resplandor x="50%" y="45%" tamano={820} fuerza={0.12} duracion={8} />

      <div className="absolute inset-0 opacity-40 dark:opacity-70">
        {ESTELAS.map((e, i) => (
          <div
            key={i}
            className="absolute left-0 rounded-full"
            style={{
              top: e.top,
              width: e.ancho,
              height: e.alto,
              opacity: 0,
              background: `linear-gradient(to right, transparent, ${NARANJA})`,
              animation: `atl-estela ${e.dur}s cubic-bezier(0.4, 0, 0.2, 1) ${e.retraso}s infinite`,
            }}
          />
        ))}
      </div>

      {/* El cronómetro de fondo, enorme y quieto: la marca sosteniendo la escena
          mientras todo lo demás corre. */}
      <svg
        className="absolute left-1/2 top-1/2 h-[120vh] w-[120vh] -translate-x-1/2 -translate-y-1/2 opacity-[0.06] dark:opacity-[0.1]"
        viewBox="0 0 240 200"
        fill="none"
        stroke={NARANJA}
        strokeLinecap="round"
      >
        <path d="M 63.62 79.48 A 60 60 0 1 1 63.62 120.52" strokeWidth="4" />
        <path d="M 71.95 86.2 A 50 50 0 1 1 71.95 113.8" strokeWidth="1.2" opacity="0.55" />
        <line x1="120" y1="100" x2="124.3" y2="69.3" strokeWidth="3" />
        <line x1="120" y1="100" x2="157" y2="71.1" strokeWidth="2" />
        <circle cx="120" cy="100" r="4" fill={NARANJA} stroke="none" />
      </svg>

      <Vinneta />
    </Fondo>
  );
}
