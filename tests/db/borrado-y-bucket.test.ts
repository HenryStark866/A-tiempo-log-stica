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
 * Las tres funciones de borrado del admin (0130) y el bucket `evidencias` (0131).
 * Su código es el de producción (respaldo del 2026-09-23). Lo que se prueba son
 * las GUARDAS: quién puede borrar y qué se niega a borrar.
 */

describeDb("borrar como admin — at_admin_eliminar_*", () => {
  let admin: SupabaseClient;
  const ids: string[] = [];

  async function nuevo(etiqueta: string, rol: string) {
    const u = await crearUsuario(admin, etiqueta, { role: rol });
    ids.push(u.id);
    const sb = await clienteComo(u.email, CLAVE_DE_PRUEBA);
    return { id: u.id, sb };
  }

  beforeAll(() => {
    admin = clienteAdmin();
  });

  afterAll(async () => {
    await borrarUsuarios(admin, ids);
  });

  it("sin sesión ninguna de las tres se puede llamar", async () => {
    const anon = clienteAnonimo();
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [fn, args] of [
      ["at_admin_eliminar_usuario", { p_id: id }],
      ["at_admin_eliminar_pedido", { p_id: id }],
      ["at_admin_eliminar_comercio", { p_id: id, p_confirmacion: "x" }],
    ] as const) {
      const { error } = await anon.rpc(fn, args);
      expect(error, fn).not.toBeNull();
    }
  });

  it("quien no es admin recibe el mensaje de cada función", async () => {
    const c = await nuevo("borrar-cliente", "cliente");
    const id = "00000000-0000-0000-0000-000000000000";
    const u = await c.sb.rpc("at_admin_eliminar_usuario", { p_id: id });
    expect(u.error?.message).toBe("Solo un administrador puede eliminar usuarios");
    const p = await c.sb.rpc("at_admin_eliminar_pedido", { p_id: id });
    expect(p.error?.message).toBe("Solo un administrador puede eliminar pedidos ya despachados");
    const m = await c.sb.rpc("at_admin_eliminar_comercio", { p_id: id, p_confirmacion: "x" });
    expect(m.error?.message).toBe("Solo un administrador puede eliminar comercios");
  });

  it("un admin no puede borrarse a sí mismo", async () => {
    const a = await nuevo("borrar-admin-yo", "admin");
    const { error } = await a.sb.rpc("at_admin_eliminar_usuario", { p_id: a.id });
    expect(error?.message).toContain("No puedes eliminar tu propia cuenta");
  });

  it("un admin borra a otro usuario y deja rastro crítico", async () => {
    const a = await nuevo("borrar-admin", "admin");
    const victima = await nuevo("borrar-victima", "cliente");
    const { data, error } = await a.sb.rpc("at_admin_eliminar_usuario", { p_id: victima.id, p_motivo: "prueba" });
    expect(error).toBeNull();
    expect((data as { eliminado: string }).eliminado).toBeTruthy();

    const { data: perfil } = await admin.from("at_profiles").select("id").eq("id", victima.id);
    expect(perfil).toEqual([]);
    const { data: rastro } = await admin
      .from("at_security_events")
      .select("severity, detail")
      .eq("severity", "critico")
      .contains("detail", { accion: "usuario_eliminado", perfil_id: victima.id });
    expect(rastro).toHaveLength(1);
  });

  it("un usuario que no existe se reporta, no se ignora", async () => {
    const a = await nuevo("borrar-admin-2", "admin");
    const { error } = await a.sb.rpc("at_admin_eliminar_usuario", { p_id: "00000000-0000-0000-0000-000000000000" });
    expect(error?.message).toBe("Ese usuario no existe");
  });

  it("borrar un comercio exige escribir su nombre exacto", async () => {
    const a = await nuevo("borrar-admin-3", "admin");
    const dueno = await nuevo("borrar-comercio", "cliente");
    const { data: perfil } = await admin.from("at_profiles").select("client_id").eq("id", dueno.id).maybeSingle();
    const clientId = (perfil as { client_id: string | null }).client_id;
    expect(clientId).not.toBeNull();

    const mal = await a.sb.rpc("at_admin_eliminar_comercio", { p_id: clientId, p_confirmacion: "otro nombre" });
    expect(mal.error?.message).toContain("Para confirmar, escribe exactamente el nombre del comercio");
    const { data: sigue } = await admin.from("at_clients").select("id").eq("id", clientId!);
    expect(sigue).toHaveLength(1);

    const { data: c } = await admin.from("at_clients").select("business_name").eq("id", clientId!).maybeSingle();
    const bien = await a.sb.rpc("at_admin_eliminar_comercio", {
      p_id: clientId,
      p_confirmacion: (c as { business_name: string }).business_name,
    });
    expect(bien.error).toBeNull();
    const { data: ya } = await admin.from("at_clients").select("id").eq("id", clientId!);
    expect(ya).toEqual([]);
    // La cuenta de la persona sobrevive y ya no apunta al comercio borrado
    // (la base le autoprovisiona uno nuevo al quedar sin comercio).
    const { data: cuenta } = await admin.from("at_profiles").select("id, client_id").eq("id", dueno.id).maybeSingle();
    expect(cuenta?.id).toBe(dueno.id);
    expect((cuenta as { client_id: string | null }).client_id).not.toBe(clientId);
  });

  it("un pedido que no existe se reporta", async () => {
    const a = await nuevo("borrar-admin-4", "admin");
    const { error } = await a.sb.rpc("at_admin_eliminar_pedido", { p_id: "00000000-0000-0000-0000-000000000000" });
    expect(error?.message).toBe("Ese pedido no existe");
  });
});

describeDb("el bucket evidencias", () => {
  it("existe, es privado, de 50 MB y admite imágenes y PDF", async () => {
    const { data, error } = await clienteAdmin().storage.getBucket("evidencias");
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
    expect(data?.file_size_limit).toBe(52428800);
    expect([...(data?.allowed_mime_types ?? [])].sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"],
    );
  });
});
