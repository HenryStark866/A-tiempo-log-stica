/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL TIEMPO
 *
 * Toda fecha y toda hora que esta app muestra o calcula pasan por aquí, y
 * todas hablan de una sola zona: la de Medellín. No es un detalle cosmético,
 * son tres problemas distintos que ya se estaban viendo en pantalla:
 *
 *  1. La base corre en UTC. Su `current_date` cambia de día a las 7:00 p. m.
 *     hora de Medellín, así que «guías creadas hoy» se reiniciaba a cero
 *     mientras la operación seguía trabajando. Eso se arregla en SQL
 *     (migración 0041), pero el lado del navegador tenía el mismo vicio:
 *     `new Date().toISOString().slice(0,10)` da la fecha en UTC, o sea que
 *     después de las 7 p. m. una recogida se programaba para mañana sola.
 *
 *  2. Las columnas `date` de Postgres llegan como "2026-08-05", sin hora.
 *     `new Date("2026-08-05")` las interpreta como medianoche UTC, que en
 *     Colombia es el día anterior a las 7 p. m.: la fecha de recogida se
 *     mostraba corrida un día hacia atrás. Por eso `formatDate` distingue
 *     entre una fecha sola y un instante, y las trata distinto.
 *
 *  3. El teléfono del mensajero puede estar en cualquier zona (o traerla mal
 *     configurada de fábrica). Fijando `timeZone` no importa: la app siempre
 *     muestra la hora de la operación, no la del aparato.
 *
 * Lo único que sigue dependiendo del reloj del aparato es el instante en sí.
 * De eso se encarga `Reloj.tsx`, que lo contrasta contra el del servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * La operación entera vive en Medellín. Se usa el nombre IANA y no un desfase
 * fijo de −5: si algún día vuelve el horario de verano en Colombia (existió
 * hasta 1993), el nombre lo absorbe y un "-05:00" escrito a mano no.
 */
export const ZONA = "America/Bogota";

/** "2026-08-05" — una columna `date`, sin hora ni zona. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte lo que llega de la base en un instante + la zona con la que hay
 * que leerlo.
 *
 * Una fecha sola no es un instante: «5 de agosto» es el 5 de agosto en
 * cualquier parte del mundo, y forzarla a la zona de Medellín la correría un
 * día. Se ancla en UTC y se formatea en UTC, que es la única manera de que el
 * número que se ve sea el mismo que está guardado.
 */
function interpretar(valor: string): { instante: Date; zona: string } {
  if (SOLO_FECHA.test(valor)) {
    return { instante: new Date(`${valor}T00:00:00Z`), zona: "UTC" };
  }
  return { instante: new Date(valor), zona: ZONA };
}

function esValida(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** «05 ago 2026» */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const { instante, zona } = interpretar(value);
  if (!esValida(instante)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: zona,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(instante);
}

/** «05 ago, 5:11 p. m.» — hora de Medellín, sea cual sea la del teléfono. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const { instante, zona } = interpretar(value);
  if (!esValida(instante)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: zona,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
}

/** «5:11 p. m.» — para cuando el día ya se sabe por el contexto. */
export function formatHora(value: string | null | undefined): string {
  if (!value) return "—";
  const { instante } = interpretar(value);
  if (!esValida(instante)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    hour: "numeric",
    minute: "2-digit",
  }).format(instante);
}

/**
 * La fecha de hoy en Medellín, en el formato "YYYY-MM-DD" que esperan las
 * columnas `date` y los `<input type="date">`.
 *
 * Reemplaza a `new Date().toISOString().slice(0, 10)`, que devuelve la fecha
 * en UTC: entre las 7 p. m. y la medianoche daba el día siguiente.
 */
export function hoyEnColombia(referencia: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referencia);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/**
 * El desfase de Medellín contra UTC, en el formato "-05:00" que entienden tanto
 * `new Date()` como Postgres.
 *
 * Se pregunta en vez de escribirse a mano por lo mismo que `ZONA` es un nombre
 * IANA y no un número: si vuelve el horario de verano, esto lo absorbe solo.
 */
function desfaseDeColombia(referencia: Date): string {
  const nombre = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA,
    timeZoneName: "longOffset",
  })
    .formatToParts(referencia)
    .find((p) => p.type === "timeZoneName")?.value;
  const desfase = nombre?.replace("GMT", "") ?? "";
  return /^[+-]\d{2}:\d{2}$/.test(desfase) ? desfase : "-05:00";
}

/**
 * El instante exacto en que arrancó el día de hoy en Medellín.
 *
 * Es lo que necesita cualquier filtro de «hoy» sobre una columna `timestamptz`:
 * comparar contra `new Date().toISOString().slice(0,10)` traería el día en UTC,
 * que entre las 7 p. m. y la medianoche ya es el de mañana y deja por fuera
 * cinco horas de operación.
 */
export function inicioDeHoyEnColombia(referencia: Date = new Date()): string {
  return `${hoyEnColombia(referencia)}T00:00:00${desfaseDeColombia(referencia)}`;
}

/**
 * El primer día del mes en curso, en Medellín. Es el arranque por defecto del
 * período de facturación.
 *
 * Antes se armaba con `new Date(a, m, 1).toISOString()`, que construye la
 * medianoche local y la pasa a UTC: en Colombia eso cae a las 7 p. m. del
 * último día del mes ANTERIOR, y el período de facturación arrancaba un día
 * antes de tiempo.
 */
export function primerDiaDelMes(referencia: Date = new Date()): string {
  return `${hoyEnColombia(referencia).slice(0, 7)}-01`;
}

/**
 * Las dos piezas del reloj de la barra, ya en hora de Medellín.
 *
 * Van separadas y no en una sola cadena porque en pantalla se muestran con
 * pesos distintos: la hora manda, la fecha acompaña.
 */
export function partesDelReloj(instante: Date): {
  hora: string;
  /** «mié, 5 de ago» — para la barra lateral, donde sobra el ancho. */
  fecha: string;
  /** «5 ago» — para la cabecera del teléfono, donde no sobra nada. */
  fechaCorta: string;
} {
  const en = (opciones: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, ...opciones }).format(instante);

  return {
    hora: en({ hour: "numeric", minute: "2-digit", second: "2-digit" }),
    fecha: en({ weekday: "short", day: "numeric", month: "short" }),
    fechaCorta: en({ day: "numeric", month: "short" }),
  };
}
