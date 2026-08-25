import { Logo } from "@/components/Logo";
import { MARCA } from "@/lib/marca";

/**
 * El arranque de la app — la ruta de postas.
 *
 * Cuenta, en dos segundos y medio, de dónde viene el nombre. El «yam» mongol no era
 * un mensajero cabalgando muy rápido: era una línea de postas cada 32-64 km
 * donde el correo cambiaba de caballo sin bajarse del oficio. Eso es lo que se
 * dibuja aquí, en este orden:
 *
 *   1. La ruta se traza sola de izquierda a derecha.
 *   2. Las cinco postas se encienden en cascada, a medida que la ruta las
 *      alcanza: primero existe el camino, después el relevo.
 *   3. El correo —el cuadro naranja, el mismo que los paquetes de FondoInicio—
 *      la recorre de punta a punta.
 *   4. En la última posta se expande una onda, dos veces. Es el cascabel que
 *      contó Marco Polo: en el cinturón del corredor, para que en la posta
 *      siguiente lo oyeran llegar y tuvieran el relevo listo antes de verlo.
 *      Una notificación anticipada, en el siglo XIII. Y ahora se oye de
 *      verdad — el sonido lo pone `SonidoDeArranque`, que va aparte
 *      justamente para no meter JavaScript aquí.
 *
 * ── Por qué no lleva una línea de JavaScript ──────────────────────────────
 *
 * Es lo primero que se pinta y tiene que irse solo, pase lo que pase. Si
 * dependiera de un `useEffect` para retirarse, un error de hidratación o un
 * paquete que no cargó lo dejarían pegado tapando la app entera, sin salida y
 * sin nada que tocar. Siendo CSS puro, el navegador lo retira aunque el
 * JavaScript nunca llegue: la animación de salida termina en `visibility:
 * hidden` con `forwards`.
 *
 * Por lo mismo va `pointer-events: none` desde el primer cuadro — mientras se
 * desvanece no debe comerse el primer toque de nadie.
 *
 * Quien pidió menos movimiento no ve esto: el splash se salta entero (ver
 * `prefers-reduced-motion` en globals.css). No es información, es identidad, y
 * ahí la regla es la misma que la de los fondos.
 */

/** La ruta. El mismo trazo alimenta el dibujo y el recorrido del correo. */
const RUTA = "M 20 150 Q 160 124 300 150";

/** Largo aproximado del trazo, para el dasharray. Holgado a propósito. */
const LARGO = 300;

/**
 * Las cinco postas, sobre la curva. Salen de evaluar la cuadrática en t = 0,
 * ¼, ½, ¾ y 1, así que caen exactamente encima de la ruta y no «flotando»
 * cerca: si algún día cambia RUTA, hay que recalcularlas.
 */
const POSTAS = [
  { x: 20, y: 150 },
  { x: 90, y: 140.25 },
  { x: 160, y: 137 },
  { x: 230, y: 140.25 },
  { x: 300, y: 150 },
];

const NARANJA = "#ff812c";

export function Splash() {
  return (
    <div className="atl-splash" aria-hidden="true">
      <div className="flex flex-col items-center gap-7 px-8">
        {/* El logo, con la estela cruzando por detrás */}
        <div className="relative">
          <span className="atl-splash-estela" />
          <div className="atl-splash-logo relative">
            <Logo variant="vertical" conFirma />
          </div>
        </div>

        <svg
          viewBox="0 0 320 200"
          className="w-[280px] max-w-full"
          fill="none"
          aria-hidden="true"
        >
          {/* 1. La ruta, trazándose */}
          <path
            d={RUTA}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-slate-400 dark:text-slate-500 opacity-40"
            style={{
              strokeDasharray: LARGO,
              strokeDashoffset: LARGO,
              animation: "atl-recorre 620ms ease-out 260ms forwards",
              ["--atl-largo" as string]: String(LARGO),
            }}
          />

          {/* 2. Las postas, encendiéndose a medida que la ruta las alcanza */}
          {POSTAS.map((p, i) => {
            const esUltima = i === POSTAS.length - 1;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={esUltima ? 5 : 3.5}
                fill={esUltima ? NARANJA : "currentColor"}
                className={
                  esUltima ? "" : "text-slate-400 dark:text-slate-500"
                }
                style={{
                  opacity: 0,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  animation: `atl-posta 320ms ease-out ${320 + i * 110}ms forwards`,
                }}
              />
            );
          })}

          {/* 4. El cascabel: se oye antes de que el correo se vea llegar.
                 Suena dos veces, y por eso se expanden dos ondas. El sonido lo
                 pone SonidoDeArranque.tsx, acompasado con estos retrasos: si
                 cambian aquí, cambian allá. */}
          {[900, 1600].map((retraso) => (
            <circle
              key={retraso}
              cx={POSTAS[4].x}
              cy={POSTAS[4].y}
              r="16"
              fill={NARANJA}
              style={{
                opacity: 0,
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `atl-onda 620ms ease-out ${retraso}ms forwards`,
              }}
            />
          ))}

          {/* 3. El correo, por la misma curva que se acaba de dibujar */}
          <rect
            x="-4.5"
            y="-4.5"
            width="9"
            height="9"
            rx="2"
            fill={NARANJA}
            style={{
              opacity: 0,
              offsetPath: `path("${RUTA}")`,
              offsetRotate: "0deg",
              animation: "atl-avanza 700ms ease-in-out 380ms forwards",
            }}
          />
        </svg>

        <p className="atl-splash-pie text-[11px] font-light uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
          {MARCA.eslogan}
        </p>
      </div>
    </div>
  );
}
