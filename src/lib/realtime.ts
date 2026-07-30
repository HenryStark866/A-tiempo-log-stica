import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Suscripciones de Realtime que no pueden tumbar la app.
 *
 * EL FALLO QUE ESTO EVITA
 * `supabase.channel(topic)` NO crea un canal nuevo: si ya existe uno con ese
 * mismo nombre, devuelve ese. Y `.on("postgres_changes", …)` sobre un canal que
 * ya llamó a `subscribe()` lanza una excepción. Como la llamada vive dentro de
 * un useEffect, esa excepción sube al error boundary y se lleva la pantalla
 * entera por delante.
 *
 * Pasa con dos montajes del mismo componente (la campana está en el header del
 * teléfono y en la barra del escritorio a la vez) y también con uno solo, porque
 * `removeChannel` es asíncrono: al volver a entrar en una sección, el canal
 * anterior todavía está vivo y el nuevo `channel()` devuelve ese.
 *
 * Aquí se resuelve de raíz dándole a cada suscripción un nombre irrepetible, así
 * nunca hay dos peleando por el mismo. Y por si acaso queda el try/catch: el
 * tiempo real es un extra —el sondeo cubre lo mismo con retraso—, así que si
 * falla lo correcto es quedarse sin él, no dejar al mensajero mirando una
 * pantalla de error.
 */

let contador = 0;

export interface FiltroPostgres {
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema: string;
  table: string;
  filter?: string;
}

/**
 * Escucha cambios de una tabla. Devuelve la función de limpieza que hay que
 * retornar desde el useEffect; llamarla siempre es seguro.
 */
export function escucharTabla<T>(
  supabase: SupabaseClient,
  base: string,
  filtro: FiltroPostgres,
  alCambiar: (fila: T) => void,
  alEstado?: (enVivo: boolean) => void
): () => void {
  const nombre = `${base}-${++contador}`;

  try {
    const canal = supabase
      .channel(nombre)
      .on(
        // El tipado de postgres_changes en supabase-js es más estrecho que lo
        // que acepta en tiempo de ejecución; el filtro ya va validado arriba.
        "postgres_changes" as never,
        filtro as never,
        (payload: { new: T }) => {
          try {
            alCambiar(payload.new);
          } catch {
            /* un manejador roto no puede llevarse la suscripción ni la pantalla */
          }
        }
      )
      .subscribe((estado) => alEstado?.(estado === "SUBSCRIBED"));

    return () => {
      alEstado?.(false);
      try {
        supabase.removeChannel(canal);
      } catch {
        /* ya estaba cerrado */
      }
    };
  } catch {
    // Sin tiempo real la app sigue funcionando: los datos llegan por el sondeo.
    alEstado?.(false);
    return () => {};
  }
}
