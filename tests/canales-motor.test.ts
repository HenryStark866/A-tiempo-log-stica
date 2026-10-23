import { describe, expect, it } from "vitest";
import {
  LARGO_SMS,
  T,
  paginaCatalogo,
  procesar,
  sms,
  type Canal,
  type ItemCatalogo,
} from "@/lib/canales/motor";
import { datosDeEjemplo, fuenteMemoria, normalizarTelefono } from "@/lib/canales/fuente-memoria";

/**
 * El motor de canales de punta a punta, con la fuente en memoria: la misma
 * conversación que tendría un teléfono de teclas, sin base y sin SMS.
 */

const ANA = "+573005550001"; // compradora con cuenta
const SIN_CUENTA = "3005550002"; // destinatario de ATL-1002, sin perfil
const COMERCIO_NORTE = "+573005550009";
const GSM = /^[A-Za-z0-9 \n!"#$%&'()*+,\-./:;<=>?@_]*$/;

function telefono(datos = datosDeEjemplo()) {
  const m = fuenteMemoria(datos);
  let n = 0;
  const escribir = async (tel: string, texto: string, canal: Canal = "sms", id?: string) => {
    const r = await procesar(m.fuente, { canal, telefono: tel, texto, proveedorId: id ?? `msg-${++n}` });
    // Solo lo que le llega a quien escribe; el aviso al comercio se mira aparte.
    const yo = normalizarTelefono(tel);
    return { ...r, textos: r.mensajes.filter((x) => x.para === yo).map((x) => x.texto) };
  };
  return { ...m, escribir };
}

describe("textos", () => {
  it("sms() deja todo en GSM y en 160", () => {
    const t = sms("Panadería Doña Ñoña — ¿pedido? " + "x".repeat(300));
    expect(t.length).toBeLessThanOrEqual(LARGO_SMS);
    expect(t).toMatch(GSM);
    expect(t.startsWith("Panaderia Dona Nona")).toBe(true);
  });

  it("ninguna plantilla se corta con datos largos de verdad", () => {
    const largo = "Comercializadora de Productos Típicos de la Montaña Antioqueña S.A.S.";
    const producto: ItemCatalogo = { id: "p", nombre: "Torta tres leches con arequipe y fresas", precio: 1_250_000 };
    const textos = [
      T.menu(false),
      T.menu(true),
      T.ayuda(true),
      T.ayuda(false),
      T.baja(),
      T.guiaNoEncontrada("ATL-123456789"),
      T.guia({ numero: "ATL-123456", estado: "reprogramada", comercio: largo, actualizada: "2026-10-21T15:00:00Z", entregada: null }),
      T.misGuias([
        { numero: "ATL-100001", estado: "en_devolucion", comercio: "", actualizada: "", entregada: null },
        { numero: "ATL-100002", estado: "zonificada", comercio: "", actualizada: "", entregada: null },
        { numero: "ATL-100003", estado: "novedad", comercio: "", actualizada: "", entregada: null },
      ]),
      T.elegirComercio(Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, nombre: largo }))),
      T.confirmarPedido({ cantidad: 20, producto, comercio: { id: "c", nombre: largo }, direccion: "Carrera 43A # 1 Sur - 100, Torre 2, apto 1503, El Poblado" }),
      T.pedidoListo({ codigo: "P-ABCDEF", comercio: largo, total: 25_000_000 }),
      T.avisoComercio(
        { codigo: "P-ABCDEF", producto: producto.nombre, total: 25_000_000 },
        { cantidad: 20, nombre: "María de los Ángeles Restrepo Uribe", telefono: ANA, direccion: "Carrera 43A # 1 Sur - 100, Torre 2, apto 1503" }
      ),
    ];
    for (const t of textos) {
      expect(t.length, t).toBeLessThanOrEqual(LARGO_SMS);
      expect(t.endsWith("..."), `se cortó: ${t}`).toBe(false);
      expect(t, t).toMatch(GSM);
    }
  });

  it("el catálogo pagina sin perder ni repetir productos", () => {
    const productos = Array.from({ length: 23 }, (_, i) => ({ id: `p${i}`, nombre: `Producto número ${i + 1} grande`, precio: 1000 * (i + 1) }));
    const vistos: number[] = [];
    let desde = 0;
    while (desde < productos.length) {
      const pag = paginaCatalogo({ id: "c", nombre: "Panadería Norte" }, productos, desde);
      expect(pag.texto.length).toBeLessThanOrEqual(LARGO_SMS);
      expect(pag.siguiente).toBeGreaterThan(desde);
      for (let i = desde; i < pag.siguiente; i++) vistos.push(i);
      desde = pag.siguiente;
    }
    expect(vistos).toEqual(productos.map((_, i) => i));
  });
});

