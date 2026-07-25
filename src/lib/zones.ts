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
const CIUDADES_CUBIERTAS = [
  "medellin",
  "bello",
  "itagui",
  "envigado",
  "sabaneta",
  "la estrella",
  "caldas",
  "copacabana",
  "girardota",
];

export type ZoneStatus = "asignada" | "por_confirmar" | "fuera";

export interface ZoneResolution {
  zone: Zone | null;
  status: ZoneStatus;
}

/**
 * Encuentra la zona cuya cobertura menciona la ciudad/dirección dada.
 * Espejo en cliente de at_zone_for_city, para resolver sin ir al servidor.
 */
export function zoneForText(zones: Zone[], text: string): Zone | null {
  const t = normalizeText(text);
  if (!t.trim()) return null;
  const ordered = [...zones].sort((a, b) => a.sort_order - b.sort_order);
  for (const z of ordered) {
    const sectores = (z.coverage ?? "")
      .split(",")
      .map((s) => normalizeText(s).trim())
      .filter(Boolean);
    if (sectores.some((s) => t.includes(s))) return z;
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

export const ZONE_STATUS_LABELS: Record<ZoneStatus, string> = {
  asignada: "",
  por_confirmar: "Zona por confirmar",
  fuera: "Fuera de cobertura",
};
