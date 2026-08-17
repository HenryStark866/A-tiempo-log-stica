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
 * ═══════════════════════════════════════════════════════════════════════════
 * EL COBRO
 *
 * Lo que más pesa de todo lo que faltaba por probar. Nueve comercios reciben
 * una factura calculada por estas funciones, y hoy nada las verifica: cambiar
 * `at_cobro_de_guia` compila igual de bien y la equivocación no aparece hasta
 * que alguien revisa su factura — si la revisa.
 *
 * La buena noticia es que la migración 0062 dejó el cobro en UNA sola función
 * pura: `at_cobro_de_guia(g at_guides) → (monto, descripcion)`. Es `stable`,
 * recibe la fila entera y no escribe nada, así que se puede llamar con guías
 * inventadas sin montar escenario ni ensuciar la base. Eso hace estos tests
 * baratos y rápidos, que es justo lo que permite que se corran siempre.
 *
 * ── Por qué existe esa función ───────────────────────────────────────────
 * Antes había dos caminos de facturación y cobraban distinto: el automático
 * (`at_facturar_guia`, al entregar) usaba el precio real congelado en la guía;
 * el manual (`at_generate_invoice`, el botón de Facturación) seguía en la
 * tarifa plana de 6.000 y no sabía nada del contraentrega. La misma guía valía
 * una cosa u otra según por dónde se facturara — y por el camino manual, mal
 * dos veces: domicilio de menos, y cobrado un domicilio que el comprador ya
 * había pagado en la puerta.
 *
 * El test que cierra esa puerta es `los dos caminos cobran lo mismo`, al final.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * PostgREST acepta un parámetro de tipo compuesto como objeto JSON. Solo hace
 * falta poner las columnas que la función mira; el resto quedan en null.
 *
 * Si esto falla contra el esquema real, es probable que PostgREST exija el
 * objeto completo o que rechace claves desconocidas. En ese caso, la salida es
 * insertar la guía de verdad con `service_role` y pasarle la fila leída.
 */
type GuiaParaCobro = {
  guide_number: string;
  recipient_name: string;
  status: string;
  shipping_fee: number | null;
  cod_includes_shipping: boolean;
  client_id: string | null;
};

function guia(over: Partial<GuiaParaCobro> = {}): GuiaParaCobro {
  return {
    guide_number: "ATL-999001",
    recipient_name: "Destinatario de prueba",
    status: "entregada",
    shipping_fee: 12_000,
    cod_includes_shipping: false,
    client_id: null,
    ...over,
  };
}

describeDb("at_cobro_de_guia — el único criterio para cobrar una guía", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = clienteAdmin();
  });

  async function cobrar(g: GuiaParaCobro) {
    const { data, error } = await admin.rpc("at_cobro_de_guia", { g });
    if (error) throw new Error(`at_cobro_de_guia falló: ${error.message}`);
    // Una función con dos OUT devuelve una fila; supabase-js la entrega como
    // arreglo de un elemento o como objeto según la versión.
    const fila = Array.isArray(data) ? data[0] : data;
    return fila as { monto: number; descripcion: string };
  }

  it("una entrega normal cobra el domicilio congelado en la guía", () => {
    // `shipping_fee` se congela al crear la guía a propósito: un cambio de
    // tarifario mañana no puede reescribir lo ya facturado.
    return cobrar(guia({ shipping_fee: 12_000 })).then((r) => {
      expect(Number(r.monto)).toBe(12_000);
      expect(r.descripcion).toContain("ATL-999001");
      expect(r.descripcion).toContain("Destinatario de prueba");
    });
  });

  it("si el domicilio venía dentro del contraentrega, no se le cobra al comercio", async () => {
    // El mensajero ya se lo cobró al comprador en la puerta. Cobrárselo también
    // al comercio es cobrar dos veces el mismo viaje — el bug que arregló 0062.
    const r = await cobrar(guia({ cod_includes_shipping: true, shipping_fee: 12_000 }));
    expect(Number(r.monto)).toBe(0);
    expect(r.descripcion).toContain("cobrado al comprador");
  });

  it("la línea en cero SIGUE apareciendo en la factura", async () => {
    // Deliberado: el comercio tiene que ver la entrega y entender por qué no se
    // le cobra. Una línea que desaparece parece un error de facturación.
    const r = await cobrar(guia({ cod_includes_shipping: true }));
    expect(r.descripcion.length).toBeGreaterThan(0);
    expect(r.descripcion).toContain("ATL-999001");
  });

  it("una guía sin tarifa cobra cero, no revienta ni cobra null", async () => {
    const r = await cobrar(guia({ shipping_fee: null }));
    expect(Number(r.monto)).toBe(0);
  });

  it("«devuelta» manda sobre el contraentrega", async () => {
    // Es el orden del if/elsif en la función, y no es casual: una devolución se
    // cobra como logística inversa aunque el domicilio original fuera COD.
    // Sin `client_id` real, `return_rate` cae al coalesce en 0.
    const r = await cobrar(guia({ status: "devuelta", cod_includes_shipping: true }));
    expect(r.descripcion).toContain("Devolución");
    expect(r.descripcion).toContain("logística inversa");
  });
});

