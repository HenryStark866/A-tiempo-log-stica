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
 * La encuesta de satisfacción: at_encuesta_pendiente, at_posponer_encuesta,
 * at_responder_encuesta y at_resumen_encuestas. La migración 0129 las deja tal
 * como estaban en producción (código del respaldo del 2026-09-23), así que estos
 * tests fijan lo ORIGINAL: 3 días de gracia, 90 días tras responder, «posponer»
 * sin tope y con mínimo de 1 día, y una facilidad fuera de 1–5 se guarda como
 * NULL en vez de rechazarse.
 */

const DIA = 86_400_000;

type Usuario = { id: string; email: string; sb: SupabaseClient };

describeDb("la encuesta de satisfacción", () => {
  let admin: SupabaseClient;
  const ids: string[] = [];

  async function nuevoUsuario(etiqueta: string, rol: string, diasDeCuenta: number): Promise<Usuario> {
    const u = await crearUsuario(admin, etiqueta, { role: rol });
    ids.push(u.id);
    // La antigüedad de la cuenta se fija con la llave de servicio: no hay otra
    // forma de tener una cuenta de hace diez días en un test.
    const { error } = await admin
      .from("at_profiles")
      .update({ created_at: new Date(Date.now() - diasDeCuenta * DIA).toISOString() })
      .eq("id", u.id);
    if (error) throw new Error(`No se pudo fijar la antigüedad: ${error.message}`);
    const sb = await clienteComo(u.email, CLAVE_DE_PRUEBA);
    return { id: u.id, email: u.email, sb };
  }

  const mostrar = async (u: Usuario) => {
    const { data, error } = await u.sb.rpc("at_encuesta_pendiente");
    expect(error).toBeNull();
    return Boolean((data as { mostrar?: boolean } | null)?.mostrar);
  };

  const diasDeSnooze = async (id: string) => {
    const { data } = await admin.from("at_survey_snooze").select("hasta").eq("user_id", id).maybeSingle();
    return (new Date((data as { hasta: string }).hasta).getTime() - Date.now()) / DIA;
  };

  beforeAll(() => {
    admin = clienteAdmin();
  });

  afterAll(async () => {
    await borrarUsuarios(admin, ids);
  });

  // ── at_encuesta_pendiente ─────────────────────────────────────────────────

  it("sin sesión no se puede llamar", async () => {
    const { error } = await clienteAnonimo().rpc("at_encuesta_pendiente");
    expect(error).not.toBeNull();
  });

  it("una cuenta recién creada no la ve", async () => {
    const u = await nuevoUsuario("enc-nueva", "cliente", 0);
    expect(await mostrar(u)).toBe(false);
  });

  it("una cuenta de más de 3 días sí la ve; de 2 días, no", async () => {
    expect(await mostrar(await nuevoUsuario("enc-vieja", "cliente", 4))).toBe(true);
    expect(await mostrar(await nuevoUsuario("enc-2dias", "cliente", 2))).toBe(false);
  });

  it("una cuenta pendiente de aprobación no la ve, aunque sea vieja", async () => {
    const u = await nuevoUsuario("enc-pendiente", "pendiente", 10);
    expect(await mostrar(u)).toBe(false);
  });

  // ── at_posponer_encuesta ──────────────────────────────────────────────────

  it("posponer la oculta y vuelve cuando se cumple el plazo", async () => {
    const u = await nuevoUsuario("enc-posponer", "cliente", 10);
    expect(await mostrar(u)).toBe(true);

    const { error } = await u.sb.rpc("at_posponer_encuesta", { p_dias: 30 });
    expect(error).toBeNull();
    expect(await mostrar(u)).toBe(false);

    const dias = await diasDeSnooze(u.id);
    expect(dias).toBeGreaterThan(29);
    expect(dias).toBeLessThan(31);

    // Se cumple el plazo → vuelve a aparecer.
    await admin.from("at_survey_snooze").update({ hasta: new Date(Date.now() - DIA).toISOString() }).eq("user_id", u.id);
    expect(await mostrar(u)).toBe(true);
  });

  it("posponer otra vez reemplaza el plazo y nunca baja de un día", async () => {
    const u = await nuevoUsuario("enc-minimo", "cliente", 10);
    await u.sb.rpc("at_posponer_encuesta", { p_dias: 30 });
    await u.sb.rpc("at_posponer_encuesta", { p_dias: 0 });
    const dias = await diasDeSnooze(u.id);
    expect(dias).toBeGreaterThan(0.9);
    expect(dias).toBeLessThan(1.1);
    const { data } = await admin.from("at_survey_snooze").select("user_id").eq("user_id", u.id);
    expect(data).toHaveLength(1);
  });

  // ── at_responder_encuesta ─────────────────────────────────────────────────

  it.each([-1, 11, null])("la recomendación %s se rechaza", async (valor) => {
    const u = await nuevoUsuario("enc-rango", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: valor });
    expect(error?.message).toBe("La puntuación va de 0 a 10");
  });

  it.each([0, 6])("la facilidad %s, fuera de 1–5, no se rechaza: se guarda vacía", async (valor) => {
    const u = await nuevoUsuario("enc-facilidad", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: 8, p_facilidad: valor });
    expect(error).toBeNull();
    const { data } = await admin.from("at_survey_responses").select("recomienda, facilidad").eq("user_id", u.id).maybeSingle();
    expect(data).toEqual({ recomienda: 8, facilidad: null });
  });

  it("una respuesta completa se guarda con el rol y el comercio de quien responde, y la oculta 90 días", async () => {
    const u = await nuevoUsuario("enc-responder", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", {
      p_recomienda: 9,
      p_facilidad: 4,
      p_comentario: "  Muy buena, falta el mapa  ",
      p_version: "abc12345",
    });
    expect(error).toBeNull();

    const { data: filas } = await admin
      .from("at_survey_responses")
      .select("user_id, rol, client_id, recomienda, facilidad, comentario, version")
      .eq("user_id", u.id);
    expect(filas).toHaveLength(1);
    const fila = filas![0] as Record<string, unknown>;
    expect(fila.recomienda).toBe(9);
    expect(fila.facilidad).toBe(4);
    expect(fila.comentario).toBe("Muy buena, falta el mapa");
    expect(fila.version).toBe("abc12345");
    expect(fila.rol).toBe("cliente");

    const { data: perfil } = await admin.from("at_profiles").select("client_id").eq("id", u.id).maybeSingle();
    expect(fila.client_id).toBe((perfil as { client_id: string | null }).client_id);

    // La oculta la respuesta de los últimos 90 días.
    expect(await mostrar(u)).toBe(false);
    await admin.from("at_survey_responses").update({ created_at: new Date(Date.now() - 91 * DIA).toISOString() }).eq("user_id", u.id);
    expect(await mostrar(u)).toBe(true);
  });

  it("responder borra el aplazamiento que hubiera", async () => {
    const u = await nuevoUsuario("enc-borra-snooze", "cliente", 10);
    await u.sb.rpc("at_posponer_encuesta", { p_dias: 30 });
    await u.sb.rpc("at_responder_encuesta", { p_recomienda: 6 });
    const { data } = await admin.from("at_survey_snooze").select("user_id").eq("user_id", u.id);
    expect(data).toEqual([]);
  });

  it("solo la recomendación es obligatoria; lo demás puede ir vacío", async () => {
    const u = await nuevoUsuario("enc-minima", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", {
      p_recomienda: 0,
      p_facilidad: null,
      p_comentario: "   ",
      p_version: null,
    });
    expect(error).toBeNull();
    const { data } = await admin.from("at_survey_responses").select("facilidad, comentario, version").eq("user_id", u.id).maybeSingle();
    expect(data).toEqual({ facilidad: null, comentario: null, version: null });
  });

  // ── at_resumen_encuestas ──────────────────────────────────────────────────

  it("el resumen es solo para el personal (ops)", async () => {
    const c = await nuevoUsuario("enc-res-cliente", "cliente", 10);
    const { error } = await c.sb.rpc("at_resumen_encuestas");
    expect(error?.message).toBe("No autorizado");

    const jefe = await nuevoUsuario("enc-res-ops", "admin", 10);
    await c.sb.rpc("at_responder_encuesta", { p_recomienda: 10, p_comentario: "Excelente" });
    const { data, error: e2 } = await jefe.sb.rpc("at_resumen_encuestas");
    expect(e2).toBeNull();
    const r = data as { total: number; por_rol: { rol: string }[]; comentarios: { comentario: string }[] };
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.por_rol.some((x) => x.rol === "cliente")).toBe(true);
    expect(r.comentarios.some((x) => x.comentario === "Excelente")).toBe(true);
  });

  // ── Quién lee qué (migraciones 0105 y 0106) ───────────────────────────────

  it("cada quien ve solo sus respuestas, y ops ve todas", async () => {
    const a = await nuevoUsuario("enc-ve-a", "cliente", 10);
    const b = await nuevoUsuario("enc-ve-b", "cliente", 10);
    const jefe = await nuevoUsuario("enc-ve-ops", "admin", 10);
    await a.sb.rpc("at_responder_encuesta", { p_recomienda: 7 });
    await b.sb.rpc("at_responder_encuesta", { p_recomienda: 3 });

    const { data: propias } = await a.sb.from("at_survey_responses").select("user_id");
    expect((propias as { user_id: string }[]).map((f) => f.user_id)).toEqual([a.id]);

    const { data: todas } = await jefe.sb.from("at_survey_responses").select("user_id").in("user_id", [a.id, b.id]);
    expect((todas as unknown[]).length).toBe(2);
  });

  it("nadie escribe en las tablas por la API: solo las funciones", async () => {
    const u = await nuevoUsuario("enc-directo", "cliente", 10);
    const { error: e1 } = await u.sb.from("at_survey_responses").insert({ user_id: u.id, rol: "cliente", recomienda: 10 });
    expect(e1).not.toBeNull();
    const { data: lectura } = await u.sb.from("at_survey_snooze").select("user_id");
    // RLS sin políticas: no devuelve ni siquiera la fila propia.
    expect(lectura).toEqual([]);
  });
});
