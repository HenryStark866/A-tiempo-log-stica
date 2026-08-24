import type { Zone } from "./types";

/** Misma normalización que public.at_norm en la base: minúsculas y sin tildes. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Ciudades del Área Metropolitana donde sí operamos, aunque el barrio exacto no
 * esté en el tarifario.
 *
 * Hace falta porque el tarifario lista SECTORES (El Poblado, Laureles, Castilla…),
 * no ciudades. Una dirección de "MEDELLIN" sin barrio no coincide con ninguna
 * cobertura, y antes se mostraba como "Fuera de cobertura" — que es falso y
 * alarmante: Medellín es el corazón de la operación. Lo correcto es decir que la
 * zona está por confirmar.
 */
export const CIUDADES_OPERADAS = [
  "Medellín",
  "Bello",
  "Itagüí",
  "Envigado",
  "Sabaneta",
  "La Estrella",
  "Caldas",
  "Copacabana",
  "Girardota",
  "Barbosa",
  "Rionegro",
  "Oriente Cercano",
  "Otra ciudad",
];

const CIUDADES_CUBIERTAS = CIUDADES_OPERADAS.map((c) => normalizeText(c));

export type ZoneStatus = "asignada" | "por_confirmar" | "fuera";

export interface ZoneResolution {
  zone: Zone | null;
  status: ZoneStatus;
}

function listar(valor: string | null | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((s) => normalizeText(s).trim())
    .filter(Boolean);
}

/**
 * Encuentra la zona que corresponde a una dirección.
 * Espejo en cliente de at_zone_for_city, para resolver sin ir al servidor.
 *
 * Resuelve en dos pasos, y el orden importa:
 *
 *  1. Barrios. Gana el sector MÁS LARGO, o sea el más específico: así
 *     "San Antonio de Prado" (Zona 5) le gana a "Prado Centro" (Zona 3), y
 *     "Girardota" (Zona 4) le gana a "Girardot" (Zona 3). Si empatan, decide
 *     el orden de la zona.
 *
 *  2. Ciudad, solo si ningún barrio coincidió. Va aparte y no como un sector
 *     más porque competiría con los barrios: una dirección de Belén casaría
 *     con "medellin" (8 letras) antes que con "belen" (5) y se cobraría la
 *     tarifa equivocada.
 */
export function zoneForText(zones: Zone[], text: string): Zone | null {
  const t = normalizeText(text);
  if (!t.trim()) return null;

  const ordered = [...zones].sort((a, b) => a.sort_order - b.sort_order);

  let mejor: { zone: Zone; precision: number } | null = null;
  for (const z of ordered) {
    for (const sector of listar(z.coverage)) {
      // El empate lo gana la primera zona por orden, de ahí el > estricto.
      if (t.includes(sector) && (!mejor || sector.length > mejor.precision)) {
        mejor = { zone: z, precision: sector.length };
      }
    }
  }
  if (mejor) return mejor.zone;

  for (const z of ordered) {
    if (listar(z.city_fallback).some((c) => t.includes(c))) return z;
  }
  return null;
}

/**
 * Resuelve zona Y estado de cobertura, distinguiendo tres casos:
 *  - asignada:     el sector aparece en el tarifario, hay tarifa
 *  - por_confirmar: estamos en el área metropolitana pero no reconocimos el sector
 *  - fuera:        la ciudad está fuera de nuestra operación
 */
export function resolveZone(zones: Zone[], city: string, address?: string): ZoneResolution {
  const zone = zoneForText(zones, `${city} ${address ?? ""}`);
  if (zone) return { zone, status: "asignada" };

  const c = normalizeText(city).trim();
  const cubierta = CIUDADES_CUBIERTAS.some((x) => c.includes(x));
  return { zone: null, status: cubierta ? "por_confirmar" : "fuera" };
}

/**
 * ¿La operación llega a esta ciudad?
 *
 * La respuesta sale ENTERA de `at_zones`: se busca la ciudad entre los sectores
 * y los respaldos por ciudad de las zonas ACTIVAS. Aquí no hay lista de
 * municipios escrita en el código —a diferencia de `CIUDADES_OPERADAS`, que es
 * fija— y esa es justo la gracia: el día que A Tiempo abra en Rionegro basta
 * con activar su zona en la base para que la app empiece a aceptarla, sin tocar
 * una línea ni volver a desplegar.
 *
 * Se compara por igualdad exacta del texto normalizado y no por «contiene»:
 * preguntar si «cali» aparece dentro de algún sector casaría con «Calasanz» y
 * daría por cubierta media Colombia.
 *
 * Lo que esto NO dice: que la ciudad esté cubierta no significa que una
 * dirección concreta tenga zona —para eso está `zoneForText`, que mira el
 * barrio—. Esta responde la pregunta gruesa, «¿vamos hasta allá?», que es la
 * que decide si un pedido se puede crear.
 */
export function ciudadCubierta(zones: Zone[], city: string): boolean {
  const c = normalizeText(city).trim();
  if (!c) return true; // sin ciudad escrita todavía no hay nada que reprochar
  if (zones.length === 0) return true; // aún cargando: no se bloquea a ciegas

  return zones.some(
    (z) => listar(z.coverage).includes(c) || listar(z.city_fallback).includes(c)
  );
}

export const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  asignada: "",
  por_confirmar: "Zona por confirmar",
  fuera: "Fuera de cobertura",
};

/** Lo que se le dice a quien intenta despachar fuera del Valle de Aburrá. */
export const MSG_FUERA_DE_COBERTURA =
  "Fuera de Cobertura: Actualmente solo realizamos entregas en el Área Metropolitana del Valle de Aburrá.";
