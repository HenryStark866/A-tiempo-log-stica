/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEJAR UNA FOTO LISTA PARA SUBIR
 *
 * El mensajero le toma la foto a la cédula con el teléfono que tenga, en la
 * calle y con datos móviles. Eso llega de tres formas que el almacenamiento
 * rechaza de plano:
 *
 *   · Un iPhone entrega HEIC. El bucket solo acepta JPEG, PNG, WEBP y PDF, así
 *     que la subida moría con un mensaje en inglés sobre «mime type» y la
 *     persona solo veía que no pasaba nada.
 *   · Una cámara de 50 MP entrega un JPEG de 12 MB y el límite son 10.
 *   · Muchas cámaras guardan la foto de lado y la orientación real va en un
 *     campo EXIF aparte: quien revisa termina con una cédula acostada.
 *
 * Todo eso se arregla en el navegador antes de subir: se decodifica (Safari sí
 * sabe leer HEIC aunque el servidor no lo acepte), se endereza, se reduce a un
 * lado máximo razonable y se vuelve a codificar en JPEG. Una cédula a 2000 px
 * se lee perfectamente y pesa unas diez veces menos, que en la calle es la
 * diferencia entre subirla y rendirse.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Lo suficiente para leer un número de cédula sin mandar 12 MB por datos. */
const LADO_MAXIMO = 2000;
const CALIDAD = 0.85;

/** El mismo límite que tiene puesto el bucket. */
export const LIMITE_BYTES = 10 * 1024 * 1024;

function pesaDemasiado(file: File): boolean {
  return file.size > LIMITE_BYTES;
}

const ERROR_PESO =
  "El archivo pesa más de 10 MB. Vuelve a tomar la foto o mándala con menos calidad.";

/**
 * Convierte cualquier imagen que el navegador sepa leer en un JPEG liviano.
 * Un PDF pasa derecho: no es una imagen y ya viene comprimido.
 *
 * Si la conversión falla —un navegador viejo, un formato que ni el navegador
 * decodifica— se devuelve el archivo original en vez de bloquear a la persona:
 * el bucket también acepta HEIC, así que todavía tiene una oportunidad de
 * llegar.
 */
export async function prepararDocumento(file: File): Promise<File> {
  if (file.type === "application/pdf") {
    if (pesaDemasiado(file)) throw new Error(ERROR_PESO);
    return file;
  }

  try {
    return await aJpeg(file);
  } catch {
    if (pesaDemasiado(file)) throw new Error(ERROR_PESO);
    return file;
  }
}

async function aJpeg(file: File): Promise<File> {
  // `from-image` es lo que aplica la orientación EXIF; sin eso, la foto que en
  // la galería se ve derecha se sube acostada.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;

  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, "image/jpeg", CALIDAD)
  );
  if (!blob) throw new Error("No se pudo convertir la imagen");

  const nombre = file.name.replace(/\.[^.]+$/, "") || "documento";
  return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
}
