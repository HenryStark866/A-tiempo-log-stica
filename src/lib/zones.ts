import type { Zone } from "./types";

/** Misma normalización que public.at_norm en la base: minúsculas y sin tildes. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Encuentra la zona cuya cobertura menciona la ciudad/dirección dada.
 * Espejo en cliente de at_zone_for_city, para sugerir la zona sin ir al servidor.
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