describe("quien tiene cuenta", () => {
  it("MENU y el 1 muestran solo sus guías", async () => {
    const t = telefono();
    expect((await t.escribir(ANA, "menu")).textos[0]).toContain("1 Mis guias");
    const r = await t.escribir(ANA, "1");
    expect(r.textos[0]).toContain("ATL-1001 en camino");
    expect(r.textos[0]).toContain("ATL-0999 entregada");
    expect(r.textos[0]).not.toContain("ATL-1002");
  });

  it("no ve la guía de otra persona, y la respuesta no dice que existe", async () => {
    const t = telefono();
    const ajena = await t.escribir(ANA, "GUIA ATL-1002");
    const inventada = await t.escribir(ANA, "GUIA ATL-777777");
    expect(ajena.textos[0]).toContain("No encontramos la guia ATL-1002");
    expect(ajena.textos[0].replace("1002", "")).toBe(inventada.textos[0].replace("777777", ""));
  });

  it("el comercio sí ve su guía, aunque no sea el destinatario", async () => {
    const t = telefono();
    const r = await t.escribir("300 555 0009", "guia 1002");
    expect(r.textos[0]).toContain("Guia ATL-1002 de Panaderia Norte: registrada");
  });

  it("texto que no entiende: menú corto, sin crear cuenta", async () => {
    const t = telefono();
    const r = await t.escribir(ANA, "quiero mi paquete ya");
    expect(r.ruta).toBe("motor");
    expect(r.textos[0].startsWith("No entendi.")).toBe(true);
    expect(t.altasDelegadas).toHaveLength(0);
  });
});

describe("catálogo y pedido", () => {
  it("de la búsqueda al aviso al comercio, con el precio de la base", async () => {
    const t = telefono();
    const busqueda = await t.escribir(ANA, "CATALOGO panaderia");
    // La que no tiene productos activos no aparece. El orden lo pone la
    // intercalación de la base, así que se busca el número de la del Norte.
    expect(busqueda.textos[0]).toMatch(/^Encontramos: 1 .+ 2 .+\. Responde el numero\.$/);
    expect(busqueda.textos[0]).toContain("Panaderia del Sur");
    expect(busqueda.textos[0]).not.toContain("Cerrada");
    const norte = /(\d) Panaderia Norte/.exec(busqueda.textos[0])![1];

    const pag1 = await t.escribir(ANA, norte);
    expect(pag1.textos[0]).toMatch(/^Panaderia Norte: 1 /);
    expect(pag1.textos[0]).toContain("MAS para ver mas");
    expect(pag1.textos[0]).not.toContain("Producto retirado");

    const pag2 = await t.escribir(ANA, "mas");
    expect(pag2.textos[0]).toMatch(/^Panaderia Norte: \d+ /);

    // Los productos van por nombre: el 7 es la Torta de chocolate.
    const pedir = await t.escribir(ANA, "PEDIR 7 x3");
    expect(pedir.textos[0]).toContain("A que direccion");

    // En este paso todo es dato: "GUIA" no se interpreta como comando.
    const dir = await t.escribir(ANA, "Calle 10 # 43-12 guia 2 Laureles");
    expect(dir.textos[0]).toContain("Confirmas 3 Torta de chocolate por $75.000 de Panaderia Norte");

    const si = await t.escribir(ANA, "si");
    expect(si.textos[0]).toMatch(/^Listo\. Pedido P-[0-9A-F]{6} enviado a Panaderia Norte por \$75\.000 mas envio/);
    const aviso = si.mensajes.find((m) => m.para === COMERCIO_NORTE);
    expect(aviso?.texto).toContain("3 Torta de chocolate $75.000");
    expect(aviso?.texto).toContain("Ana Maria Gomez 3005550001");
    expect(t.pedidos).toHaveLength(1);
    expect(t.pedidos[0]).toMatchObject({ comercioId: "c-norte", productoId: "p2", cantidad: 3, total: 75_000 });
    expect(t.sesiones.size).toBe(0);
  });

  it("sin cuenta: pide el nombre antes de la dirección", async () => {
    const t = telefono();
    await t.escribir(SIN_CUENTA, "catalogo dona rosa");
    expect((await t.escribir(SIN_CUENTA, "pedir 1")).textos[0]).toContain("como te llamas");
    expect((await t.escribir(SIN_CUENTA, "12")).textos[0]).toContain("No entendi el nombre");
    expect((await t.escribir(SIN_CUENTA, "Luis Alberto")).textos[0]).toContain("direccion");
    expect((await t.escribir(SIN_CUENTA, "Cra 50 #20-1 Belen")).textos[0]).toContain("Confirmas 1 Arepas de choclo x5");
    expect((await t.escribir(SIN_CUENTA, "tal vez")).textos[0]).toContain("Responde SI");
    expect((await t.escribir(SIN_CUENTA, "no")).textos[0]).toContain("Pedido cancelado");
    expect(t.pedidos).toHaveLength(0);
  });

  it("PEDIR sin haber visto el catálogo, o fuera de la lista", async () => {
    const t = telefono();
    expect((await t.escribir(ANA, "pedir 2")).textos[0]).toContain("Primero mira el catalogo");
    await t.escribir(ANA, "catalogo norte");
    expect((await t.escribir(ANA, "pedir 40")).textos[0]).toContain("no esta en la lista");
  });

  it("el tope de pedidos por día corta con un mensaje claro", async () => {
    const t = telefono();
    for (let i = 0; i < 6; i++) {
      await t.escribir(ANA, "catalogo dona rosa");
      await t.escribir(ANA, "1");
      await t.escribir(ANA, "Cra 50 #20-1 Belen");
      const r = await t.escribir(ANA, "SI");
      if (i === 5) expect(r.textos[0]).toContain("varios pedidos hoy");
    }
    expect(t.pedidos).toHaveLength(5);
  });
});

