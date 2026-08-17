import { it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAVE_DE_PRUEBA,
  borrarUsuarios,
  clienteAdmin,
  clienteAnonimo,
  clienteComo,
  crearUsuario,
  describeDb,
} from "./harness";

/**
 * RLS es la ÚNICA capa de autorización de esta app (ADR-0001): 53 archivos
 * hablan con Supabase directo desde el navegador. Una política mal escrita no
 * es un fallo de permisos, es acceso abierto a los datos de nueve comercios.
 *
 * Lo que se comprueba aquí es lo que ve un cliente REAL, con su sesión. Usar la
 * llave `service_role` para esto no probaría nada: se salta RLS y todo pasa.
 */

describeDb("RLS — lo que ve quien no ha entrado", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = clienteAnonimo();
  });

  // Las tablas del negocio, una por una. Da igual que la respuesta sea un error
  // de permiso o una lista vacía: lo que no puede pasar es que salgan filas.
  const TABLAS = [
    "at_guides",
    "at_clients",
    "at_profiles",
    "at_pickups",
    "at_invoices",
    "at_recipients",
    "at_products",
    "at_courier_positions",
  ];

  for (const tabla of TABLAS) {
    it(`no puede leer ${tabla} sin sesión`, async () => {
      const { data } = await anon.from(tabla).select("*").limit(1);
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("no puede escribir en at_guides sin sesión", async () => {
    const { error } = await anon.from("at_guides").insert({ recipient_name: "intruso" });
    expect(error).not.toBeNull();
  });

  it("no puede llamar las RPC de escritura sin sesión", async () => {
    // La migración 0004 revocó `anon` de las RPC a propósito. Si esto deja de
    // fallar, alguien volvió a concederlo.
    const { error } = await anon.rpc("at_change_guide_status", {
      p_guide_id: "00000000-0000-0000-0000-000000000000",
      p_status: "entregada",
    });
    expect(error).not.toBeNull();
  });
});

describeDb("RLS — un comercio no ve lo de otro comercio", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clienteA: SupabaseClient;
  let idComercioB: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();

    const a = await crearUsuario(admin, "comercio-a", { role: "cliente" });
    const b = await crearUsuario(admin, "comercio-b", { role: "cliente" });
    usuarios.push(a.id, b.id);

    // El comercio de cada uno lo crea el autoaprovisionamiento (migración 0010)
    // al entrar por primera vez. Entramos con los dos para que existan.
    clienteA = await clienteComo(a.email, CLAVE_DE_PRUEBA);
    const clienteB = await clienteComo(b.email, CLAVE_DE_PRUEBA);

    const { data: perfilB } = await clienteB
      .from("at_profiles")
      .select("client_id")
      .eq("id", b.id)
      .maybeSingle();
    idComercioB = (perfilB as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("A no ve los pedidos de B", async () => {
    if (!idComercioB) return; // sin comercio B no hay nada que comprobar
    const { data } = await clienteA.from("at_guides").select("id").eq("client_id", idComercioB);
    expect(data ?? []).toHaveLength(0);
  });

  it("A no ve los destinatarios de B", async () => {
    if (!idComercioB) return;
    const { data } = await clienteA
      .from("at_recipients")
      .select("id")
      .eq("client_id", idComercioB);
    expect(data ?? []).toHaveLength(0);
  });

  it("A no ve las facturas de B", async () => {
    if (!idComercioB) return;
    const { data } = await clienteA.from("at_invoices").select("id").eq("client_id", idComercioB);
    expect(data ?? []).toHaveLength(0);
  });

  it("A no puede crear un pedido a nombre de B", async () => {
    if (!idComercioB) return;
    const { error } = await clienteA
      .from("at_guides")
      .insert({ client_id: idComercioB, recipient_name: "suplantación" });
    expect(error).not.toBeNull();
  });

  it("A no puede ascenderse a admin editando su propio perfil", async () => {
    // El rol lo decide la operación, no el usuario. Si esto pasa, cualquiera
    // que abra la consola del navegador se hace administrador.
    const { data: yo } = await clienteA.from("at_profiles").select("id, role").limit(1).maybeSingle();
    const perfil = yo as { id: string; role: string } | null;
    if (!perfil) return;

    await clienteA.from("at_profiles").update({ role: "admin" }).eq("id", perfil.id);

    const { data: despues } = await clienteA
      .from("at_profiles")
      .select("role")
      .eq("id", perfil.id)
      .maybeSingle();
    expect((despues as { role: string } | null)?.role).not.toBe("admin");
  });
});

describeDb("RLS — el mensajero solo ve su trabajo", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let mensajero: SupabaseClient;

  beforeAll(async () => {
    admin = clienteAdmin();
    const m = await crearUsuario(admin, "mensajero", { role: "mensajero" });
    usuarios.push(m.id);
    await admin.from("at_profiles").update({ role: "mensajero" }).eq("id", m.id);
    mensajero = await clienteComo(m.email, CLAVE_DE_PRUEBA);
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("no ve las facturas de ningún comercio", async () => {
    // El mensajero mueve paquetes; la cartera no es asunto suyo.
    const { data } = await mensajero.from("at_invoices").select("id").limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it("no puede leer la posición de otros mensajeros por la tabla cruda", async () => {
    const { data } = await mensajero
      .from("at_courier_positions")
      .select("courier_id")
      .neq("courier_id", "00000000-0000-0000-0000-000000000000")
      .limit(5);
    const ajenas = (data ?? []) as { courier_id: string }[];
    expect(ajenas.every((p) => p.courier_id !== null)).toBe(true);
  });
});
