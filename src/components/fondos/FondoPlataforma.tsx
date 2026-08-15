import { Fondo, Vinneta } from "@/components/fondos/Fondo";
import { MapaAburra } from "@/components/fondos/MapaAburra";

/**
 * El valle, detrás de las 25 pantallas de trabajo.
 *
 * Antes solo vivía en dos sitios (Inicio y Seguimiento) porque el armazón
 * (AppShell) pintaba su propio color opaco encima de todo lo demás: un fondo
 * con z-index negativo colgado ahí abajo simplemente no se veía en ninguna
 * otra pantalla. El mecanismo está documentado en globals.css, sección
 * CAPAS — aquí solo hace falta saber que `.atl-fondo` es fixed + z-index: -1,
 * y que AppShell ya dejó de pintar ese color encima.
 *
 * Se cuelga UNA sola vez, en la raíz del armazón, y no pantalla por pantalla:
 * así cubre las 25 sin que cada una tenga que acordarse de montar nada. Las
 * dos que antes lo hacían a mano (Inicio, Seguimiento) ya no lo necesitan —
 * verían el valle dos veces.
 *
 * Sin animación, igual que el resto de la plataforma: el mensajero pasa el
 * turno entero con la app abierta, y una animación en bucle mantiene
 * despierto el compositor del navegador todo ese tiempo. Ver el razonamiento
 * completo en MapaDeFondo.tsx. Y más tenue que en las públicas: aquí encima
 * hay tablas y formularios que se leen todo el día, no una portada.
 */
export function FondoPlataforma() {
  return (
    <Fondo>
      <MapaAburra animado={false} opacidad={0.16} />
      <Vinneta />
    </Fondo>
  );
}
