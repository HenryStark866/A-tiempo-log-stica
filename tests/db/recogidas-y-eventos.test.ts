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
 * Tres funciones que producción tiene y las migraciones locales no: se
 * reconstruyeron a partir de la evidencia del repo (ver
 * docs/migracion-aws/staging-stubs/0000_staging_stubs.sql y LEEME.md).
 *
 * Estos tests fijan lo RECONSTRUIDO, no lo original. Lo que es dato (la franja
 * 08:00–17:00 en turnos de 15 min, que NULL vale, que el pedido nace con un hito)
 * está respaldado por la migración 0088, docs/hora-de-recogida.md y la pantalla
 * de pedidos. Lo que es suposición (el texto del mensaje, la nota y el actor del
 * hito, la forma del resultado de at_franja_de_recogida) está marcado abajo: si
 * algún día se recupera la definición real de producción, ahí es donde pueden
 * discrepar y hay que decidir cuál gana.
 */

describeDb("la hora de recogida — at_valida_hora_recogida", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = clienteAdmin();
  });

  const validar = (hora: string | null) => admin.rpc("at_valida_hora_recogida", { p: hora });

  // DATO (CHECK at_pickups_hora_en_franja, 0088): desde 08:00 hasta 17:00 inclusive.
  it.each(["08:00", "08:15", "12:30", "16:45", "17:00"])("%s es un turno válido", async (hora) => {
    const { error } = await validar(hora);
    expect(error).toBeNull();
  });

  // DATO (docs/hora-de-recogida.md): la hora es opcional, «Sin preferencia».
  it("sin hora (NULL) se acepta: es «sin preferencia»", async () => {
    const { error } = await validar(null);
    expect(error).toBeNull();
  });

  // DATO: fuera de la franja, fuera de rejilla de 15 min o con segundos, se rechaza.
  it.each(["07:45", "07:59", "08:07", "16:50", "17:15", "23:00", "08:00:30"])(
    "%s se rechaza",
    async (hora) => {
      const { error } = await validar(hora);
      expect(error).not.toBeNull();
      // SUPOSICIÓN: el código check_violation, igual que los mensajes de la 0088.
      expect(error?.code).toBe("23514");
    },
  );

  // SUPOSICIÓN: el texto exacto. Solo se exige que diga cuál es la franja.
  it("el mensaje dice la franja y el turno", async () => {
    const { error } = await validar("07:45");
    expect(error?.message).toContain("8:00 a. m.");
    expect(error?.message).toContain("5:00 p. m.");
    expect(error?.message).toContain("15 minutos");
  });

  // SUPOSICIÓN: la forma (tres columnas). El valor sí es dato.
  it("at_franja_de_recogida da la franja que usa la validación", async () => {
    const { data, error } = await admin.rpc("at_franja_de_recogida");
    expect(error).toBeNull();
    const f = (Array.isArray(data) ? data[0] : data) as {
      hora_inicio: string;
      hora_fin: string;
      paso_minutos: number;
    };
    expect(f.hora_inicio).toMatch(/^08:00/);
    expect(f.hora_fin).toMatch(/^17:00/);
    expect(Number(f.paso_minutos)).toBe(15);
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
