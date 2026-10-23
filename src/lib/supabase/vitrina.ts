"use client";

import { createClient as crearClienteSupabase, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de la vitrina pública: SIEMPRE como `anon`, aunque haya sesión.
 *
 * La migración 0143 abre la lectura de productos y comercios solo al rol
 * `anon`. El cliente normal (`./client`) manda el JWT de quien tenga sesión
 * abierta, y entonces la consulta corre como `authenticated`: un comercio
 * ve solo sus productos, un comprador no ve ninguno y la portada cae al
 * catálogo de muestra. Este cliente no guarda ni lee sesión, así que todo
 * visitante —con o sin cuenta— ve la misma vitrina, con los mismos permisos
 * mínimos.
 *
 * Solo para LEER la vitrina. Nada que escriba debe usar este cliente.
 */
let cliente: SupabaseClient | null = null;

export function createVitrinaClient(): SupabaseClient {
  if (!cliente) {
    cliente = crearClienteSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          // Llave propia: no comparte almacenamiento con el cliente con sesión.
          storageKey: "yam-vitrina-anon",
        },
      }
    );
  }
  return cliente;
}
