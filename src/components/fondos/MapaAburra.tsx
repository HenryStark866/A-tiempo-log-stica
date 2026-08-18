import { NARANJA } from "@/components/fondos/Fondo";

/**
 * EL VALLE DE ABURRÁ — el mapa real de donde operamos.
 *
 * No es un mapa genérico ni una textura decorativa: es el valle, con su río y
 * sus diez municipios en el orden en que están de verdad, de Caldas al sur a
 * Barbosa al norte. Quien trabaja aquí lo reconoce sin que nadie se lo explique,
 * y esa es la diferencia entre un fondo bonito y un fondo que dice algo.
 *
 * ── Por qué dibujado y no un mapa de verdad ──────────────────────────────
 *
 * Se podrían pedir las teselas de OpenStreetMap —la CSP ya las permite, por el
 * mapa del seguimiento— pero como FONDO serían una mala idea:
 *
 *   · La app es instalable y tiene que funcionar sin señal. Un fondo que
 *     depende de la red aparece a medias en el ascensor del edificio donde el
 *     mensajero está entregando, que es justo donde peor se ve.
 *   · Son decenas de peticiones por pantalla para algo que nadie mira, y el
 *     mensajero paga esos datos de su plan.
 *   · Un mapa fotográfico trae sus propios colores —verdes, azules, carreteras
 *     amarillas— y esta app tiene UNA paleta. Seis fondos distintos se leen
 *     como la misma casa justo porque ninguno estrena color.
 *
 * Dibujado en SVG pesa unos kilobytes, va en el paquete, funciona sin señal y
 * respeta el naranja de marca. Y el valle es tan reconocible por su forma
 * —largo, angosto, encajonado entre dos cordilleras— que no hace falta más.
 *
 * ── Orientación ──────────────────────────────────────────────────────────
 *
 * El valle es norte-sur y las pantallas son anchas. Puesto en vertical dejaría
 * la mitad del lienzo vacío, así que va en diagonal: Caldas abajo a la
 * izquierda, Barbosa arriba a la derecha. Se conserva el orden real de los
 * municipios, que es lo que importa; no es una carta náutica.
 */

/** El río Medellín, que corre de sur a norte por el fondo del valle. */
const RIO =
  "M 120,820 C 260,780 330,700 420,640 S 620,540 720,470 S 940,360 1060,300 S 1300,190 1420,140";

/**
 * Las laderas. Son el mismo trazo del río desplazado a lado y lado: el valle es
 * estrecho y las montañas lo siguen, así que la curva sirve para las tres.
 */
const LADERA_OESTE =
  "M 40,760 C 190,710 250,620 340,555 S 545,450 645,380 S 870,265 990,205 S 1250,95 1380,50";
const LADERA_ESTE =
  "M 210,890 C 350,850 420,775 510,715 S 705,620 805,550 S 1020,440 1140,385 S 1390,280 1500,235";

/**
 * Los diez municipios del Área Metropolitana, en su orden real de sur a norte.
 * `r` marca los que más pesan en la operación: Medellín y Bello son los grandes.
 */
const MUNICIPIOS = [
  { n: "CALDAS", x: 120, y: 820, r: 3 },
  { n: "LA ESTRELLA", x: 250, y: 760, r: 3 },
  { n: "SABANETA", x: 355, y: 700, r: 3.5 },
  { n: "ITAGÜÍ", x: 430, y: 648, r: 3.5 },
  { n: "ENVIGADO", x: 520, y: 600, r: 3.5 },
  { n: "MEDELLÍN", x: 720, y: 470, r: 6 },
  { n: "BELLO", x: 900, y: 372, r: 5 },
  { n: "COPACABANA", x: 1060, y: 300, r: 3.5 },
  { n: "GIRARDOTA", x: 1235, y: 218, r: 3 },
  { n: "BARBOSA", x: 1420, y: 140, r: 3 },
];

/**
 * Tramos cortos entre municipios vecinos, para la vista `rutas` — la red
 * viva detrás de las pantallas de trabajo, no solo un punto en el río. Cada
 * uno con su propio ritmo, como una flota real que no se mueve en bloque.
 * Mismo mecanismo que la portada (`FondoInicio`): stroke-dashoffset dibuja
 * el trazo, offset-path mueve el paquete sobre esa misma curva.
 */
const RUTAS_LOCALES = [
  { d: "M 355,700 C 420,660 480,610 520,600", dur: 19, retraso: 0 },
  { d: "M 520,600 C 590,565 660,510 720,470", dur: 21, retraso: 3.5 },
  { d: "M 720,470 C 780,435 840,400 900,372", dur: 23, retraso: 7 },
];

