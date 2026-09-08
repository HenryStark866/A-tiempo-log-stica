/**
 * Que NINGUNA tabla del negocio nazca abierta.
 *
 * ── El fallo que este test caza ───────────────────────────────────────────
 *
 * RLS es la única capa de autorización de esta app (ADR-0001): el navegador
 * habla directo con Supabase. Una tabla nueva a la que se le olvida el `alter
 * table ... enable row level security` no da error, no rompe ninguna pantalla
 * y funciona perfectamente — para todo el mundo, incluida la gente de otro
 * comercio. Es el fallo más caro posible y el que menos se nota.
 *
 * Los otros tests de RLS comprueban tablas CONCRETAS, una por una. Este
 * comprueba la lista entera, se llame como se llame la tabla de mañana. Es la
 * diferencia entre proteger lo que ya sabemos y proteger lo que todavía no
 * existe.
 *
 * ── La lista blanca ───────────────────────────────────────────────────────
 *
 * Hay cinco tablas con RLS activo y SIN políticas. Eso es correcto para ellas
 * —están cerradas del todo y solo las tocan funciones SECURITY DEFINER que
 * comprueban el rol por dentro— pero es un estado peligroso de dar por bueno
 * en general: una tabla que DEBERÍA tener políticas y no las tiene se ve
 * exactamente igual.
 *
 * Por eso van escritas a mano aquí. Si mañana aparece una sexta, este test
 * falla y obliga a decidir si es un cierre a propósito o un olvido — que es
 * justo la pregunta que nadie se hace solo.
 */

import { expect, it, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, describeDb } from "./harness";

/**
 * Cerradas a propósito: nadie las toca por la API REST. El porqué de cada una
 * está en su `comment on table` (migración 0106), que viaja con la tabla.
 */
const CERRADAS_A_PROPOSITO = [
  "at_delivery_codes",
  "at_pending_action_state",
  "at_rate_limit",
  "at_shopify_connections",
  "at_survey_snooze",
];

describeDb("RLS — cobertura de todas las tablas", () => {
  let admin: SupabaseClient;
  let tablas: { tabla: string; rls: boolean; politicas: number }[];

  beforeAll(async () => {
    admin = clienteAdmin();
    // Se pregunta al catálogo, no a una lista escrita a mano: una lista a mano
    // se queda vieja el día que alguien añada una tabla, que es exactamente el
    // día en que este test tenía que servir.
    const { data, error } = await admin.rpc("at_inventario_de_rls");
    if (error) throw new Error(`No se pudo leer el inventario de RLS: ${error.message}`);
    tablas = (data ?? []) as typeof tablas;
  });

  it("hay tablas que revisar", () => {
    // Un inventario vacío haría pasar todo lo de abajo sin comprobar nada.
    expect(tablas.length).toBeGreaterThan(15);
  });

  it("todas las tablas at_ tienen RLS activo", () => {
    const abiertas = tablas.filter((t) => !t.rls).map((t) => t.tabla);
    expect(
      abiertas,
      "Estas tablas se pueden leer y escribir sin ninguna política. " +
        "Falta `alter table ... enable row level security`."
    ).toEqual([]);
  });

  it("las únicas sin políticas son las cerradas a propósito", () => {
    const sinPoliticas = tablas
      .filter((t) => t.politicas === 0)
      .map((t) => t.tabla)
      .sort();
    expect(
      sinPoliticas,
      "Una tabla con RLS y sin políticas está cerrada del todo. Si es a " +
        "propósito, añádela a CERRADAS_A_PROPOSITO y déjale un `comment on " +
        "table` que diga por qué. Si no lo es, le faltan las políticas."
    ).toEqual([...CERRADAS_A_PROPOSITO].sort());
  });

  it("la lista blanca no tiene sobras", () => {
    // Una tabla que ya no existe —o a la que se le pusieron políticas— y sigue
    // en la lista blanca es un hueco esperando a que alguien reutilice el
    // nombre.
    const existentes = new Set(tablas.map((t) => t.tabla));
    const sobran = CERRADAS_A_PROPOSITO.filter((t) => !existentes.has(t));
    expect(sobran, "Sobran en CERRADAS_A_PROPOSITO").toEqual([]);
  });
});
