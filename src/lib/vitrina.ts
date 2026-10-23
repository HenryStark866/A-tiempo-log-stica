/**
 * Lectura pública de la vitrina (portada `/`).
 *
 * La migración 0143 deja a `anon` leer SOLO estas columnas. Pedir cualquier
 * otra (o `*`) hace que PostgREST responda 401 «permission denied» y la
 * portada se queda sin catálogo real. Si algún día la vitrina necesita otra
 * columna, primero va la migración (avisando a Henry) y después este archivo.
 *
 *   at_products → id, client_id, sku, name, description, price, extra, active
 *   at_clients  → id, business_name, city, phone, logo_url, active
 */
import type { MockProduct } from "@/data/mockProducts";
import type { ExtraProducto } from "@/lib/inventario";

export const COLUMNAS_PUBLICAS_PRODUCTO = [
  "id",
  "client_id",
  "sku",
  "name",
  "description",
  "price",
  "extra",
  "active",
] as const;

export const COLUMNAS_PUBLICAS_COMERCIO = [
  "id",
  "business_name",
  "city",
  "phone",
  "logo_url",
  "active",
] as const;

/**
 * `!inner`: solo salen productos cuyo comercio también pasa la RLS anónima
 * (comercio activo). Un comercio desactivado no sigue vendiendo en la portada.
 */
export const SELECT_VITRINA_PUBLICA =
  "id, client_id, sku, name, description, price, extra, " +
  "at_clients!inner(id, business_name, city, phone, logo_url)";

/** Cuántos productos reales trae la portada. */
export const LIMITE_VITRINA = 60;

/**
 * Desde cuántos productos reales se deja de mostrar el catálogo de muestra.
 * Antes era 6: con 5 productos activos en producción la portada mostraba las
 * marcas de ejemplo y escondía las reales.
 */
export const MIN_PRODUCTOS_REALES = 1;

/** Imagen neutra cuando el producto no trae foto o la foto no carga. */
export const IMAGEN_SIN_FOTO = "/vitrina/producto-sin-foto.svg";
// Antes se usaba una foto genérica de Unsplash (un reloj) para todo producto
// sin foto, lo que hacía pasar por real una imagen que no era del comercio.
// Se conserva por si se quiere volver a ella:
// export const IMAGEN_GENERICA_LEGADO =
//   "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80";

export interface ComercioPublico {
  id: string;
  business_name: string | null;
  city: string | null;
  phone: string | null;
  logo_url: string | null;
}

export interface FilaVitrina {
  id: string;
  client_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | string | null;
  extra: ExtraProducto | null;
  at_clients: ComercioPublico | ComercioPublico[] | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function slugComercio(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tienda"
  );
}

/** Convierte una fila de la API pública en la forma que pintan las tarjetas. */
export function mapearFilaVitrina(fila: FilaVitrina): MockProduct {
  const comercio = Array.isArray(fila.at_clients) ? fila.at_clients[0] ?? null : fila.at_clients;
  const extra: ExtraProducto = fila.extra ?? {};
  const nombreComercio = texto(comercio?.business_name) ?? "Comercio Aliado";

  return {
    id: fila.id,
    client_id: fila.client_id,
    name: fila.name,
    sku: fila.sku || "SKU-PROD",
    description: fila.description || "Producto disponible en tienda local.",
    price: Number(fila.price) || 0,
    image_url:
      texto(extra.image_url) ??
      texto(extra.foto) ??
      texto(extra.imagen) ??
      texto(extra.image) ??
      texto(comercio?.logo_url) ??
      IMAGEN_SIN_FOTO,
    store_name: nombreComercio,
    store_slug: slugComercio(nombreComercio),
    store_badge: "Comercio Verificado",
    category: texto(extra.category) ?? texto(extra.categoria) ?? "General",
    store_phone: texto(comercio?.phone) ?? "+573000000000",
    store_location: texto(comercio?.city) ?? "Medellín, Antioquia",
    extra,
  };
}
