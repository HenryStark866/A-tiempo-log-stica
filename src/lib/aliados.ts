/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS ALIADOS
 *
 * Marcas que no son nuestras y que aparecen en pantallas públicas. Van aquí y
 * no escritas a mano en cada sitio por la misma razón que `marca.ts`: el texto
 * de un aliado es un compromiso con un tercero, y si cambia tiene que cambiar
 * en un solo archivo.
 *
 * Regla del acuerdo con Beyond Access: los textos se pueden adaptar a nuestra
 * voz, pero **el nombre de la iniciativa no se altera** — ni traducido, ni
 * abreviado, ni partido. Se escribe «Beyond Access», siempre así.
 *
 * Los SVG viven en `public/aliados/beyond-access/`. Son los archivos que nos
 * entregaron, sin tocar. Hay tres piezas y cada una tiene su sitio:
 *
 *   · `sello.svg`          — el sello a color, con el círculo granadilla ya
 *                            dentro. Sirve sobre fondo claro y sobre fondo
 *                            oscuro, porque trae su propio fondo.
 *   · `sello-tinta.svg`    — el mismo sello en tinta (#1C1015), sin círculo.
 *                            Para cuando el color no cabe: un pie discreto.
 *   · `sello-negativo.svg` — crema y granadilla, sin fondo. Para oscuro.
 *   · `logo-*.svg`         — el logotipo horizontal con el nombre. Solo donde
 *                            haya ancho de sobra; en el pie no cabe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const BEYOND_ACCESS = {
  nombre: "Beyond Access",

  /**
   * El hashtag de la iniciativa. Para redes, no para la app — vive aquí
   * porque es parte del mismo paquete de marca y así no se escribe de dos
   * formas distintas según quién publique.
   */
  hashtag: "#BeyondAccess",

  /** Quien respalda la iniciativa. Aparece en el párrafo largo. */
  respaldo: "Interledger Foundation",

  /**
   * Los tres textos tal como nos los entregaron, adaptados a nuestra voz
   * donde hacía falta decir quiénes somos. El nombre, intacto.
   */
  textos: {
    /** Una línea. Va en el pie de las pantallas públicas. */
    corto:
      "Hacemos parte de Beyond Access, la iniciativa que trabaja para que el acceso financiero se convierta en apropiación real en Colombia.",

    /** Para publicar. No lo pinta la app: lo usa quien maneja las redes. */
    redes:
      "Firmamos el compromiso de Beyond Access: participar, compartir, diseñar para la gente, construir puentes y dar visibilidad. Porque el acceso fue solo la semilla. #BeyondAccess",

    /** El párrafo de prensa. Va en la sección de la pantalla de inicio. */
    boilerplate:
      "Beyond Access es una iniciativa apoyada por la Interledger Foundation que reúne a fintechs, entidades, academia y comunidades en Colombia alrededor de una pregunta: por qué el acceso financiero no se convirtió en adopción. A través de encuentros, investigación y un hackathon de pagos abiertos, la iniciativa trabaja para que tener una cuenta se convierta en usarla, confiar en ella y hacerla propia.",
  },

  /**
   * Las tintas de la iniciativa, con el nombre de fruta que les puso ella.
   * No se mezclan con el naranja de YAM: la única que usamos en pantalla es
   * granadilla, y solo dentro del bloque de Beyond Access, para que se lea
   * como una marca invitada y no como un segundo acento nuestro.
   */
  colores: {
    lulo: "#7FA613",
    granadilla: "#E8A317",
    guayaba: "#E8666D",
    mandarina: "#E85D04",
    pitahaya: "#E62E6B",
    mora: "#7C3AED",
    semilla: "#1C1015",
    guanabana: "#F3E7CE",
  },

  /** Los archivos, con la ruta ya servible desde `public/`. */
  assets: {
    sello: "/aliados/beyond-access/sello.svg",
    selloTinta: "/aliados/beyond-access/sello-tinta.svg",
    selloNegativo: "/aliados/beyond-access/sello-negativo.svg",
    logoTinta: "/aliados/beyond-access/logo-tinta.svg",
    logoNegativo: "/aliados/beyond-access/logo-negativo.svg",
  },

  /**
   * El sitio de la iniciativa. Queda en `null` a propósito hasta que llegue
   * la URL definitiva en el correo con el paquete de logos: un enlace
   * inventado en una pantalla pública es peor que no tener enlace, y el
   * componente ya sabe pintarse sin él.
   */
  sitio: null as string | null,
} as const;
