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
 * Tres funciones que producción tenía y las migraciones no (0127 y 0128 las
 * recuperan). Su código es el del respaldo de producción del 2026-09-23: estos
 * tests fijan lo ORIGINAL, no una reconstrucción.
 *
 * Ojo con lo que NO hace la validación: solo comprueba el rango 08:00–17:00.
 * La rejilla de 15 minutos la exige el CHECK at_pickups_hora_en_franja (0088)
 * sobre la tabla, no esta función.
 */

describeDb("la hora de recogida — at_valida_hora_recogida", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = clienteAdmin();
  });

  const validar = (hora: string | null) => admin.rpc("at_valida_hora_recogida", { p_hora: hora });

  it.each(["08:00", "08:15", "08:07", "12:30", "16:45", "17:00"])("%s está dentro de la franja", async (hora) => {
    const { error } = await validar(hora);
    expect(error).toBeNull();
  });

  // docs/hora-de-recogida.md: la hora es opcional, «Sin preferencia».
  it("sin hora (NULL) se acepta: es «sin preferencia»", async () => {
    const { error } = await validar(null);
    expect(error).toBeNull();
  });

  it.each(["00:00", "07:45", "07:59", "17:01", "17:15", "23:00"])("%s está fuera de la franja y se rechaza", async (hora) => {
    const { error } = await validar(hora);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
  });

  it("el mensaje dice cuál es la franja", async () => {
    const { error } = await validar("07:45");
    expect(error?.message).toContain("08:00");
    expect(error?.message).toContain("17:00");
  });

  it("at_franja_de_recogida da la franja que usa la validación", async () => {
    const { data, error } = await admin.rpc("at_franja_de_recogida");
    expect(error).toBeNull();
    expect(data).toEqual({ desde: "08:00:00", hasta: "17:00:00" });
  });
});

describeDb("el primer hito del pedido — at_evento_al_crear_pedido", () => {
  let admin: SupabaseClient;
  const guias: string[] = [];
  const usuarios: string[] = [];
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    // Una guía exige comercio (client_id es obligatorio): se crea como en
    // cobro.test.ts, entrando una vez para que se autoprovisione.
    const u = await crearUsuario(admin, "hito-pedido", { role: "cliente" });
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
    if (guias.length) await admin.from("at_guides").delete().in("id", guias);
    await borrarUsuarios(admin, usuarios);
  });

  const nuevaGuia = (nombre: string, direccion: string) =>
    admin
      .from("at_guides")
      .insert({ client_id: clientId, recipient_name: nombre, recipient_address: direccion })
      .select("id, status")
      .maybeSingle();

  // DATO (pedidos/[id]/page.tsx): «el trigger at_evento_al_crear_pedido lo
  // escribe»; la pantalla pinta el hito con el nombre del estado.
  it("un pedido nuevo nace con exactamente un hito: «creada»", async () => {
    expect(clientId).not.toBeNull();
    const { data: g, error: e1 } = await nuevaGuia("Prueba de hito", "Calle 1 #2-3");
    expect(e1).toBeNull();
    const guia = g as { id: string; status: string };
    guias.push(guia.id);

    const { data: eventos, error: e2 } = await admin
      .from("at_guide_events")
      .select("status, note")
      .eq("guide_id", guia.id);
    expect(e2).toBeNull();
    expect(eventos).toHaveLength(1);
    expect(eventos![0].status).toBe("creada");
    expect(eventos![0].status).toBe(guia.status);
    expect(eventos![0].note).toBe("Pedido registrado por el comercio");
  });

  // DATO: ninguna RPC inserta ese hito (ni en las migraciones locales), así que
  // otros cambios de la guía no deben producir hitos nuevos por este trigger.
  it("actualizar la guía no crea otro hito de creación", async () => {
    const { data: g, error } = await nuevaGuia("Prueba de hito 2", "Calle 4 #5-6");
    expect(error).toBeNull();
    const id = (g as { id: string }).id;
    guias.push(id);

    await admin.from("at_guides").update({ recipient_name: "Cambiado" }).eq("id", id);

    const { data: eventos } = await admin.from("at_guide_events").select("id").eq("guide_id", id);
    expect(eventos).toHaveLength(1);
  });
});
