import { it, expect, beforeAll, afterAll, describe } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { borrarUsuarios, clienteAdmin, crearUsuario, describeDb } from "./harness";
import { enviarPorCelular } from "../../supabase/functions/enviar-mensajes/smsgate";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUENTE YAM → SolV Y SMS DE CONFIRMACIÓN (migraciones 0140–0142)
 *
 * Recorre los dos caminos del contrato de integración:
 *   cobro  → evento en la cola de SolV + SMS «pago recibido» en el buzón
 *   entrega / intento fallido → SMS en el buzón
 *   remesa → evento + SMS «remesa liquidada», y «pago enviado» al confirmar
 * y comprueba que el buzón se despacha contra un servidor SMS SIMULADO. Jamás
 * sale un SMS de verdad.
 *
 * `destinatario` es un teléfono de prueba (nunca el de un cliente).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const TEL_DESTINATARIO = "3000000001";
const TEL_COMERCIO = "3000000002";

describeDb("puente SolV y SMS de confirmación", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clientId: string;
  let courierId: string;
  const guias: string[] = [];
  let remesaId: string | null = null;
  let settlementId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const comercio = await crearUsuario(admin, "puente-comercio", { role: "cliente" });
    const mensajero = await crearUsuario(admin, "puente-mensajero", { role: "mensajero" });
    usuarios.push(comercio.id, mensajero.id);
    courierId = mensajero.id;
    const { data: perfil } = await admin.from("at_profiles").select("client_id").eq("id", comercio.id).maybeSingle();
    clientId = (perfil as { client_id: string }).client_id;
    await admin.from("at_clients").update({ phone: TEL_COMERCIO }).eq("id", clientId);
  }, 60_000);

  afterAll(async () => {
    if (remesaId) await admin.from("at_cod_remittances").delete().eq("id", remesaId);
    if (guias.length) await admin.from("at_guides").delete().in("id", guias);
    if (settlementId) await admin.from("at_settlements").delete().eq("id", settlementId);
    await admin.from("at_solv_eventos").delete().in("ref_id", [...guias, ...(remesaId ? [remesaId] : []), ...(settlementId ? [settlementId] : [])]);
    await borrarUsuarios(admin, usuarios);
  });

  async function nuevaGuia(over: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("at_guides")
      .insert({
        client_id: clientId,
        recipient_name: "Comprador de prueba",
        recipient_phone: TEL_DESTINATARIO,
        recipient_address: "Calle 1 #2-3",
        is_cod: true,
        cod_amount: 20_000,
        shipping_fee: 6_000,
        ...over,
      })
      .select("id, guide_number")
      .single();
    if (error) throw new Error(error.message);
    guias.push(data.id);
    return data as { id: string; guide_number: string };
  }

  const mensajesDe = async (guideId: string) => {
    const { data } = await admin.from("at_message_outbox").select("*").eq("guide_id", guideId);
    return (data ?? []) as Array<{ plantilla: string | null; channel: string; body: string; to_phone: string; intent_id: string | null; status: string }>;
  };

  it("cobro: entregar un contraentrega encola el evento para SolV con el monto en unidades mínimas", async () => {
    const g = await nuevaGuia();
    await admin.from("at_guides").update({ status: "entregada", delivered_at: new Date().toISOString() }).eq("id", g.id);

    const { data: ev } = await admin.from("at_solv_eventos").select("*").eq("ref_id", g.id);
    expect(ev).toHaveLength(1);
    const e = ev![0];
    expect(e.tipo_evento).toBe("incoming_payment.completed");
    expect(e.status).toBe("pendiente");
    expect(e.intencion.tipo).toBe("cobro_comercio");
    expect(e.intencion.monto).toBe("2000000"); // $20.000 × 100
    expect(e.intencion.asset_code).toBe("COP");
    expect(e.intencion.asset_scale).toBe(2);
    expect(e.intencion.ref_yam.guia_id).toBe(g.id);
    expect(e.evento.event_id).toBe(e.event_id);
    expect(e.evento.intent_id).toBe(e.intent_id);
  });

  it("cobro → mensaje: el comprador recibe «pago recibido» con la referencia del intent", async () => {
    const g = guias[0];
    const { data: ev } = await admin.from("at_solv_eventos").select("intent_id").eq("ref_id", g).single();
    const m = (await mensajesDe(g)).find((x) => x.plantilla === "pago_recibido");
    expect(m).toBeDefined();
    expect(m!.channel).toBe("sms");
    expect(m!.status).toBe("pendiente");
    expect(m!.to_phone).toBe(TEL_DESTINATARIO);
    expect(m!.intent_id).toBe(ev!.intent_id);
    expect(m!.body).toContain("$20.000");
    expect(m!.body).toContain(String(ev!.intent_id).slice(0, 8));
    expect(m!.body).toMatch(/^[\x20-\x7e]+$/); // ASCII: un solo segmento GSM-7
    expect(m!.body.length).toBeLessThanOrEqual(160);
  });

  it("entrega → mensaje: «guía entregada» sale con el número de pedido, una sola vez", async () => {
    const g = guias[0];
    await admin.from("at_guides").update({ status: "entregada", notes: "toque repetido" }).eq("id", g);
    const msgs = (await mensajesDe(g)).filter((x) => x.plantilla === "guia_entregada");
    expect(msgs).toHaveLength(1);
    const { data: gd } = await admin.from("at_guides").select("guide_number").eq("id", g).single();
    expect(msgs[0].body).toContain(gd!.guide_number);
  });

  it("un pedido que no es contraentrega avisa la entrega pero no genera evento de cobro", async () => {
    const g = await nuevaGuia({ is_cod: false, cod_amount: 0 });
    await admin.from("at_guides").update({ status: "entregada", delivered_at: new Date().toISOString() }).eq("id", g.id);
    const { data: ev } = await admin.from("at_solv_eventos").select("id").eq("ref_id", g.id);
    expect(ev).toHaveLength(0);
    const plantillas = (await mensajesDe(g.id)).map((m) => m.plantilla);
    expect(plantillas).toContain("guia_entregada");
    expect(plantillas).not.toContain("pago_recibido");
  });

  it("intento fallido → mensaje: un solo aviso por intento aunque pase por varios estados", async () => {
    const g = await nuevaGuia();
    await admin.from("at_guides").update({ status: "novedad", delivery_attempts: 1 }).eq("id", g.id);
    await admin.from("at_guides").update({ status: "reprogramada" }).eq("id", g.id);
    const msgs = (await mensajesDe(g.id)).filter((m) => m.plantilla === "intento_fallido");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("intento 1");
    expect(msgs[0].body).toContain(g.guide_number);
  });

  it("guía recogida con código: el SMS lleva el código, el pedido y cabe en un segmento", async () => {
    const g = await nuevaGuia();
    const { error } = await admin.rpc("at_issue_delivery_code", { p_guide_id: g.id });
    // La función se revoca a anon/authenticated; service_role sí puede.
    if (error) throw new Error(error.message);
    const sms = (await mensajesDe(g.id)).find((m) => m.channel === "sms");
    expect(sms).toBeDefined();
    expect(sms!.body).toMatch(/codigo de entrega \d{6}/);
    expect(sms!.body).toContain(g.guide_number);
    expect(sms!.body).toMatch(/^[\x20-\x7e]+$/);
    expect(sms!.body.length).toBeLessThanOrEqual(160);
  });

  it("conciliar un cierre de caja encola cash.received_by_agent con lo consignado", async () => {
    const { data, error } = await admin
      .from("at_settlements")
      .insert({ courier_id: courierId, expected_amount: 20_000, deposited_amount: 19_500 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    settlementId = data.id;
    await admin.from("at_settlements").update({ status: "conciliado" }).eq("id", settlementId);
    const { data: ev } = await admin.from("at_solv_eventos").select("*").eq("ref_id", settlementId!);
    expect(ev).toHaveLength(1);
    expect(ev![0].tipo_evento).toBe("cash.received_by_agent");
    expect(ev![0].intencion.tipo).toBe("liquidacion_mensajero");
    expect(ev![0].intencion.monto).toBe("1950000");
  });

  it("remesa → evento y mensaje; marcarla pagada dos veces no duplica nada", async () => {
    const { data, error } = await admin
      .from("at_cod_remittances")
      .insert({ client_id: clientId, period_start: "2026-10-01", period_end: "2026-10-15", gross_amount: 20_000, net_amount: 14_000 })
      .select("id, remittance_number")
      .single();
    if (error) throw new Error(error.message);
    remesaId = data.id;

    await admin.from("at_cod_remittances").update({ status: "pagada", paid_at: new Date().toISOString() }).eq("id", remesaId);
    await admin.from("at_cod_remittances").update({ status: "pendiente" }).eq("id", remesaId);
    await admin.from("at_cod_remittances").update({ status: "pagada" }).eq("id", remesaId);

    const { data: ev } = await admin.from("at_solv_eventos").select("*").eq("ref_id", remesaId!);
    expect(ev).toHaveLength(1);
    expect(ev![0].tipo_evento).toBe("outgoing_payment.completed");
    expect(ev![0].intencion.tipo).toBe("remesa");
    expect(ev![0].intencion.monto).toBe("1400000");
    expect(ev![0].intencion.receptor_wallet).toBe(`yam:comercio:${clientId}`);

    const { data: sms } = await admin.from("at_message_outbox").select("*").eq("plantilla", "remesa_liquidada").eq("ref_key", remesaId!);
    expect(sms).toHaveLength(1);
    expect(sms![0].to_phone).toBe(TEL_COMERCIO);
    expect(sms![0].body).toContain(data.remittance_number);
    expect(sms![0].body).toContain("$14.000");
  });

  it("pago enviado: lo encola el orquestador al confirmar, y una segunda confirmación no repite", async () => {
    const { data: ev } = await admin.from("at_solv_eventos").select("intent_id").eq("ref_id", remesaId!).single();
    const a = await admin.rpc("at_solv_confirmar_pago_enviado", { p_intent_id: ev!.intent_id });
    const b = await admin.rpc("at_solv_confirmar_pago_enviado", { p_intent_id: ev!.intent_id });
    expect(a.data).toBe(true);
    expect(b.data).toBe(false);
    const { data: sms } = await admin.from("at_message_outbox").select("body, to_phone").eq("plantilla", "pago_enviado").eq("ref_key", ev!.intent_id);
    expect(sms).toHaveLength(1);
    expect(sms![0].to_phone).toBe(TEL_COMERCIO);
  });

  it("la cola de SolV se consume por lotes y un evento no se entrega a dos consumidores", async () => {
    const { data: tomados } = await admin.rpc("at_solv_tomar_eventos", { p_limite: 100 });
    const mios = (tomados as Array<{ ref_id: string; event_id: string }>).filter((e) => guias.includes(e.ref_id));
    expect(mios.length).toBeGreaterThan(0);
    const { data: otra } = await admin.rpc("at_solv_tomar_eventos", { p_limite: 100 });
    expect((otra as Array<{ event_id: string }>).some((e) => mios.some((m) => m.event_id === e.event_id))).toBe(false);

    await admin.rpc("at_solv_marcar_evento", { p_event_id: mios[0].event_id, p_ok: true });
    const { data: marcado } = await admin.from("at_solv_eventos").select("status, sent_at").eq("event_id", mios[0].event_id).single();
    expect(marcado!.status).toBe("enviado");
    expect(marcado!.sent_at).not.toBeNull();
  });

  it("anon no puede leer la cola ni llamar a las funciones del puente", async () => {
    const { clienteAnonimo } = await import("./harness");
    const anon = clienteAnonimo();
    const { data } = await anon.from("at_solv_eventos").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
    const r = await anon.rpc("at_solv_tomar_eventos", { p_limite: 1 });
    expect(r.error).not.toBeNull();
  });

  describe("el buzón se despacha contra un servidor SMS simulado", () => {
    let mock: Server;
    let url: string;
    const recibidos: Array<{ to: string[]; text: string }> = [];

    beforeAll(async () => {
      mock = createServer((req, res) => {
        let t = "";
        req.on("data", (c) => (t += c));
        req.on("end", () => {
          const j = JSON.parse(t || "{}");
          recibidos.push({ to: j.phoneNumbers, text: j.textMessage?.text });
          res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ id: `mock-${recibidos.length}` }));
        });
      });
      await new Promise<void>((ok) => mock.listen(0, "127.0.0.1", ok));
      url = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((ok) => mock.close(() => ok())));

    it("los SMS pendientes de estas guías salen al mock, no a un celular", async () => {
      const { data } = await admin
        .from("at_message_outbox")
        .select("id, to_phone, body, guide_id")
        .eq("channel", "sms")
        .eq("status", "pendiente")
        .in("guide_id", guias);
      expect((data ?? []).length).toBeGreaterThan(3);

      for (const m of data!) {
        const id = await enviarPorCelular(
          { url, usuario: "test", clave: "test", soloA: `+57${TEL_DESTINATARIO}` },
          `+57${m.to_phone}`,
          m.body,
        );
        expect(id).toMatch(/^mock-/);
      }
      expect(recibidos).toHaveLength(data!.length);
      expect(recibidos.some((r) => r.text.includes("pago de $20.000"))).toBe(true);
      expect(recibidos.every((r) => r.to[0] === `+57${TEL_DESTINATARIO}`)).toBe(true);
    });
  });
});