export function MapaAburra({
  /**
   * El pulso que recorre el valle. Se apaga en las pantallas de trabajo: una
   * animación en bucle mantiene despierto el compositor del navegador, y el
   * teléfono del mensajero tiene que llegar vivo al final del turno.
   */
  animado = true,
  /**
   * La red local (tramos + paquetes + el latido de Medellín) — aparte de
   * `animado` a propósito. Es CSS puro (transform/opacity/stroke-dashoffset,
   * nada de JavaScript ni de red), así que el costo de mantenerla despierta
   * es real pero mínimo; aun así solo la pide `FondoPlataforma`, para no
   * cambiarle la cara a las cinco pantallas que ya usan este mapa (login,
   * pago, rastreo, bienvenida, portada) sin que nadie lo haya pedido ahí.
   */
  rutas = false,
  opacidad = 1,
}: {
  animado?: boolean;
  rutas?: boolean;
  opacidad?: number;
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      style={{ opacity: opacidad }}
    >
      {/* Las laderas: el valle encajonado. Más tenues que el río porque son el
          contexto, no el camino. */}
      <path
        d={LADERA_OESTE}
        stroke={NARANJA}
        strokeWidth="1.5"
        strokeLinecap="round"
        className="opacity-[0.12] dark:opacity-20"
      />
      <path
        d={LADERA_ESTE}
        stroke={NARANJA}
        strokeWidth="1.5"
        strokeLinecap="round"
        className="opacity-[0.12] dark:opacity-20"
      />

      {/* Curvas de nivel: dos trazos cortos por ladera bastan para que se lea
          «montaña» sin dibujar una cordillera entera. */}
      <path
        d="M 300,600 C 420,545 500,470 600,410"
        stroke={NARANJA}
        strokeWidth="1"
        strokeDasharray="1 10"
        className="opacity-[0.10] dark:opacity-[0.16]"
      />
      <path
        d="M 780,700 C 900,650 1000,585 1120,520"
        stroke={NARANJA}
        strokeWidth="1"
        strokeDasharray="1 10"
        className="opacity-[0.10] dark:opacity-[0.16]"
      />

      {/* El río: el eje del valle y, en la práctica, el eje de la operación —
          por ahí van la autopista y el metro. */}
      <path
        d={RIO}
        stroke={NARANJA}
        strokeWidth="2.5"
        strokeLinecap="round"
        className="opacity-25 dark:opacity-[0.38]"
      />

      {/* Los municipios */}
      {MUNICIPIOS.map((m) => (
        <g key={m.n}>
          <circle
            cx={m.x}
            cy={m.y}
            r={m.r}
            fill={NARANJA}
            className="opacity-30 dark:opacity-45"
          />
          {/* El halo solo en los grandes, para que la mirada encuentre el
              centro del valle sin que nadie se lo señale. */}
          {m.r >= 5 && (
            <circle
              cx={m.x}
              cy={m.y}
              r={m.r * 3.2}
              stroke={NARANJA}
              strokeWidth="1"
              className="opacity-[0.14] dark:opacity-25"
            />
          )}
          {/* El latido de Medellín, el nodo que más pesa: el mismo halo de
              arriba, otra vez encima, expandiéndose y apagándose despacio.
              Solo el más grande — un valle entero latiendo sería ruido. */}
          {rutas && m.n === "MEDELLÍN" && (
            <circle
              cx={m.x}
              cy={m.y}
              r={m.r * 3.2}
              stroke={NARANJA}
              strokeWidth="1.5"
              style={{ opacity: 0, animation: "atl-onda 9s ease-out infinite" }}
            />
          )}
          {/* El nombre, diminuto. A esta opacidad se lee como textura de lejos
              y como dato de cerca: quien se fije reconoce su municipio. */}
          <text
            x={m.x + m.r + 8}
            y={m.y + 3}
            fill={NARANJA}
            fontSize="9"
            letterSpacing="2.5"
            className="opacity-[0.18] dark:opacity-30"
            style={{ fontFamily: "inherit", fontWeight: 600 }}
          >
            {m.n}
          </text>
        </g>
      ))}

      {/* La red local: tramos entre vecinos dibujándose solos, con su propio
          paquete viajando encima. Muy por debajo de las rutas de la portada
          en opacidad — esto vive detrás de horas de trabajo, no de una
          primera impresión de segundos. */}
      {rutas &&
        RUTAS_LOCALES.map((r, i) => (
          <path
            key={`ruta-local-${i}`}
            d={r.d}
            stroke={NARANJA}
            strokeWidth="1.25"
            strokeLinecap="round"
            className="opacity-[0.12] dark:opacity-20"
            style={{
              strokeDasharray: 260,
              strokeDashoffset: 260,
              animation: `atl-recorre ${r.dur}s ease-in-out ${r.retraso}s infinite`,
              ["--atl-largo" as string]: "260",
            }}
          />
        ))}
      {rutas &&
        RUTAS_LOCALES.map((r, i) => (
          <circle
            key={`paquete-local-${i}`}
            r="3"
            fill={NARANJA}
            style={{
              opacity: 0,
              offsetPath: `path("${r.d}")`,
              animation: `atl-avanza ${r.dur}s linear ${r.retraso + 0.8}s infinite`,
            }}
          />
        ))}

      {/* El pulso: un paquete subiendo el valle. Recorre el mismo trazo del río
          porque es por donde se mueve todo aquí. */}
      {animado && (
        <circle r="4" fill={NARANJA} className="opacity-60 dark:opacity-80" data-motion>
          <animateMotion dur="16s" repeatCount="indefinite" path={RIO} />
        </circle>
      )}
    </svg>
  );
}
