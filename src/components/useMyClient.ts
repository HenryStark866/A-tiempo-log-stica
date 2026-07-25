"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import type { Client } from "@/lib/types";

/**
 * Devuelve el comercio del cliente, creándolo si todavía no existe.
 *
 * Antes, una cuenta con rol cliente pero sin client_id quedaba bloqueada
 * esperando a que un admin la enlazara a mano. Ahora at_ensure_my_client la
 * autoaprovisiona con los datos que la persona dio al registrarse.
 *
 * Para roles que no son cliente devuelve client = null sin llamar a nada.
 */
export function useMyClient() {
  const profile = useProfile();
  const esCliente = profile.role === "cliente";

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(esCliente);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!esCliente) {
      setLoading(false);
      return;
    }
    let cancelado = false;
    const supabase = createClient();

    supabase.rpc("at_ensure_my_client").then(({ data, error }) => {
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
  }, [esCliente]);

  return { client, clientId: client?.id ?? profile.client_id ?? null, loading, error };
}
