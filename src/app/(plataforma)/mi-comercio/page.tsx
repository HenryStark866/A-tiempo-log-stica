import { redirect } from "next/navigation";

/**
 * Mi comercio se fusionó con Mi perfil.
 *
 * Eran dos pantallas para la misma pregunta —«lo mío»— y el dueño de un
 * comercio tenía que acordarse de en cuál estaba cada cosa: su teléfono en
 * una, el de su negocio en la otra. Ahora todo vive en /mi-perfil.
 *
 * La ruta se queda como redirección y no se borra porque está enlazada desde
 * fuera de la app: en correos ya enviados y en la barra de direcciones de
 * quien la tenga guardada.
 */
export default function MiComercioPage() {
  redirect("/mi-perfil");
}
