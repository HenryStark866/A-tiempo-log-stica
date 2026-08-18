import { Fondo, Rejilla, Resplandor, Vinneta } from "@/components/fondos/Fondo";
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
 * ── Con movimiento, a propósito ──────────────────────────────────────────
 *
 * La primera versión iba `animado={false}` y muy tenue: el mensajero pasa el
 * turno entero con la app abierta, y una animación en bucle mantiene
 * despierto el compositor del navegador todo ese tiempo. Ese razonamiento
 * seguía siendo válido para algo como la rejilla en fuga de las públicas
 * —un `background-position` que se repinta constante—, pero aquí lo único
 * que se mueve es UN punto de 4 px recorriendo el río con `<animateMotion>`:
 * una animación SMIL nativa del navegador, sin JavaScript, del tamaño de un
 * grano de arroz. El costo real es mínimo, y Henry pidió que el fondo y su
 * movimiento se notaran más — así que ahora se ve.
 *
 * `prefers-reduced-motion` lo sigue apagando igual (globals.css, con la regla
 * aparte para SMIL que `animation: none` no cubre).
 *
 * Más opaco que la primera versión, también a propósito: 0.16 quedaba casi
 * invisible detrás de tarjetas al 90%. En 0.34 el valle se nota en los
 * márgenes y se asoma por los bordes translúcidos sin competir con el texto.
 *
 * ── La capa cinematográfica ──────────────────────────────────────────────
 *
 * Con las tarjetas principales ya translúcidas (`bg-…/75 backdrop-blur-xl`)
 * en el resto de la plataforma, un solo punto recorriendo el río se quedaba
 * corto: el fondo por fin se ve, y lo que se veía era poco. Se le suman tres
 * capas de profundidad, cada una a su propio ritmo — el desfase entre
 * velocidades es lo que lee como movimiento de cámara y no como un GIF:
 *
 *   · `Rejilla`, casi invisible (7-12 % de opacidad ya de fábrica), deriva
 *     despacio detrás de todo — el piso de la ciudad.
 *   · `Resplandor`, un respiro de marca muy tenue en una esquina, con su
 *     propio período (18 s) para no acompasarse con nada más.
 *   · `MapaAburra` con `rutas`: tramos cortos entre municipios vecinos
 *     dibujándose y un paquete viajando por cada uno, más el latido del
 *     nodo de Medellín. Aparte de `animado` a propósito — ver el porqué en
 *     `MapaAburra.tsx` — para que las otras cinco pantallas que comparten
 *     este mapa (login, pago, rastreo, bienvenida, portada) no cambien.
 *
 * Todo transform/opacity/stroke-dashoffset — nada de JavaScript, nada que
 * dispare layout — así que el costo de horas con la app abierta sigue
 * siendo el de antes: casi nada. Y `prefers-reduced-motion` sigue apagando
 * las tres capas igual que apagaba la primera (`.atl-fondo`, en globals.css).
 */
export function FondoPlataforma() {
  return (
    <Fondo>
      <Rejilla paso={84} opacidad={0.35} duracion={15} />
      <Resplandor x="82%" y="18%" tamano={560} fuerza={0.06} duracion={18} />
      <MapaAburra animado rutas opacidad={0.34} />
      <Vinneta />
    </Fondo>
  );
}
