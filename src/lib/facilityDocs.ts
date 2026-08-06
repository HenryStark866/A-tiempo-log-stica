import { createClient } from "@/lib/supabase/client";
import type { FacilityDocType } from "./types";

const BUCKET = "at-facility-docs";

/**
 * Sube un documento de la solicitud de CEDI y lo deja en revisión.
 *
 * Mismo patrón que uploadCourierDoc: la carpeta es el id de quien solicita, y
 * eso lo exigen tanto la política de storage como at_register_facility_doc.
 * No se guarda URL firmada — son documentos de identidad y de propiedad, se
 * firma al momento de verlos, no se deja una URL larga circulando.
 */
export async function uploadFacilityDoc(
  applicantId: string,
  docType: FacilityDocType,
  file: File
): Promise<void> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${applicantId}/${docType}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc("at_register_facility_doc", {
    p_doc_type: docType,
    p_file_path: path,
  });
  if (error) throw error;
}

export async function signedFacilityDocUrl(filePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 5);
  return error || !data ? null : data.signedUrl;
}
