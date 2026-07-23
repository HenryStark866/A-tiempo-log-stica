// Navegación asistida del mensajero: preferencia Waze/Google Maps y
// ordenamiento de paradas. Feature flag para poder apagarla sin deploy de código.
export const NAV_HANDOFF_ENABLED = true;

export type NavProvider = "waze" | "gmaps";

export const NAV_PROVIDER_LABELS: Record<NavProvider, string> = {
  waze: "Waze",
  gmaps: "Google Maps",
};

const STORAGE_KEY = "at_nav_provider";

export function getNavProvider(): NavProvider | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "waze" || v === "gmaps" ? v : null;
}

export function saveNavProvider(p: NavProvider) {
  window.localStorage.setItem(STORAGE_KEY, p);
}

// Links universales: abren la app nativa si está instalada, o la web si no.
export function buildNavUrl(provider: NavProvider, address: string, city?: string | null): string {
  const dest = encodeURIComponent(city ? `${address}, ${city}` : address);
  return provider === "waze"
    ? `https://waze.com/ul?q=${dest}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

// Ordena las paradas sin geocodificación: agrupa por zona y dentro de cada zona
// por vía normalizada (misma calle/carrera queda contigua, con orden numérico).
// Cuando las guías tengan lat/lng, reemplazar por vecino más cercano.
export function orderRoute<T extends { recipient_address: string; at_zones?: { name: string } | null }>(
  guides: T[]
): T[] {
  return [...guides].sort((a, b) => {
    const za = a.at_zones?.name ?? "￿";
    const zb = b.at_zones?.name ?? "￿";
    if (za !== zb) return za.localeCompare(zb, "es");
    return normalizeStreet(a.recipient_address).localeCompare(normalizeStreet(b.recipient_address), "es", {
      numeric: true,
    });
  });
}

function normalizeStreet(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\b(carrera|kra\.?|cra\.?|cr\.?)\s*/g, "cra ")
    .replace(/\b(calle|cll\.?|cl\.?)\s*/g, "cll ")
    .replace(/\b(avenida|av\.?)\s*/g, "av ")
    .replace(/\b(transversal|tv\.?|trans\.?)\s*/g, "tv ")
    .replace(/\b(diagonal|dg\.?|diag\.?)\s*/g, "dg ")
    .trim();
}
