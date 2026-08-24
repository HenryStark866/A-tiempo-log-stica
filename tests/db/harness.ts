import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTS CONTRA LA BASE
 *
 * La lógica de negocio de YAM vive en Postgres (ADR-0001): 111 funciones y 55
 * políticas RLS. `npm run build` no las mira, así que hoy nada impide que una
 * migración rompa el cobro o abra los datos de un comercio a otro.
 *
 * Estos tests son ese filtro. Necesitan una base de verdad, y por eso se
 * saltan solos mientras no la haya: así CI sigue en verde y el día que exista
 * el staging se encienden sin tocar nada.
 *
 * ── Cómo levantarlos ──────────────────────────────────────────────────────
 *
 * Opción A, local (recomendada para desarrollar — no cuesta nada):
 *
 *     npx supabase@latest start
 *     npx supabase@latest db reset      # aplica las 78 migraciones
 *
 * Imprime las tres variables. Ponlas en `.env.local`:
 *
 *     SUPABASE_TEST_URL=http://127.0.0.1:54321
 *     SUPABASE_TEST_SERVICE_KEY=...
 *     SUPABASE_TEST_ANON_KEY=...
 *
 * Opción B, proyecto de staging en la nube: las mismas tres variables
 * apuntando ahí.
 *
 * ⚠️ NUNCA contra producción. `service_role` se salta RLS entera y estos tests
 * crean y borran filas. El guardia de abajo rechaza las URL conocidas de
 * producción, pero un guardia no sustituye a leer dos veces antes de pegar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const URL_TEST = process.env.SUPABASE_TEST_URL;
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;

/** Los refs de los proyectos de producción. Si aparecen, se para en seco. */
const PROHIBIDOS = ["uhbtivaepyhwfdvtpfjq", "kjfwlofcqtptedwfpddh"];

export const hayBase = Boolean(URL_TEST && SERVICE_KEY && ANON_KEY);

if (hayBase && PROHIBIDOS.some((ref) => URL_TEST!.includes(ref))) {
  throw new Error(
    `SUPABASE_TEST_URL apunta a un proyecto de PRODUCCIÓN (${URL_TEST}). ` +
      "Estos tests crean y borran filas y la llave service_role se salta RLS. " +
      "Usa `npx supabase start` o un proyecto de staging."
  );
}

/**
 * `describe` que se salta el bloque entero si no hay base configurada, y deja
 * dicho en la salida por qué. Un test saltado con motivo es información; un
 * test que no existe, no.
 */
export const describeDb = hayBase ? describe : describe.skip;

if (!hayBase) {
  // console.log y NO console.warn, a propósito: warn escribe en stderr, y
  // PowerShell con $ErrorActionPreference = "Stop" trata cualquier stderr de un
  // comando nativo como error fatal. El script de commit moría aquí con un
  // NativeCommandError, dando a entender que los tests habían fallado cuando en
  // realidad habían pasado todos.
  //
  // Un test saltado a propósito no es un error y no tiene por qué salir por el
  // canal de errores.
  console.log(
    "\n  [saltados] Tests de base de datos: falta SUPABASE_TEST_URL / " +
      "SUPABASE_TEST_SERVICE_KEY / SUPABASE_TEST_ANON_KEY.\n" +
      "             Ver el encabezado de tests/db/harness.ts para levantarlos.\n"
  );
}

/**
 * Cliente con `service_role`: se salta RLS. Solo para PREPARAR el escenario
 * (crear el comercio, el mensajero, la guía) y para limpiarlo al final.
 *
 * Nunca para comprobar permisos: con esta llave todo está permitido, así que
 * un test de RLS que la use pasa siempre y no prueba nada.
 */
export function clienteAdmin(): SupabaseClient {
  return createClient(URL_TEST!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente anónimo, el mismo que usa el navegador. Este es el que sirve para
 * comprobar RLS: si algo se ve desde aquí sin sesión, se ve desde internet.
 */
export function clienteAnonimo(): SupabaseClient {
  return createClient(URL_TEST!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente con la sesión de un usuario concreto. Es la única forma honesta de
 * probar una política RLS: entrar como entra la persona.
 */
export async function clienteComo(email: string, password: string): Promise<SupabaseClient> {
  const sb = clienteAnonimo();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`No se pudo entrar como ${email}: ${error.message}`);
  return sb;
}

/** Correo único por ejecución, para que dos corridas no se pisen. */
export function correoDePrueba(etiqueta: string): string {
  return `test-${etiqueta}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ejemplo.test`;
}

export const CLAVE_DE_PRUEBA = "Prueba-1234-segura";

/**
 * Crea un usuario ya confirmado y devuelve cómo entrar con él.
 *
 * `email_confirm: true` porque el flujo real pasa por un correo, y esperar un
 * correo en un test lo haría lento y frágil.
 */
export async function crearUsuario(
  admin: SupabaseClient,
  etiqueta: string,
  metadata: Record<string, unknown> = {}
): Promise<{ id: string; email: string; password: string }> {
  const email = correoDePrueba(etiqueta);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: CLAVE_DE_PRUEBA,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`No se pudo crear ${etiqueta}: ${error.message}`);
  return { id: data.user!.id, email, password: CLAVE_DE_PRUEBA };
}

/** Borra los usuarios creados por un test. Se llama siempre, aunque falle. */
export async function borrarUsuarios(admin: SupabaseClient, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));
}
