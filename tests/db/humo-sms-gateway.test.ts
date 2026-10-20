import { it, expect, beforeAll, afterAll, describe } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { borrarUsuarios, clienteAdmin, crearUsuario, hayBase } from "./harness";
import { enviarPorCelular } from "../../supabase/functions/enviar-mensajes/smsgate";

/**
 * PRUEBA DE HUMO CONTRA SMS GATEWAY (LDPlayer o celular propio)
 *
 * Se salta sola salvo que estén TODAS estas variables (las pone Henry en su
 * consola; nunca van a un archivo):
 *
 *   SMSGATE_URL        http://127.0.0.1:18080   (tras: adb -s emulator-5554 forward tcp:18080 tcp:8080)
 *   SMSGATE_USER / SMSGATE_PASS   las que muestra la app
 *   SMSGATE_SOLO_A     +57XXXXXXXXXX  (E.164 válido; con LDPlayer no se entrega a nadie)
 *
 * Encola una guía de prueba en la base LOCAL, toma sus SMS pendientes y los
 * manda por la app. El seguro SOLO_A impide escribirle a cualquier otro número.
 * Con un celular real, ejecutarla solo con la confirmación de Henry en el chat.
 */
const URL_ = process.env.SMSGATE_URL;
const USER = process.env.SMSGATE_USER;
const PASS = process.env.SMSGATE_PASS;
const SOLO_A = process.env.SMSGATE_SOLO_A;
const listo = hayBase && !!(URL_ && USER && PASS && SOLO_A && /^\+57\d{10}$/.test(SOLO_A));

(listo ? describe : describe.skip)("humo: los SMS del buzón salen por SMS Gateway", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let guideId: string;

  beforeAll(async () => {
    admin = clienteAdmin();
    const u = await crearUsuario(admin, "humo-sms", { role: "cliente" });
    usuarios.push(u.id);
    const { data: p } = await admin.from("at_profiles").select("client_id").eq("id", u.id).single();
    const { data: g, error } = await admin
      .from("at_guides")
      .insert({
        client_id: (p as { client_id: string }).client_id,
        recipient_name: "Humo",
        recipient_phone: SOLO_A!.slice(3), // 10 dígitos; la función de envío lo pasa a +57
        recipient_address: "Calle 1 #2-3",
        is_cod: true,
        cod_amount: 20_000,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    guideId = g.id;
  }, 60_000);

  afterAll(async () => {
    if (guideId) {
      await admin.from("at_solv_eventos").delete().eq("ref_id", guideId);
      await admin.from("at_guides").delete().eq("id", guideId);
    }
    await borrarUsuarios(admin, usuarios);
  });

  it("entrega + cobro: los SMS encolados los acepta la app", async () => {
    await admin.from("at_guides").update({ status: "entregada", delivered_at: new Date().toISOString() }).eq("id", guideId);
    const { data } = await admin
      .from("at_message_outbox")
      .select("id, body, plantilla")
      .eq("guide_id", guideId)
      .eq("channel", "sms")
      .eq("status", "pendiente");
    expect((data ?? []).map((m) => m.plantilla).sort()).toEqual(["guia_entregada", "pago_recibido"]);

    for (const m of data!) {
      const id = await enviarPorCelular({ url: URL_!, usuario: USER!, clave: PASS!, soloA: SOLO_A }, SOLO_A!, m.body);
      expect(id.length).toBeGreaterThan(0);
      await admin.from("at_message_outbox").update({ status: "enviado", provider_id: id, sent_at: new Date().toISOString() }).eq("id", m.id);
    }
  }, 60_000);
});
