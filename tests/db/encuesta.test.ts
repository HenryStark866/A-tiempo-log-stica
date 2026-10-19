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
 * La encuesta de satisfacción: tres funciones que producción tiene y las
 * migraciones locales no (at_encuesta_pendiente, at_posponer_encuesta,
 * at_responder_encuesta). Se reconstruyeron: ver
 * docs/migracion-aws/staging-stubs/01087_staging_encuesta.sql y LEEME.md.
 *
 * Estos tests fijan lo RECONSTRUIDO. Cada expectativa lleva su marca:
 *   DATO    = lo respalda el repo (el componente, las migraciones 0105/0106/0107).
 *   DISEÑO  = lo decidió la reconstrucción; producción pudo hacerlo distinto.
 * Si algún día se recupera la definición real, ahí es donde pueden discrepar.
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

  beforeAll(() => {
    admin = clienteAdmin();
  });

  afterAll(async () => {
    await borrarUsuarios(admin, ids);
  });

  // ── at_encuesta_pendiente ─────────────────────────────────────────────────

  it("sin sesión no se puede llamar", async () => {
    // DISEÑO: permiso solo para `authenticated`, como los demás auxiliares (0100).
    const { error } = await clienteAnonimo().rpc("at_encuesta_pendiente");
    expect(error).not.toBeNull();
  });

  it("una cuenta recién creada no la ve", async () => {
    // DATO: no aparece los primeros días. DISEÑO: «primeros días» = 7.
    const u = await nuevoUsuario("enc-nueva", "cliente", 0);
    expect(await mostrar(u)).toBe(false);
  });

  it("una cuenta de más de 7 días sí la ve", async () => {
    // DISEÑO: el umbral de 7 días.
    const u = await nuevoUsuario("enc-vieja", "cliente", 10);
    expect(await mostrar(u)).toBe(true);
  });

  it("una cuenta pendiente de aprobación no la ve, aunque sea vieja", async () => {
    // DISEÑO: quien aún no puede usar la app no debe recibir la encuesta.
    const u = await nuevoUsuario("enc-pendiente", "pendiente", 10);
    expect(await mostrar(u)).toBe(false);
  });

  // ── at_posponer_encuesta ──────────────────────────────────────────────────

  it("posponer la oculta y vuelve cuando se cumple el plazo", async () => {
    // DATO: quien la cierra no la vuelve a ver en un mes (el componente manda p_dias: 30).
    const u = await nuevoUsuario("enc-posponer", "cliente", 10);
    expect(await mostrar(u)).toBe(true);

    const { error } = await u.sb.rpc("at_posponer_encuesta", { p_dias: 30 });
    expect(error).toBeNull();
    expect(await mostrar(u)).toBe(false);

    const { data } = await admin.from("at_survey_snooze").select("snoozed_until").eq("user_id", u.id).maybeSingle();
    const dias = (new Date((data as { snoozed_until: string }).snoozed_until).getTime() - Date.now()) / DIA;
    expect(dias).toBeGreaterThan(29);
    expect(dias).toBeLessThan(31);

    // Se cumple el plazo → vuelve a aparecer.
    await admin.from("at_survey_snooze").update({ snoozed_until: new Date(Date.now() - DIA).toISOString() }).eq("user_id", u.id);
    expect(await mostrar(u)).toBe(true);
  });

  it("posponer acota los días a un máximo de un año", async () => {
    // DISEÑO: un valor absurdo no esconde la encuesta para siempre.
    const u = await nuevoUsuario("enc-tope", "cliente", 10);
    await u.sb.rpc("at_posponer_encuesta", { p_dias: 100_000 });
    const { data } = await admin.from("at_survey_snooze").select("snoozed_until").eq("user_id", u.id).maybeSingle();
    const dias = (new Date((data as { snoozed_until: string }).snoozed_until).getTime() - Date.now()) / DIA;
    expect(dias).toBeLessThanOrEqual(366);
  });

  // ── at_responder_encuesta ─────────────────────────────────────────────────

  it.each([-1, 11, null])("la recomendación %s se rechaza", async (valor) => {
    // DATO: la escala es de 0 a 10 y es obligatoria. DISEÑO: el código check_violation.
    const u = await nuevoUsuario("enc-rango", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: valor });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });

  it.each([0, 6])("la facilidad %s se rechaza", async (valor) => {
    // DATO: la facilidad va de 1 a 5.
    const u = await nuevoUsuario("enc-facilidad", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: 8, p_facilidad: valor });
    expect(error).not.toBeNull();
  });

  it("una respuesta completa se guarda a nombre de quien responde y la oculta tres meses", async () => {
    // DATO: guarda las cuatro cosas; quien responde no la vuelve a ver en tres meses.
    // DISEÑO: tres meses = 90 días; el comentario se recorta; el comercio sale de at_my_client().
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
      .select("user_id, client_id, recomienda, facilidad, comentario, version")
      .eq("user_id", u.id);
    expect(filas).toHaveLength(1);
    const fila = filas![0] as Record<string, unknown>;
    expect(fila.recomienda).toBe(9);
    expect(fila.facilidad).toBe(4);
    expect(fila.comentario).toBe("Muy buena, falta el mapa");
    expect(fila.version).toBe("abc12345");

    const { data: perfil } = await admin.from("at_profiles").select("client_id").eq("id", u.id).maybeSingle();
    expect(fila.client_id).toBe((perfil as { client_id: string | null }).client_id);

    expect(await mostrar(u)).toBe(false);
    const { data: s } = await admin.from("at_survey_snooze").select("snoozed_until").eq("user_id", u.id).maybeSingle();
    const dias = (new Date((s as { snoozed_until: string }).snoozed_until).getTime() - Date.now()) / DIA;
    expect(dias).toBeGreaterThan(89);
    expect(dias).toBeLessThan(91);
  });

  it("solo la recomendación es obligatoria; lo demás puede ir vacío", async () => {
    // DATO: facilidad y comentario son opcionales (el componente los marca así).
    // DISEÑO: un comentario en blanco se guarda como NULL.
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

  it("un comentario de más de 2.000 caracteres se rechaza", async () => {
    // DISEÑO: tope del comentario.
    const u = await nuevoUsuario("enc-largo", "cliente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: 5, p_comentario: "x".repeat(2001) });
    expect(error).not.toBeNull();
  });

  it("una cuenta pendiente no puede responder", async () => {
    // DISEÑO: igual que no la ve.
    const u = await nuevoUsuario("enc-pend-resp", "pendiente", 10);
    const { error } = await u.sb.rpc("at_responder_encuesta", { p_recomienda: 5 });
    expect(error).not.toBeNull();
  });

  // ── Quién lee qué (esto es DATO: migraciones 0105 y 0106) ──────────────────

  it("cada quien ve solo sus respuestas, y ops ve todas", async () => {
    // DATO: política «cada quien ve lo suyo, ops ve todo» (0105).
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
    // DATO: sin políticas de escritura (comentario de la 0106: «se escribe desde la función»).
    const u = await nuevoUsuario("enc-directo", "cliente", 10);
    const { error: e1 } = await u.sb.from("at_survey_responses").insert({ user_id: u.id, recomienda: 10 });
    expect(e1).not.toBeNull();
    const { data: lectura } = await u.sb.from("at_survey_snooze").select("user_id");
    // RLS sin políticas: no devuelve ni siquiera la fila propia.
    expect(lectura).toEqual([]);
  });
});