describeDb("at_cobro_de_guia — la devolución cobra la tarifa del comercio", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const u = await crearUsuario(admin, "cobro-devolucion", { role: "cliente" });
    usuarios.push(u.id);

    const { data: perfil } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", u.id)
      .maybeSingle();
    clientId = (perfil as { client_id: string | null } | null)?.client_id ?? null;

    if (clientId) {
      await admin.from("at_clients").update({ return_rate: 7_500 }).eq("id", clientId);
    }
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("usa return_rate del comercio, no el domicilio original", async () => {
    if (!clientId) return;
    const { data, error } = await admin.rpc("at_cobro_de_guia", {
      g: guia({ status: "devuelta", shipping_fee: 22_000, client_id: clientId }),
    });
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) as { monto: number };
    expect(Number(r.monto)).toBe(7_500);
  });

  it("un comercio sin return_rate cobra cero, no null", async () => {
    if (!clientId) return;
    await admin.from("at_clients").update({ return_rate: null }).eq("id", clientId);
    const { data } = await admin.rpc("at_cobro_de_guia", {
      g: guia({ status: "devuelta", client_id: clientId }),
    });
    const r = (Array.isArray(data) ? data[0] : data) as { monto: number };
    expect(Number(r.monto)).toBe(0);
  });
});

describeDb("at_ciclo_cobro — el plazo vive en un solo sitio", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = clienteAdmin();
  });

  it("son 24 horas", async () => {
    // Migración 0058. Si alguien lo cambia, que sea a propósito y aquí se
    // entere: de este intervalo depende cuándo se le frenan las recogidas a un
    // comercio, que es meterse con su operación.
    const { data, error } = await admin.rpc("at_ciclo_cobro");
    if (error) throw new Error(error.message);
    expect(String(data)).toMatch(/24:00:00|1 day|24 hours/);
  });
});

describeDb("at_estado_cartera — al día, saldo y vencimiento", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const u = await crearUsuario(admin, "cartera", { role: "cliente" });
    usuarios.push(u.id);
    const { data: perfil } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", u.id)
      .maybeSingle();
    clientId = (perfil as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("un comercio recién creado está al día y con saldo cero", async () => {
    if (!clientId) return;
    const { data, error } = await admin.rpc("at_estado_cartera", { p_client_id: clientId });
    if (error) throw new Error(error.message);
    const e = data as { al_dia: boolean; saldo: number };
    expect(e.al_dia).toBe(true);
    expect(Number(e.saldo)).toBe(0);
  });

  it("una factura recién emitida NO lo pone en mora", async () => {
    // El plazo corre desde `created_at`: dentro de las 24 h sigue al día. Si
    // esto falla, a un comercio se le frenan las recogidas el mismo día que se
    // le factura, sin haber tenido tiempo de pagar.
    if (!clientId) return;
    const { data: inv } = await admin
      .from("at_invoices")
      .insert({ client_id: clientId, period_start: "2026-08-01", period_end: "2026-08-16" })
      .select("id")
      .maybeSingle();

    const { data } = await admin.rpc("at_estado_cartera", { p_client_id: clientId });
    expect((data as { al_dia: boolean }).al_dia).toBe(true);

    const id = (inv as { id: string } | null)?.id;
    if (id) await admin.from("at_invoices").delete().eq("id", id);
  });
});

