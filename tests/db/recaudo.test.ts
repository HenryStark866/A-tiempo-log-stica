import { it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAVE_DE_PRUEBA,
  borrarUsuarios,
  clienteAdmin,
  clienteComo,
  crearUsuario,
  describeDb,
} from "./harness";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL RECAUDO CONTRAENTREGA
 *
 * Aquí hay efectivo de verdad. El mensajero cobra en la puerta, entrega la
 * plata en el CEDI, se concilia su cierre de caja, y solo entonces se le gira
 * al comercio lo que le corresponde. Cada uno de esos pasos es una oportunidad
 * de girar de más, de menos, o dos veces.
 *
 * Las tres reglas que sostienen todo, leídas de la migración 0053:
 *
 *   1. disponible = bruto − flete_nuestro
 *      Lo que se recaudó, menos el domicilio que el comprador pagó dentro del
 *      contraentrega y que por tanto ya es nuestro.
 *
 *   2. Solo cuenta lo CONCILIADO. Una guía cuyo cierre de caja no está
 *      `conciliado` es plata que el mensajero todavía no ha entregado.
 *      Girársela al comercio es pagar con dinero que no tenemos.
 *
 *   3. Una guía con `remittance_id` ya no vuelve a entrar. Sin eso, girar dos
 *      veces le paga dos veces al comercio el mismo pedido.
 *
 * `at_generate_cod_remittance` exige `at_is_ops()` — «Solo administración gira
 * el recaudo a los comercios» — y `service_role` NO la cumple, porque
 * `auth.uid()` es null. Estos tests usan una sesión de admin de verdad.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describeDb("at_recaudo_por_girar — qué se le debe al comercio", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const u = await crearUsuario(admin, "recaudo", { role: "cliente" });
    usuarios.push(u.id);
    await clienteComo(u.email, CLAVE_DE_PRUEBA);
    const { data: perfil } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", u.id)
      .maybeSingle();
    clientId = (perfil as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  async function porGirar() {
    const { data, error } = await admin.rpc("at_recaudo_por_girar", { p_client_id: clientId });
    if (error) throw new Error(error.message);
    return data as {
      guias: number;
      bruto: number;
      flete_nuestro: number;
      disponible: number;
      deuda_fletes: number;
    };
  }

  it("un comercio sin entregas no tiene nada por girar, y responde ceros y no null", async () => {
    if (!clientId) return;
    const r = await porGirar();
    expect(Number(r.guias)).toBe(0);
    expect(Number(r.bruto)).toBe(0);
    expect(Number(r.disponible)).toBe(0);
    expect(r.disponible).not.toBeNull();
  });

  it("disponible es siempre bruto menos flete_nuestro", async () => {
    // El invariante del que cuelga toda la remesa. Si alguna vez deja de
    // cumplirse, se le está girando al comercio una cifra que no cuadra con lo
    // que se recaudó — y eso se descubre cuando el comercio reclama.
    if (!clientId) return;
    const r = await porGirar();
    expect(Number(r.disponible)).toBe(Number(r.bruto) - Number(r.flete_nuestro));
  });

  it("la deuda de fletes se informa aparte, no se descuenta sola", async () => {
    // `deuda_fletes` viaja en la respuesta para que administración decida si
    // cruza cuentas, pero NO sale de `disponible`. Mezclarlas convertiría un
    // giro de recaudo en un cobro silencioso.
    if (!clientId) return;
    const r = await porGirar();
    expect(r).toHaveProperty("deuda_fletes");
    expect(Number(r.disponible)).toBe(Number(r.bruto) - Number(r.flete_nuestro));
  });
});

describeDb("at_generate_cod_remittance — quién puede girar y qué entra", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let comercio: SupabaseClient | null = null;
  let ops: SupabaseClient | null = null;
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();

    const jefe = await crearUsuario(admin, "ops-recaudo", { role: "admin" });
    usuarios.push(jefe.id);
    await admin.from("at_profiles").update({ role: "admin" }).eq("id", jefe.id);
    ops = await clienteComo(jefe.email, CLAVE_DE_PRUEBA);

    const c = await crearUsuario(admin, "comercio-recaudo", { role: "cliente" });
    usuarios.push(c.id);
    comercio = await clienteComo(c.email, CLAVE_DE_PRUEBA);
    const { data: perfil } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", c.id)
      .maybeSingle();
    clientId = (perfil as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("un comercio NO puede girarse el recaudo a sí mismo", async () => {
    // «Solo administración gira el recaudo a los comercios». Si esto pasara,
    // un comercio podría emitir su propia remesa y darse por pagado.
    if (!comercio || !clientId) return;
    const { error } = await comercio.rpc("at_generate_cod_remittance", {
      p_client_id: clientId,
    });
    expect(error).not.toBeNull();
  });

  it("administración sí puede, aunque no haya nada que girar", async () => {
    if (!ops || !clientId) return;
    const { error } = await ops.rpc("at_generate_cod_remittance", { p_client_id: clientId });
    // Puede fallar con un mensaje de negocio («nada por girar»), pero nunca
    // con uno de permisos.
    if (error) expect(error.message).not.toMatch(/autoriza|permis|Solo administraci/i);
  });
});

/**
 * ── Lo que falta, y necesita montar el escenario completo ─────────────────
 *
 * Los dos tests que de verdad protegen el efectivo necesitan una guía COD
 * entregada, con su `at_settlement` asociado, y eso son varias tablas
 * encadenadas. Se escriben con la base delante, no antes:
 *
 * 1. UN CIERRE DE CAJA SIN CONCILIAR NO SE GIRA. Crear dos guías COD
 *    entregadas, una con `settlement.status = 'conciliado'` y otra sin, y
 *    comprobar que `at_recaudo_por_girar` solo cuenta la primera. Es la regla
 *    que impide pagarle al comercio con plata que el mensajero todavía tiene
 *    en el bolsillo.
 *
 * 2. NO SE GIRA DOS VECES. Generar la remesa, comprobar que las guías quedan
 *    con `remittance_id`, y que una segunda llamada devuelve cero. Sin esto,
 *    dos clics al botón le pagan dos veces al comercio.
 *
 * 3. EL FLETE COBRADO EN LA PUERTA SE DESCUENTA UNA SOLA VEZ. Una guía con
 *    `cod_includes_shipping` no puede aparecer a la vez descontada aquí y
 *    cobrada en la factura — sería cobrar el mismo domicilio dos veces. Cruza
 *    con `at_cobro_de_guia`, que para ese caso devuelve 0 (ver `cobro.test.ts`).
 */
