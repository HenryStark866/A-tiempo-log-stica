"use client";

import { useEffect } from "react";
import { instalarCapturaGlobal } from "@/lib/observabilidad";

/**
 * Engancha los errores que ningún error boundary de React llega a ver: los de
 * código asíncrono suelto y las promesas sin `catch`.
 *
 * Esos son justamente los que más duelen aquí, porque no rompen la pantalla —no
 * hay boundary que salte, la persona no ve nada— pero dejan la app a medias: un
 * `watchPosition` que falla y deja de reportar posición, una suscripción de
 * Realtime que se cae, un `fetch` a Supabase que se pierde. El mensajero cree
 * que está trabajando y el CEDI no lo ve en el mapa.
 *
 * Va en un componente propio, montado en el layout raíz, para que cubra también
 * las pantallas públicas: el rastreo y el pago los abre gente sin cuenta y sin
 * forma de contarnos que algo se rompió.
 *
 * No pinta nada.
 */
export function CapturaDeErrores() {
  useEffect(() => instalarCapturaGlobal(), []);
  return null;
}