describeDb("los dos caminos de facturación cobran lo mismo", () => {
  /**
   * El test que justifica la migración 0062 entera.
   *
   * Hoy los dos caminos llaman a `at_cobro_de_guia` —el manual con
   * `cross join lateral`, el automático con un `select … into`— así que no
   * pueden discrepar. Este test no comprueba que hoy funcione: comprueba que
   * SIGA sin poder discrepar. El día que alguien meta una regla de cobro en
   * uno solo de los dos, esto es lo único que lo detecta.
   *
   * Ojo: `at_generate_invoice` exige `at_is_ops()`, y `service_role` NO la
   * cumple —`auth.uid()` es null—. Hace falta una sesión de admin de verdad.
   */
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let ops: SupabaseClient | null = null;
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();

    const jefe = await crearUsuario(admin, "ops", { role: "admin" });
    usuarios.push(jefe.id);
    await admin.from("at_profiles").update({ role: "admin" }).eq("id", jefe.id);
    ops = await clienteComo(jefe.email, CLAVE_DE_PRUEBA);

    const comercio = await crearUsuario(admin, "dos-caminos", { role: "cliente" });
    usuarios.push(comercio.id);
    await clienteComo(comercio.email, CLAVE_DE_PRUEBA); // dispara el autoaprovisionamiento
    const { data: perfil } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", comercio.id)
      .maybeSingle();
    clientId = (perfil as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("la misma guía vale lo mismo por el trigger que por el botón", async () => {
    if (!ops || !clientId) return;

    const base = {
      client_id: clientId,
      recipient_name: "Comparativa",
      recipient_address: "Calle 1 #2-3",
      shipping_fee: 14_500,
      cod_includes_shipping: false,
    };

    // ── Camino automático: el trigger al pasar a entregada ──────────────
    const { data: gA } = await admin.from("at_guides").insert(base).select("id").maybeSingle();
    const idA = (gA as { id: string } | null)?.id;
    if (!idA) return;
    await admin
      .from("at_guides")
      .update({ status: "entregada", delivered_at: new Date().toISOString() })
      .eq("id", idA);

    const { data: itemA } = await admin
      .from("at_invoice_items")
      .select("amount")
      .eq("guide_id", idA)
      .maybeSingle();

    // ── Camino manual: el botón de Facturación ──────────────────────────
    const { data: gB } = await admin.from("at_guides").insert(base).select("id").maybeSingle();
    const idB = (gB as { id: string } | null)?.id;
    if (!idB) return;
    // Sin disparar el trigger: se marca entregada saltándose el cambio de
    // estado que lo activa no es posible, así que se factura lo que quede sin
    // `invoice_id` en el periodo.
    const hoy = new Date().toISOString().slice(0, 10);
    await ops.rpc("at_generate_invoice", {
      p_client_id: clientId,
      p_period_start: hoy,
      p_period_end: hoy,
    });

    const { data: itemB } = await admin
      .from("at_invoice_items")
      .select("amount")
      .eq("guide_id", idB)
      .maybeSingle();

    const a = Number((itemA as { amount: number } | null)?.amount ?? -1);
    const b = Number((itemB as { amount: number } | null)?.amount ?? -2);
    expect(a).toBe(b);
    expect(a).toBe(14_500);

    await admin.from("at_guides").delete().in("id", [idA, idB]);
  });

  it("una guía ya facturada no se vuelve a facturar", async () => {
    // `invoice_id is null` es el filtro que lo impide. Sin él, darle dos veces
    // al botón de Facturación le cobra dos veces al comercio el mismo envío.
    if (!ops || !clientId) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: segunda } = await ops.rpc("at_generate_invoice", {
      p_client_id: clientId,
      p_period_start: hoy,
      p_period_end: hoy,
    });
    const inv = segunda as { id: string; total: number } | null;
    if (inv) expect(Number(inv.total)).toBe(0);
  });
});

/**
 * ── Lo que falta y hay que escribir con la base delante ───────────────────
 *
 * 1. TARIFA POR PAR DE ZONAS (0051 + 0057). `at_set_tarifa_par` y
 *    `at_set_guide_shipping_fee`: que un comercio de Girardota que entrega en
 *    Girardota NO pague los 22.000 de cruzar el valle, y que el precio quede
 *    CONGELADO en la guía — cambiar el tarifario mañana no puede reescribir lo
 *    ya facturado. Son 25 pares sobre 5 zonas.
 *
 * 2. LA CUOTA SAAS NO PARA LA OPERACIÓN (0075 + 0080). `at_cobrar_cuota_saas`
 *    y `at_fijar_cuota_saas`: una cuota de plataforma pendiente puede avisar,
 *    pero no puede dejar a un comercio sin mover paquetes. Es una decisión de
 *    negocio escrita en SQL y conviene que esté fijada por un test.
 *
 * El recaudo contraentrega está en `recaudo.test.ts`.
 */
