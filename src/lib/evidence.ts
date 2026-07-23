import { createClient } from "@/lib/supabase/client";

const BUCKET = "at-delivery-evidence";

// Sube la foto de evidencia al bucket privado y devuelve una URL firmada de larga
// duración (1 año) para que quede legible desde el detalle de guía sin exponer el bucket.
export async function uploadDeliveryEvidence(guideId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${guideId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !data) throw signError ?? new Error("No se pudo generar el enlace de la evidencia");

  return data.signedUrl;
}
