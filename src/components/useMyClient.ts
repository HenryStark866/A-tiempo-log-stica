"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import type { Client } from "@/lib/types";

/**
 * Devuelve el comercio de quien trabaja para él.
 *
 * Antes, una cuenta con rol cliente pero sin client_id quedaba bloqueada
 * esperando a que un admin la enlazara a mano. Ahora at_ensure_my_client la
 * autoaprovisiona con los datos que la persona dio al registrarse.
 *
 * El DUEÑO y el ASESOR llegan por caminos distintos a propósito:
 *
 *  - El dueño pasa por at_ensure_my_client, que CREA el comercio si falta.
 *  - El asesor solo lo lee. Autoaprovisionar desde su cuenta le dejaría fundar
 *    un comercio nuevo con sus datos el día que su jefe todavía no tenga uno,
 *    y quedarían dos tiendas donde debía haber una.
 *
 * Para los demás roles devuelve client = null sin llamar a nada: el personal de
 * A Tiempo no pertenece a ningún comercio.
 */
export function useMyClient() {
  const profile = useProfile();
  const esDueno = profile.role === "cliente";
  const esAsesor = profile.role === "asesor";

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(esDueno || esAsesor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!esDueno && !esAsesor) {
      setLoading(false);
      return;
    }
    let cancelado = false;
    const supabase = createClient();

    // El asesor lee su comercio con un select normal: el RLS de at_clients ya
    // solo le deja ver el suyo (id = at_my_client()).
    const consulta = esDueno
      ? supabase.rpc("at_ensure_my_client")
      : supabase.from("at_clients").select("*").eq("id", profile.client_id ?? "").maybeSingle();

    consulta.then(({ data, error }) => {
      if (cancelado) return;
      if (error) {
        setError(error.message);
      } else if (data) {
        // PostgREST puede devolver la fila suelta o dentro de un arreglo.
        const row = (Array.isArray(data) ? data[0] : data) as Client | undefined;
        if (row) setClient(row);
      }
      setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, [esDueno, esAsesor, profile.client_id]);

  return { client, clientId: client?.id ?? profile.client_id ?? null, loading, error };
}
