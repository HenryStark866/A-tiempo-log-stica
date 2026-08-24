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
 * EL CATÁLOGO Y LA BASE DE COMPRADORES
 *
 * Lo que sube el comercio por archivo, y lo que su asesor ve al hacer un
 * pedido. Dos cosas distintas con permisos distintos, y conviene que ninguna
 * se mueva sin que salte un test:
 *
 *   · SUBIR EL ARCHIVO es del dueño. Reemplaza la base de golpe, así que no
 *     es decisión de quien trabaja para él. Lo impone at_sync_products /
 *     at_sync_recipients exigiendo rol 'cliente'.
 *
 *   · VER Y CREAR UNO A UNO es también del asesor. Es su trabajo diario: sin
 *     eso no puede despachar. Lo permite la política de RLS de la migración
 *     0081, que mira client_id = at_my_client() — y at_my_client() devuelve el
 *     comercio de quien sea, dueño o asesor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

describeDb("at_parse_money — el precio que viene en el CSV", () => {
  /**
   * El más barato de todos los tests de este repo y el que más dinero protege:
   * `at_parse_money` es `immutable`, no toca ninguna tabla y no necesita
   * escenario. Se le pasan cadenas y se comprueba el número.
   *
   * Un fallo aquí no se ve en pantalla como un error: se ve como un producto
   * que cuesta cien veces más. Y ese precio viaja al contraentrega, así que el
   * mensajero se lo cobra al comprador en la puerta.
   */
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = clienteAdmin();
  });

  async function money(texto: string | null) {
    const { data, error } = await admin.rpc("at_parse_money", { p: texto });
    if (error) throw new Error(`at_parse_money(${JSON.stringify(texto)}): ${error.message}`);
    return Number(data);
  }

  const casos: [string | null, number, string][] = [
    // Lo que escribe la gente de verdad, sacado de la plantilla que descarga
    // el comercio en la pantalla de destinatarios.
    ["145000", 145_000, "entero plano"],
    ["$ 89.900", 89_900, "con símbolo y punto de miles"],
    ["89.900", 89_900, "punto de miles a secas"],
    ["1.234.567", 1_234_567, "dos puntos de miles"],

    // Excel en español. Estos son los que rompían.
    ["89.900,00", 89_900, "punto de miles + coma decimal"],
    ["89900,00", 89_900, "coma decimal SIN separador de miles"],
    ["12345,5", 12_345.5, "coma decimal, un decimal"],
    ["1234,56", 1_234.56, "coma decimal, cuatro dígitos delante"],
    ["$ 145.000,00", 145_000, "formato completo de Excel es-CO"],

    // Excel en inglés.
    ["45,000.50", 45_000.5, "coma de miles + punto decimal"],

    // Cortos: aquí la ambigüedad es real y la regla decide.
    ["89,5", 89.5, "coma decimal corta"],
    ["1,500", 1_500, "coma de miles: 3 dígitos detrás mandan"],

    // Basura: vale cero, no rompe la importación entera.
    ["", 0, "vacío"],
    [null, 0, "nulo"],
    ["sin precio", 0, "texto"],
    ["-", 0, "solo un guion"],
  ];

  for (const [entrada, esperado, motivo] of casos) {
    it(`${JSON.stringify(entrada)} → ${esperado} (${motivo})`, async () => {
      expect(await money(entrada)).toBe(esperado);
    });
  }

  it("nunca devuelve null ni negativo", async () => {
    // at_sync_products hace `case when v_precio > 0`. Un null ahí propagaría
    // el problema a la comparación en vez de caer al precio anterior.
    for (const [entrada] of casos) {
      const v = await money(entrada);
      expect(v).not.toBeNull();
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describeDb("quién puede subir el archivo, y quién solo leerlo", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let dueno: SupabaseClient | null = null;
  let asesor: SupabaseClient | null = null;
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();

    const d = await crearUsuario(admin, "dueno-catalogo", { role: "cliente" });
    usuarios.push(d.id);
    dueno = await clienteComo(d.email, CLAVE_DE_PRUEBA);
    await dueno.rpc("at_ensure_my_client"); // autoaprovisiona el comercio

    const { data: perfilD } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", d.id)
      .maybeSingle();
    clientId = (perfilD as { client_id: string | null } | null)?.client_id ?? null;

    // El asesor se enlaza al MISMO comercio, que es como llega en producción:
    // se registra eligiendo su tienda y su jefe lo habilita desde Mi equipo.
    const a = await crearUsuario(admin, "asesor-catalogo", { role: "asesor" });
    usuarios.push(a.id);
    await admin.from("at_profiles").update({ role: "asesor", client_id: clientId }).eq("id", a.id);
    asesor = await clienteComo(a.email, CLAVE_DE_PRUEBA);
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("el dueño sube el catálogo por archivo", async () => {
    if (!dueno) return;
    const { error } = await dueno.rpc("at_sync_products", {
      p_rows: [
        { name: "Vestido flores", sku: "VF-001", price: "$ 89.900" },
        { name: "Bolso cuero", sku: "BC-014", price: "145000" },
      ],
    });
    expect(error).toBeNull();
  });

  it("y el precio queda bien, no multiplicado", async () => {
    if (!clientId) return;
    const { data } = await admin
      .from("at_products")
      .select("sku, price")
      .eq("client_id", clientId)
      .eq("sku", "VF-001")
      .maybeSingle();
    const p = data as { price: number } | null;
    if (p) expect(Number(p.price)).toBe(89_900);
  });

  it("el asesor NO puede subir el archivo", async () => {
    // Reemplaza la base entera del comercio: no es decisión suya.
    if (!asesor) return;
    const { error } = await asesor.rpc("at_sync_products", {
      p_rows: [{ name: "Colado por el asesor", price: "1000" }],
    });
    expect(error).not.toBeNull();
  });

  it("pero SÍ ve el catálogo de su comercio", async () => {
    // Es lo que necesita para despachar. Si esto falla, el asesor abre
    // /pedidos/nueva y se encuentra el catálogo vacío sin explicación.
    if (!asesor || !clientId) return;
    const { data, error } = await asesor
      .from("at_products")
      .select("sku, name, price")
      .eq("client_id", clientId)
      .eq("active", true);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("y SÍ puede crear un producto uno a uno", async () => {
    if (!asesor || !clientId) return;
    const { error } = await asesor
      .from("at_products")
      .insert({ client_id: clientId, name: "Alta manual del asesor", price: 25_000 });
    expect(error).toBeNull();
  });

  it("el asesor ve los compradores guardados de su comercio", async () => {
    if (!asesor || !clientId) return;
    await admin.from("at_recipients").insert({
      client_id: clientId,
      full_name: "María Restrepo",
      address: "Cra 43 #10-25",
      city: "Envigado",
    });
    const { data, error } = await asesor
      .from("at_recipients")
      .select("full_name")
      .eq("client_id", clientId)
      .eq("active", true);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("un asesor suspendido deja de ver el catálogo", async () => {
    // Migración 0081: las políticas miran at_estoy_activo(). El botón de
    // suspender en Mi equipo tiene que suspender de verdad, no pintar un
    // estado.
    if (!asesor || !clientId || usuarios.length < 2) return;
    await admin.from("at_profiles").update({ active: false }).eq("id", usuarios[1]);

    const { data } = await asesor.from("at_products").select("id").eq("client_id", clientId);
    expect((data ?? []).length).toBe(0);

    await admin.from("at_profiles").update({ active: true }).eq("id", usuarios[1]);
  });
});

describeDb("subir el mismo archivo dos veces", () => {
  /**
   * Es lo que hace un comercio cuando una importación se corta a la mitad — y
   * es justo lo que la pantalla le dice que haga desde el arreglo del
   * 2026-08-16: «vuelve a subir el mismo archivo, lo ya cargado no se
   * duplica». Ese mensaje tiene que ser cierto.
   */
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let dueno: SupabaseClient | null = null;
  let clientId: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();
    const d = await crearUsuario(admin, "dueno-repetir", { role: "cliente" });
    usuarios.push(d.id);
    dueno = await clienteComo(d.email, CLAVE_DE_PRUEBA);
    await dueno.rpc("at_ensure_my_client");
    const { data } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", d.id)
      .maybeSingle();
    clientId = (data as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  const ARCHIVO = [
    { name: "Vestido flores", sku: "REP-001", price: "89.900" },
    { name: "Bolso cuero", sku: "REP-002", price: "145000" },
    { name: "Sin código de barras", price: "30000" }, // sin sku: identidad por nombre
  ];

  it("la primera vez crea", async () => {
    if (!dueno) return;
    const { data } = await dueno.rpc("at_sync_products", { p_rows: ARCHIVO });
    const r = data as { creados: number };
    expect(Number(r.creados)).toBe(3);
  });

  it("la segunda actualiza, no duplica", async () => {
    if (!dueno || !clientId) return;
    const { data } = await dueno.rpc("at_sync_products", { p_rows: ARCHIVO });
    const r = data as { creados: number; actualizados: number };
    expect(Number(r.creados)).toBe(0);
    expect(Number(r.actualizados)).toBe(3);

    // Y en la tabla siguen siendo tres, no seis.
    const { data: filas } = await admin
      .from("at_products")
      .select("id")
      .eq("client_id", clientId)
      .in("sku", ["REP-001", "REP-002"]);
    expect((filas ?? []).length).toBe(2);
  });

  it("un producto sin SKU se reconoce por el nombre, no se duplica", async () => {
    if (!dueno || !clientId) return;
    // at_sync_products compara con at_norm(name): tildes y mayúsculas no
    // deberían crear un producto nuevo.
    await dueno.rpc("at_sync_products", {
      p_rows: [{ name: "SIN CÓDIGO DE BARRAS", price: "31000" }],
    });
    const { data } = await admin
      .from("at_products")
      .select("id")
      .eq("client_id", clientId)
      .is("sku", null);
    expect((data ?? []).length).toBe(1);
  });

  it("un precio ilegible NO borra el que ya estaba bien", async () => {
    // En el update hay `case when v_precio > 0 then v_precio else p.price end`.
    // Si la segunda carga trae la columna de precio vacía —pasa constantemente
    // en exports parciales— el catálogo no puede quedarse en cero.
    if (!dueno || !clientId) return;

    await dueno.rpc("at_sync_products", {
      p_rows: [{ name: "Vestido flores", sku: "REP-001", price: "" }],
    });

    const { data } = await admin
      .from("at_products")
      .select("price")
      .eq("client_id", clientId)
      .eq("sku", "REP-001")
      .maybeSingle();
    expect(Number((data as { price: number } | null)?.price)).toBe(89_900);
  });

  it("una fila sin nombre se omite, no rompe la importación entera", async () => {
    if (!dueno) return;
    const { data, error } = await dueno.rpc("at_sync_products", {
      p_rows: [{ name: "", price: "1000" }, { name: "Válido tras el hueco", price: "2000" }],
    });
    expect(error).toBeNull();
    const r = data as { creados: number; omitidos: number };
    expect(Number(r.omitidos)).toBe(1);
    expect(Number(r.creados)).toBe(1);
  });
});

describeDb("un comercio no puede tocar el catálogo de otro", () => {
  let admin: SupabaseClient;
  const usuarios: string[] = [];
  let comercioA: SupabaseClient | null = null;
  let idB: string | null = null;

  beforeAll(async () => {
    admin = clienteAdmin();

    const a = await crearUsuario(admin, "tienda-a", { role: "cliente" });
    usuarios.push(a.id);
    comercioA = await clienteComo(a.email, CLAVE_DE_PRUEBA);
    await comercioA.rpc("at_ensure_my_client");

    const b = await crearUsuario(admin, "tienda-b", { role: "cliente" });
    usuarios.push(b.id);
    const cb = await clienteComo(b.email, CLAVE_DE_PRUEBA);
    await cb.rpc("at_ensure_my_client");
    await cb.rpc("at_sync_products", {
      p_rows: [{ name: "Producto de B", sku: "B-001", price: "50000" }],
    });

    const { data } = await admin
      .from("at_profiles")
      .select("client_id")
      .eq("id", b.id)
      .maybeSingle();
    idB = (data as { client_id: string | null } | null)?.client_id ?? null;
  });

  afterAll(async () => {
    await borrarUsuarios(admin, usuarios);
  });

  it("la sincronización siempre escribe en el comercio de quien llama", async () => {
    // at_sync_products no acepta client_id como parámetro: usa at_my_client().
    // Aunque A suba un producto con el SKU de B, se crea en el catálogo de A.
    if (!comercioA || !idB) return;
    await comercioA.rpc("at_sync_products", {
      p_rows: [{ name: "Intento de pisar a B", sku: "B-001", price: "1" }],
    });

    const { data } = await admin
      .from("at_products")
      .select("name, price")
      .eq("client_id", idB)
      .eq("sku", "B-001")
      .maybeSingle();
    const p = data as { name: string; price: number } | null;
    if (p) {
      expect(p.name).toBe("Producto de B");
      expect(Number(p.price)).toBe(50_000);
    }
  });

  it("A no ve el catálogo de B", async () => {
    if (!comercioA || !idB) return;
    const { data } = await comercioA.from("at_products").select("id").eq("client_id", idB);
    expect((data ?? []).length).toBe(0);
  });
});
