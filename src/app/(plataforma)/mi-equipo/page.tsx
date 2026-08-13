import { redirect } from "next/navigation";

/**
 * Sedes y equipo se juntaron dentro de «Mi comercio»: son las dos palancas con
 * las que el dueño reparte su propio negocio —dónde se despacha y quién puede
 * despachar— y tenerlas en pantallas sueltas obligaba a saltar entre tres
 * sitios para configurar una sola cosa.
 *
 * Esta ruta se queda como redirección y no se borra porque ya circula: es el
 * enlace de la notificación que le llega al dueño cuando un asesor pide
 * unirse a su equipo. Sin esto, esa notificación llevaría a un 404 justo
 * cuando alguien está esperando que lo habiliten.
 */
export default function MiEquipoRedirige() {
  redirect("/mi-comercio#equipo");
}