describe("quien no tiene cuenta", () => {
  it("rastrea la guía que va a su número", async () => {
    const t = telefono();
    const r = await t.escribir(SIN_CUENTA, "ATL1002");
    expect(r.textos[0]).toContain("Guia ATL-1002");
  });

  it("lo que el motor no sabe hacer sigue yendo al alta de la 0145", async () => {
    const t = telefono();
    for (const texto of ["hola", "1", "YAM", "salir"]) {
      const r = await t.escribir(SIN_CUENTA, texto);
      expect(r.ruta, texto).toBe("alta");
    }
    expect(t.altasDelegadas.map((a) => a.telefono)).toEqual(Array(4).fill("+573005550002"));
  });

  it("un alta a medio camino manda, incluso sobre BAJA", async () => {
    const datos = datosDeEjemplo();
    datos.altasVivas.push("+573005550002");
    const t = telefono(datos);
    expect((await t.escribir(SIN_CUENTA, "BAJA")).ruta).toBe("alta");
    expect((await t.escribir(SIN_CUENTA, "GUIA 1002")).ruta).toBe("alta");
  });
});

describe("BAJA, repeticiones y números raros", () => {
  it("después de BAJA no se le contesta nada hasta ALTA", async () => {
    const t = telefono();
    expect((await t.escribir(ANA, "Baja")).textos[0]).toContain("no te escribimos mas");
    const callado = await t.escribir(ANA, "MENU");
    expect(callado.mensajes).toHaveLength(0);
    expect((await t.escribir(ANA, "alta")).textos[0]).toContain("Bienvenido de nuevo");
    expect((await t.escribir(ANA, "menu")).textos).toHaveLength(1);
  });

  it("el mismo mensaje del proveedor dos veces se atiende una vez", async () => {
    const t = telefono();
    const a = await t.escribir(ANA, "GUIA 1001", "sms", "mismo-id");
    const b = await t.escribir(ANA, "GUIA 1001", "sms", "mismo-id");
    expect(a.ruta).toBe("motor");
    expect(b.ruta).toBe("repetido");
    expect(t.buzon).toHaveLength(1);
  });

  it("un remitente que no es un celular no recibe respuesta", async () => {
    const t = telefono();
    const r = await t.escribir("CLARO", "Su recarga fue exitosa");
    expect(r.ruta).toBe("invalido");
    expect(t.buzon).toHaveLength(0);
  });

  it("cada canal lleva su propia conversación", async () => {
    const t = telefono();
    await t.escribir(ANA, "catalogo norte", "sms");
    expect((await t.escribir(ANA, "mas", "whatsapp")).textos[0]).toContain("No hay nada mas");
    expect(t.buzon.at(-1)?.canal).toBe("whatsapp");
  });
});
