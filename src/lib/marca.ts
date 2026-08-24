/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA MARCA
 *
 * Son dos nombres y conviene no confundirlos, porque aparecen en la misma
 * pantalla y significan cosas distintas:
 *
 *   · A Tiempo Logística (ATL) — la empresa. Es quien tiene la marca
 *     registrada, quien firma las facturas, quien responde por el paquete y
 *     quien figura como remitente en los rótulos.
 *
 *   · YAM — la plataforma. Es el producto que se instala en el teléfono del
 *     mensajero y en el computador del comercio. Es marca registrada de ATL.
 *
 * Regla para elegir: si la frase la diría un abogado o va en un documento que
 * viaja pegado a una caja, es ATL. Si es algo con lo que la persona interactúa
 * —abrir la app, iniciar sesión, recibir una notificación—, es YAM.
 *
 * ── De dónde sale el nombre ──────────────────────────────────────────────
 *
 * El «yam» (en mongol örtöö, «puesto de relevo») fue la red de postas
 * del Imperio Mongol. Estaciones cada 32-64 km donde el mensajero no descansaba:
 * entregaba el mensaje, cambiaba de caballo y seguía. Así cubrían 200-300 km al
 * día en el siglo XIII.
 *
 * Dos detalles de ese sistema son, literalmente, este software:
 *
 *   · La paiza (gerege, «lo que da testimonio») era la tablilla que el
 *     mensajero mostraba en cada posta para que le dieran caballo y comida.
 *     Una guía de transporte que se valida en cada punto del trayecto.
 *
 *   · Marco Polo contó que los corredores llevaban cinturones con cascabeles,
 *     para que en la posta siguiente los oyeran llegar y tuvieran el relevo
 *     listo antes de verlos. Una notificación anticipada.
 *
 * No es decoración: el CEDI es la posta, la guía es la paiza y la campana es
 * el cascabel. Por eso el nombre.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const MARCA = {
  /** La plataforma. Lo que la gente abre. */
  app: "YAM",
  /** Va debajo del logotipo. Corto a propósito: tiene que caber en la barra. */
  descriptor: "MENSAJERÍA",
  /** Para títulos donde «YAM» solo no dice de qué se trata. */
  appLargo: "YAM — Red de mensajería",

  /**
   * El eslogan. En mongol, no en español: «örtöö» es la posta misma, la
   * palabra de la que sale el nombre. Va en minúsculas y sin traducir a
   * propósito —como un nombre propio—, con la traducción al lado para quien
   * no conoce la historia. Vive en el splash de arranque (Splash.tsx) y en
   * cualquier pantalla que necesite decir de un vistazo qué es YAM sin
   * repetir la explicación entera de arriba.
   */
  eslogan: "örtöö · la posta siguiente",

  /** La empresa. Lo que va en los papeles. */
  empresa: "A Tiempo Logística",
  empresaCorto: "ATL",

  /** El respaldo, para las pantallas públicas. */
  firma: "por A Tiempo Logística",

  /**
   * Prefijo de los números de guía. Se queda en ATL y no pasa a YAM: lo emite
   * la base de datos, viaja impreso en rótulos que ya están pegados a cajas en
   * circulación, y quien responde por ese paquete es la empresa, no la app.
   * Cambiarlo rompería el rastreo de todo lo que ya salió a la calle.
   */
  prefijoGuia: "ATL",

  ciudad: "Medellín, Colombia",

  /**
   * Quién construyó la plataforma. ATL es la dueña del negocio y de la marca;
   * CDH Maker IT es quien hace la tecnología. Son dos empresas distintas y en
   * el pie aparecen como tales, no mezcladas en una sola frase.
   */
  desarrollador: "CDH Maker IT",
  desarrolladorUrl: "https://cdh-maker-portafolio.web.app/",

  /**
   * Año del aviso de copyright. Fijo y a mano, no `new Date().getFullYear()`:
   * el pie se pinta en pantallas que son componentes de cliente, y el año
   * calculado en el servidor y en el navegador puede no coincidir en el
   * cambio de año — React lo cuenta como error de hidratación.
   */
  anioCopyright: 2026,
} as const;

/** Ejemplo de guía para los campos de búsqueda y rastreo. */
export const GUIA_EJEMPLO = `${MARCA.prefijoGuia}-100008`;
