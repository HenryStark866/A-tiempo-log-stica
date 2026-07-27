import { createClient } from "@/lib/supabase/client";
import type { DocType } from "./types";

const BUCKET = "at-courier-docs";

/**
 * Sube un documento del mensajero y lo deja registrado en revisión.
 *
 * La carpeta es el id del propio mensajero, y eso no es cosmético: tanto la
 * política de storage como at_register_courier_doc exigen que el primer tramo
 * de la ruta sea su auth.uid(). Sin eso, alguien podría registrar como suyo el
 * archivo de otra persona.
 *
 * A diferencia de la evidencia de entrega, aquí NO se guarda una URL firmada:
 * son documentos de identidad, y una URL de un año circulando en la base es
 * una fuga esperando a pasar. Se guarda la ruta y se firma al momento de verla.
 */
export async function uploadCourierDoc(
  courierId: string,
  docType: DocType,
  file: File,
  expiresOn?: string | null
): Promise<void> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${courierId}/${docType}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc("at_register_courier_doc", {
    p_doc_type: docType,
    p_file_path: path,
    p_expires_on: expiresOn || null,
  });
  if (error) throw error;
}

/** URL temporal para mirar un documento. Corta a propósito: son datos sensibles. */
export async function signedDocUrl(filePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 5);
  return error || !data ? null : data.signedUrl;
}
