import { it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { borrarUsuarios, clienteAdmin, clienteAnonimo, crearUsuario, describeDb } from "./harness";
import { procesar } from "@/lib/canales/motor";
import { fuenteSupabase } from "@/lib/canales/fuente-supabase";

/**
 * Migración 0150: lo que el motor de canales le pide a la base. Las reglas
 * que se prueban aquí son las que no pueden vivir en el motor: quién ve qué
 * guía, que el precio del pedido salga del catálogo, que un mismo mensaje del
 * proveedor se atienda una vez y que nada de esto lo llame alguien sin la
 * llave de servicio.
 */

const TEL_DESTINATARIO = "300 999 0101";
const TEL_COMERCIO = "3009990102";
const TEL_EXTRANO = "+573009990103";
const E164 = (t: string) => "+57" + t.replace(/\D/g, "").slice(-10);
const TELEFONOS = [TEL_DESTINATARIO, TEL_COMERCIO, TEL_EXTRANO].map(E164);

describeDb("canales sin internet (0150)", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clientId: string;
  let guia: { id: string; guide_number: string };
  let productoActivo: string;
  let productoRetirado: string;
  const palabra = `zq${Date.now().toString(36)}`;

  beforeAll(async () => {
    admin = clienteAdmin();
    const comercio = await crearUsuario(admin, "canal-comercio", { role: "cliente" });
    usuarios.push(comercio.id);
    const { data: perfil } = await admin.from("at_profiles").select("client_id").eq("id", comercio.id).single();
    clientId = (perfil as { client_id: string }).client_id;
    // El comercio guardó su teléfono "a mano"; el SMS llega en E.164.
    await admin.from("at_profiles").update({ phone: "300 999 0102" }).eq("id", comercio.id);
    await admin
      .from("at_clients")
      .update({ phone: TEL_COMERCIO, business_name: `Panaderia ${palabra}`, active: true })
      .eq("id", clientId);

    const { data: prods, error: ep } = await admin
      .from("at_products")
      .insert([
        { client_id: clientId, name: "Torta de prueba", price: 25000, active: true },
        { client_id: clientId, name: "Producto retirado", price: 100, active: false },
      ])
      .select("id, active");
    if (ep) throw new Error(ep.message);
    productoActivo = prods!.find((p) => p.active)!.id;
    productoRetirado = prods!.find((p) => !p.active)!.id;

    const { data: g, error: eg } = await admin
      .from("at_guides")
      .insert({
        client_id: clientId,
        recipient_name: "Destinatario de prueba",
        recipient_phone: TEL_DESTINATARIO,
        recipient_address: "Calle 1 #2-3",
      })
      .select("id, guide_number")
      .single();
    if (eg) throw new Error(eg.message);
    guia = g as typeof guia;
  }, 60_000);

  afterAll(async () => {
    await admin.from("at_message_outbox").delete().in("to_phone", TELEFONOS);
    await admin.from("at_canal_pedidos").delete().eq("client_id", clientId);
    await admin.from("at_canal_sesiones").delete().in("telefono", TELEFONOS);
    await admin.from("at_canal_identidades").delete().in("telefono", TELEFONOS);
    await admin.from("at_canal_entrantes").delete().in("telefono", TELEFONOS);
    await admin.from("at_rate_limit").delete().like("bucket", "canal%+57300999%");
    if (guia) await admin.from("at_guides").delete().eq("id", guia.id);
    await admin.from("at_products").delete().eq("client_id", clientId);
    await borrarUsuarios(admin, usuarios);
  });

  it("nadie sin la llave de servicio llama estas funciones", async () => {
    const anon = clienteAnonimo();
    const { error } = await anon.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: TEL_EXTRANO });
    expect(error).not.toBeNull();
    const { error: e2 } = await anon.rpc("at_canal_guia", { p_telefono: TEL_DESTINATARIO, p_numero: guia.guide_number });
    expect(e2).not.toBeNull();
  });

  it("el mismo mensaje del proveedor se atiende una sola vez", async () => {
    const id = `prueba-${palabra}`;
    const args = { p_canal: "sms", p_proveedor_id: id, p_telefono: TEL_EXTRANO, p_texto: "MENU" };
    const a = (await admin.rpc("at_canal_registrar_entrante", args)).data as { id: string; atender: boolean };
    // Antes de terminar, un reintento todavía se atiende: el primero pudo fallar.
    const b = (await admin.rpc("at_canal_registrar_entrante", args)).data as { id: string; atender: boolean };
    expect(a.atender).toBe(true);
    expect(b).toEqual({ id: a.id, atender: true });

    await admin.rpc("at_canal_aplicar", {
      p_entrante: a.id, p_canal: "sms", p_telefono: TEL_EXTRANO,
      p_sesion_accion: "dejar", p_sesion: null, p_mensajes: [],
    });
    const c = (await admin.rpc("at_canal_registrar_entrante", args)).data as { atender: boolean };
    expect(c.atender).toBe(false);
  });

  it("el contexto normaliza el número y encuentra el perfil guardado a mano", async () => {
    const { data: raro } = await admin.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: "CLARO" });
    expect(raro).toBeNull();

    const { data } = await admin.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: E164(TEL_COMERCIO) });
    const ctx = data as { telefono: string; perfil: { rol: string } | null; alta_viva: boolean; baja: boolean };
    expect(ctx.telefono).toBe(E164(TEL_COMERCIO));
    expect(ctx.perfil?.rol).toBe("cliente");
    expect(ctx.alta_viva).toBe(false);
    expect(ctx.baja).toBe(false);
  });

  it("la guía la ven el destinatario y el comercio, y nadie más", async () => {
    const ver = async (tel: string, num: string) =>
      (await admin.rpc("at_canal_guia", { p_telefono: tel, p_numero: num })).data as { numero: string; estado: string } | null;
    const soloNumero = guia.guide_number.replace("ATL-", "");

    expect((await ver(E164(TEL_DESTINATARIO), soloNumero))?.numero).toBe(guia.guide_number);
    expect((await ver(TEL_COMERCIO, guia.guide_number))?.estado).toBe("creada");
    expect(await ver(TEL_EXTRANO, guia.guide_number)).toBeNull();

    const { data: mias } = await admin.rpc("at_canal_mis_guias", { p_telefono: E164(TEL_DESTINATARIO) });
    expect((mias as { numero: string }[]).map((g) => g.numero)).toContain(guia.guide_number);
  });

  it("el catálogo solo trae negocios con productos activos, y solo esos productos", async () => {
    const { data: cs } = await admin.rpc("at_canal_comercios", { p_termino: palabra.toUpperCase() });
    expect(cs).toEqual([{ id: clientId, nombre: `Panaderia ${palabra}` }]);

    // Un % no se vuelve comodín.
    const { data: todos } = await admin.rpc("at_canal_comercios", { p_termino: "%%%" });
    expect(todos).toEqual([]);

    const { data: ps } = await admin.rpc("at_canal_productos", { p_client_id: clientId });
    expect((ps as { id: string; precio: number }[]).map((p) => p.id)).toEqual([productoActivo]);
    expect(Number((ps as { precio: number }[])[0].precio)).toBe(25000);
  });

  it("el pedido toma el precio del catálogo y no acepta productos retirados", async () => {
    const pedir = async (producto: string, cantidad = "2") =>
      (
        await admin.rpc("at_canal_pedir", {
          p_telefono: TEL_EXTRANO,
          p_canal: "sms",
          p_pedido: { comercio_id: clientId, producto_id: producto, cantidad, nombre: "Luis Prueba", direccion: "Cra 50 #20-1" },
        })
      ).data as { ok: boolean; motivo?: string; total?: number; codigo?: string; telefono_comercio?: string };

    const bien = await pedir(productoActivo);
    expect(bien.ok).toBe(true);
    expect(Number(bien.total)).toBe(50000);
    expect(bien.telefono_comercio).toBe(E164(TEL_COMERCIO));
    expect(bien.codigo).toMatch(/^P-[0-9A-F]{6}$/);

    expect((await pedir(productoRetirado)).motivo).toBe("producto");
    expect((await pedir("no-es-un-uuid")).motivo).toBe("producto");
    expect((await pedir(productoActivo, "0")).motivo).toBe("datos");

    const { data: fila } = await admin.from("at_canal_pedidos").select("precio, cantidad, estado").eq("codigo", bien.codigo!).single();
    expect(fila).toMatchObject({ cantidad: 2, estado: "nuevo" });
    expect(Number((fila as { precio: number }).precio)).toBe(25000);
  });

  it("aplicar guarda la sesión, encola las respuestas y BAJA se recuerda", async () => {
    const { data: reg } = await admin.rpc("at_canal_registrar_entrante", {
      p_canal: "sms", p_proveedor_id: `aplicar-${palabra}`, p_telefono: TEL_EXTRANO, p_texto: "CATALOGO",
    });
    const sesion = { paso: "elegir_comercio", comercios: [{ id: clientId, nombre: "x" }] };
    const { error } = await admin.rpc("at_canal_aplicar", {
      p_entrante: (reg as { id: string }).id, p_canal: "sms", p_telefono: TEL_EXTRANO,
      p_sesion_accion: "guardar", p_sesion: sesion,
      p_mensajes: [{ para: TEL_EXTRANO, texto: "hola de prueba" }],
    });
    expect(error).toBeNull();

    const ctx = (await admin.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: TEL_EXTRANO })).data as {
      sesion: unknown;
    };
    expect(ctx.sesion).toEqual(sesion);
    const otroCanal = (await admin.rpc("at_canal_contexto", { p_canal: "whatsapp", p_telefono: TEL_EXTRANO })).data as {
      sesion: unknown;
    };
    expect(otroCanal.sesion).toBeNull();

    const { data: buzon } = await admin.from("at_message_outbox").select("body, channel").eq("to_phone", TEL_EXTRANO);
    expect(buzon).toContainEqual({ body: "hola de prueba", channel: "sms" });

    await admin.rpc("at_canal_marcar_baja", { p_telefono: TEL_EXTRANO, p_baja: true });
    expect(((await admin.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: TEL_EXTRANO })).data as { baja: boolean }).baja).toBe(true);
    await admin.rpc("at_canal_marcar_baja", { p_telefono: TEL_EXTRANO, p_baja: false });
    expect(((await admin.rpc("at_canal_contexto", { p_canal: "sms", p_telefono: TEL_EXTRANO })).data as { baja: boolean }).baja).toBe(false);
  });

  it("de punta a punta: el motor contesta GUIA con la base de verdad", async () => {
    const r = await procesar(fuenteSupabase(admin), {
      canal: "sms",
      telefono: TEL_DESTINATARIO,
      texto: `guia ${guia.guide_number}`,
      proveedorId: `e2e-${palabra}`,
    });
    // Sin cuenta, pero GUIA es del motor: no pasa por el alta de la 0145.
    expect(r.ruta).toBe("motor");
    expect(r.mensajes[0].texto).toContain(`Guia ${guia.guide_number}`);
    expect(r.mensajes[0].texto).toContain("registrada, falta recogerla");

    const { data: buzon } = await admin.from("at_message_outbox").select("body").eq("to_phone", E164(TEL_DESTINATARIO));
    expect((buzon as { body: string }[]).map((b) => b.body)).toContain(r.mensajes[0].texto);

    // Y el reintento del gateway con el mismo id no contesta dos veces.
    const otra = await procesar(fuenteSupabase(admin), {
      canal: "sms",
      telefono: TEL_DESTINATARIO,
      texto: `guia ${guia.guide_number}`,
      proveedorId: `e2e-${palabra}`,
    });
    expect(otra.ruta).toBe("repetido");
  });
});
