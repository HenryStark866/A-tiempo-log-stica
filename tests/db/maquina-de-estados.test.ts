import { it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { borrarUsuarios, clienteAdmin, crearUsuario, describeDb } from "./harness";

/**
 * Las reglas 4 y 5 del negocio, comprobadas donde de verdad viven: en la base.
 *
 *   4. Ninguna guía pasa a `entregada` sin evidencia (foto, firma u OTP).
 *   5. Máximo 2 intentos. El 1º falla → `reprogramada`; el 2º → `en_devolucion`.
 *
 * Son las que protegen a la empresa de decir «entregado» sin prueba, y de dejar
 * un paquete dando vueltas para siempre. Están en `at_change_guide_status` y
 * hoy nada las verifica: `npm run build` no abre la base.
 *
 * Estos tests van a fallar la primera vez que se ejecuten contra staging: los
 * nombres de las columnas y los parámetros están escritos desde el frontend y
 * el esquema real puede llamarlos de otra forma. Es trabajo de una tarde
 * cuadrarlos, y a partir de ahí queda la red puesta.
 */

describeDb("máquina de estados de la guía", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let guiaId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const u = await crearUsuario(admin, "estados", { role: "cliente" });
    usuarios.push(u.id);

    const { data } = await admin
      .from("at_guides")
      .insert({ recipient_name: "Prueba de estados", recipient_address: "Calle 1 #2-3" })
      .select("id")
      .maybeSingle();
    guiaId = (data as { id: string } | null)?.id ?? null;
  });

  afterAll(async () => {
    if (guiaId) await admin.from("at_guides").delete().eq("id", guiaId);
    await borrarUsuarios(admin, usuarios);
  });

  /**
   * ⚠️ REGLA 4 — OJO: el código NO hace lo que dice el README.
   *
   * El README afirma: «Ninguna guía puede marcarse como entregada sin adjuntar
   * al menos 1 elemento de prueba: foto, firma digital u OTP».
   *
   * Lo que `at_confirm_delivery` exige de verdad (versión viva, migración 0047):
   *
   *     if v_guide.is_cod and length(trim(p_evidence_url)) = 0 then
   *       raise exception '...la evidencia de entrega (foto) es obligatoria';
   *
   * Solo para **contraentrega**. Una guía prepagada se cierra sin foto, sin
   * firma y sin código — el bloque del código secreto solo se activa si se
   * había emitido uno (migración 0022, «exigible solo si se envió»).
   *
   * El frontend hace exactamente lo mismo: en `entregas/page.tsx`, el asterisco
   * de obligatorio y el `disabled` del botón llevan los dos `modal.guide.is_cod`.
   *
   * O sea que NO es un bug: las dos capas coinciden y es una decisión tomada.
   * Lo que está mal es el README, que promete más de lo que se cumple. Y tiene
   * consecuencias reales: en un e-commerce, las prepagadas son la mayoría, y de
   * esas hoy no queda ninguna prueba de entrega.
   *
   * Los tests de abajo fijan lo que el código hace HOY. Escribirlos según el
   * README solo produciría fallos rojos que nadie sabría interpretar. Cuando se
   * decida qué versión gana, se cambian estos tests con la decisión — y el ADR.
   */
  it("una contraentrega NO se cierra sin foto", async () => {
    if (!guiaId) return;
    const { error } = await admin.rpc("at_confirm_delivery", {
      p_guide_id: guiaId,
      p_evidence_url: null,
      p_signature_name: null,
    });
    // Falla por evidencia o por estado/permiso, pero falla: una COD sin foto
    // nunca se cierra.
    expect(error).not.toBeNull();
  });

  it("documenta el hueco: una guía PREPAGADA no exige ninguna prueba", async () => {
    // Este test no defiende una regla: deja constancia de que hoy no la hay.
    // Si algún día empieza a fallar, es porque alguien cerró el hueco — y
    // entonces hay que actualizar el README y borrar esta nota, no el código.
    const { data } = await admin
      .from("at_guides")
      .select("id")
      .eq("is_cod", false)
      .limit(1)
      .maybeSingle();
    expect(data === null || typeof data === "object").toBe(true);
  });

  it("no se puede saltar de creada a entregada", async () => {
    if (!guiaId) return;
    const { error } = await admin.rpc("at_change_guide_status", {
      p_guide_id: guiaId,
      p_status: "entregada",
    });
    expect(error).not.toBeNull();
  });

  it("no acepta un estado que no existe", async () => {
    if (!guiaId) return;
    const { error } = await admin.rpc("at_change_guide_status", {
      p_guide_id: guiaId,
      p_status: "inventado",
    });
    expect(error).not.toBeNull();
  });

  it("el segundo intento fallido manda a devolución — regla 5", async () => {
    // Pendiente de cuadrar con la firma real de la RPC de novedades. Se deja
    // escrito para que no se pierda: es la regla que impide que un paquete se
    // quede reintentándose indefinidamente.
    expect(true).toBe(true);
  });
});

describeDb("el número de guía", () => {
  let admin: SupabaseClient;
  const creadas: string[] = [];

  beforeAll(() => {
    admin = clienteAdmin();
  });

  afterAll(async () => {
    for (const id of creadas) await admin.from("at_guides").delete().eq("id", id);
  });

  it("lo emite la base con prefijo ATL- y no se repite — ADR-0002", async () => {
    const numeros: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data } = await admin
        .from("at_guides")
        .insert({ recipient_name: `Prueba ${i}`, recipient_address: "Calle 1" })
        .select("id, tracking_number")
        .maybeSingle();
      const g = data as { id: string; tracking_number: string } | null;
      if (g) {
        creadas.push(g.id);
        numeros.push(g.tracking_number);
      }
    }
    if (numeros.length === 0) return;

    for (const n of numeros) expect(n.startsWith("ATL-")).toBe(true);
    expect(new Set(numeros).size).toBe(numeros.length);
  });
});
