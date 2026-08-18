import { createClient } from "@/lib/supabase/client";
import { prepararDocumento } from "@/lib/imagen";
import type { DocType } from "./types";

const BUCKET = "at-courier-docs";

/**
 * Traduce lo que responde el almacenamiento a algo que se pueda leer parado en
 * una esquina. Antes subía tal cual el mensaje de Supabase —en inglés y
 * hablando de «mime types»— y quien lo veía solo entendía que no funcionaba.
 */
function enCristiano(error: { message?: string; statusCode?: string }): Error {
  const m = (error.message ?? "").toLowerCase();
  if (m.includes("mime") || m.includes("not supported")) {
    return new Error("Ese tipo de archivo no se puede subir. Manda una foto o un PDF.");
  }
  if (m.includes("exceeded") || m.includes("too large") || m.includes("payload")) {
    return new Error("El archivo pesa demasiado. Vuelve a tomar la foto con menos calidad.");
  }
  if (m.includes("row-level security") || m.includes("unauthorized") || m.includes("jwt")) {
    return new Error(
      "Tu sesión no tiene permiso para subir este documento. Cierra sesión, vuelve a entrar e inténtalo otra vez."
    );
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return new Error("Se cayó la conexión mientras subía. Inténtalo de nuevo.");
  }
  return new Error(error.message || "No se pudo subir el documento");
}

/**
 * Sube un documento del mensajero y lo deja registrado en revisión.
 *
 * La carpeta es el id del propio mensajero, y eso no es cosmético: tanto la
 * política de storage como at_register_courier_doc exigen que el primer tramo
 * de la ruta sea su auth.uid(). Sin eso, alguien podría registrar como suyo el
 * archivo de otra persona.
 *
 * La foto pasa antes por `prepararDocumento`: llega convertida a JPEG,
 * enderezada y reducida. Sin ese paso, cualquier foto de iPhone (HEIC) la
 * rechazaba el bucket, que es justamente por lo que ningún mensajero había
 * conseguido subir un solo documento.
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
  const listo = await prepararDocumento(file);

  const ext = listo.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${courierId}/${docType}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, listo, {
    cacheControl: "3600",
    upsert: false,
    contentType: listo.type || undefined,
  });
  if (uploadError) throw enCristiano(uploadError);

  const { error } = await supabase.rpc("at_register_courier_doc", {
    p_doc_type: docType,
    p_file_path: path,
    p_expires_on: expiresOn || null,
  });
  if (error) throw enCristiano(error);
}

/** URL temporal para mirar un documento. Corta a propósito: son datos sensibles. */
export async function signedDocUrl(filePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 5);
  return error || !data ? null : data.signedUrl;
}
