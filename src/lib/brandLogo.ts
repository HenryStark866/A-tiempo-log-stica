import { createClient } from "@/lib/supabase/client";

const BUCKET = "at-brand-logos";

/** Lo que aguanta la vitrina sin que la portada se arrastre al cargar. */
const MAX_BYTES = 512 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export const LOGO_ACEPTA = TIPOS.join(",");

/**
 * Sube el logo de un comercio y lo deja guardado en su ficha.
 *
 * El bucket es público a propósito: la portada lee estos logos sin sesión, y
 * una URL firmada caducaría y dejaría la animación con huecos. Solo entran aquí
 * logos, que son material que la marca ya publica.
 *
 * El archivo va en una carpeta con el id del comercio, que es lo que miran las
 * políticas del bucket: cada comercio escribe únicamente en la suya.
 */
export async function subirLogoDeMarca(clientId: string, file: File): Promise<string> {
  if (!TIPOS.includes(file.type)) {
    throw new Error("El logo debe ser PNG, JPG, WEBP o SVG.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("El logo pesa más de 512 KB. Súbelo más liviano.");
  }

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  // El timestamp evita que una caché vieja siga sirviendo el logo anterior.
  const path = `${clientId}/${Date.now()}.${ext}`;

  const { error: errorSubida } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (errorSubida) throw errorSubida;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;

  const { error: errorGuardado } = await supabase.rpc("at_set_client_logo", {
    p_client_id: clientId,
    p_logo_url: url,
  });
  if (errorGuardado) throw errorGuardado;

  return url;
}

/** Quita el logo de la ficha. El archivo queda en el bucket, sin referencia. */
export async function quitarLogoDeMarca(clientId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("at_set_client_logo", {
    p_client_id: clientId,
    p_logo_url: null,
  });
  if (error) throw error;
}

/** Autoriza o retira la marca de la portada pública. */
export async function autorizarVitrina(clientId: string, mostrar: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("at_set_client_landing", {
    p_client_id: clientId,
    p_show: mostrar,
  });
  if (error) throw error;
}
