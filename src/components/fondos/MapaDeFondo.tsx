import { MapaAburra } from "@/components/fondos/MapaAburra";

/**
 * El valle como fondo DENTRO de una pantalla de trabajo.
 *
 * Las públicas usan `.atl-fondo`, que es `position: fixed` con `z-index: -1`.
 * Dentro de la plataforma eso no sirve: el armazón pinta su propio color de
 * fondo, opaco, y cualquier cosa con z-index negativo queda detrás y no se ve.
 * Quitarle ese color al armazón arreglaría el síntoma y arriesgaría la
 * legibilidad de las veinticinco pantallas de trabajo a la vez, que es un
 * cambio mucho más grande de lo que justifica un fondo.
 *
 * Así que esta capa va absoluta dentro de su propia pantalla, no fija sobre
 * todas. Cada pantalla decide si lo quiere, y ninguna se lo impone al resto.
 *
 * ── Sin animación, y no por descuido ─────────────────────────────────────
 *
 * En las pantallas de trabajo el pulso va apagado. Una animación en bucle
 * mantiene despierto el compositor del navegador todo el tiempo que la pantalla
 * esté abierta, y el mensajero pasa el día entero dentro de la app con el
 * teléfono en la mano: ese teléfono tiene que llegar vivo al final del turno.
 * En las públicas —que se abren un minuto para rastrear un paquete— sí se
 * mueve.
 *
 * La opacidad por omisión es la mitad de la de una pantalla pública: aquí
 * encima hay tablas y cifras que la gente lee todo el día, y un fondo que
 * compite con eso es un fondo mal puesto.
 */
export function MapaDeFondo({ opacidad = 0.45 }: { opacidad?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] overflow-hidden"
      style={{
        // Se apaga hacia abajo: asoma arriba, donde solo hay título, y
        // desaparece antes de llegar al contenido que se lee.
        maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 92%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 92%)",
      }}
    >
      <MapaAburra animado={false} opacidad={opacidad} />
    </div>
  );
}
