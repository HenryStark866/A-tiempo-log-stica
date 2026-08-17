import { describe, it, expect } from "vitest";
import { cn, esDemasiadasSolicitudes, formatCOP, normalizarBusqueda } from "@/lib/utils";
import { GUIA_EJEMPLO, MARCA } from "@/lib/marca";
import { normalizeText } from "@/lib/zones";
import { buildNavUrl, orderRoute } from "@/lib/nav";

/**
 * Las aserciones sobre dinero y fechas evitan comparar cadenas exactas a
 * propósito: `Intl` cambia de formato entre versiones de ICU, y un test que se
 * rompe al actualizar Node no prueba nada útil sobre el negocio. Se comprueba
 * lo que sí es una decisión nuestra: que no haya decimales, que el separador
 * de miles esté, que el símbolo aparezca.
 */

describe("formatCOP", () => {
  it("no muestra centavos — el peso colombiano no los usa en la operación", () => {
    const salida = formatCOP(12_345);
    expect(salida).not.toMatch(/[.,]\d{2}$/);
  });

  it("separa los miles, para que 1200000 no se lea como 120000", () => {
    expect(formatCOP(1_200_000)).toMatch(/1.200.000|1,200,000/);
  });

  it("lleva símbolo de moneda", () => {
    expect(formatCOP(5000)).toMatch(/\$|COP/);
  });

  it("distingue «no hay dato» de «cero pesos»", () => {
    // Un recaudo sin reportar y un recaudo de cero son cosas distintas, y en
    // una pantalla de dinero no se pueden ver igual.
    expect(formatCOP(null)).toBe("—");
    expect(formatCOP(undefined)).toBe("—");
    expect(formatCOP(0)).not.toBe("—");
    expect(formatCOP(0)).toMatch(/0/);
  });
});

describe("normalizarBusqueda", () => {
  it("quien escribe «aji» encuentra «Ají»", () => {
    expect(normalizarBusqueda("Ají")).toBe(normalizarBusqueda("aji"));
  });

  it("quita tildes y baja a minúsculas", () => {
    expect(normalizarBusqueda("MEDELLÍN")).toBe("medellin");
    expect(normalizarBusqueda("Bogotá")).toBe("bogota");
  });

  it("también pliega la ñ, y eso es deliberado", () => {
    // En NFD, «ñ» es «n» + tilde combinante, y la tilde cae con el resto. O sea
    // que «Muñoz» se busca escribiendo «munoz».
    //
    // Para BUSCAR está bien —es justo lo que hace quien escribe rápido en un
    // teléfono— pero conviene tenerlo escrito: esto NO sirve para comparar
    // identidades. «Muñoz» y «Munoz» son apellidos distintos y aquí colisionan.
    // Si algún día se usa esta función para deduplicar destinatarios, va a
    // fusionar personas que no son la misma.
    expect(normalizarBusqueda("Muñoz")).toBe("munoz");
    expect(normalizarBusqueda("Muñoz")).toBe(normalizarBusqueda("Munoz"));
  });

  it("coincide con normalizeText de zones.ts", () => {
    // Son dos implementaciones de la misma idea en archivos distintos, y una de
    // las dos (zones.ts) tiene que seguir siendo espejo de `at_norm` en la base.
    // Si se separan, la app buscará de una forma y la base de otra. Este test
    // es el que avisa el día que alguien toque una sola de las dos.
    for (const s of ["Medellín", "ITAGÜÍ", "Belén", "Muñoz", "El Poblado", ""]) {
      expect(normalizarBusqueda(s)).toBe(normalizeText(s));
    }
  });
});

describe("cn", () => {
  it("descarta false, null y undefined en vez de escribirlos en el HTML", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("con nada devuelve cadena vacía, no «undefined»", () => {
    expect(cn()).toBe("");
    expect(cn(false, null)).toBe("");
  });
});

describe("esDemasiadasSolicitudes", () => {
  it("reconoce PT429, el código del freno contra solicitudes masivas", () => {
    // Sin esto, a alguien frenado se le decía «no encontramos esa guía»: la
    // peor noticia posible, y además falsa.
    expect(esDemasiadasSolicitudes({ code: "PT429" })).toBe(true);
  });

  it("no confunde otros errores con el freno", () => {
    expect(esDemasiadasSolicitudes({ code: "PGRST116" })).toBe(false);
    expect(esDemasiadasSolicitudes({})).toBe(false);
    expect(esDemasiadasSolicitudes(null)).toBe(false);
  });
});

describe("la marca", () => {
  it("el prefijo de guía es ATL y no YAM — ADR-0002", () => {
    // Cambiarlo rompería el rastreo de todo lo que ya salió impreso a la calle.
    // Si este test falla, la pregunta no es cómo arreglarlo: es por qué alguien
    // lo cambió.
    expect(MARCA.prefijoGuia).toBe("ATL");
    expect(GUIA_EJEMPLO.startsWith("ATL-")).toBe(true);
  });

  it("la app es YAM y la empresa es A Tiempo Logística", () => {
    expect(MARCA.app).toBe("YAM");
    expect(MARCA.empresa).toBe("A Tiempo Logística");
  });
});

describe("buildNavUrl", () => {
  it("codifica la dirección, para que una coma o un # no rompan la URL", () => {
    const url = buildNavUrl("waze", "Cra 43A #1-50", "Medellín");
    expect(url).not.toContain("#");
    expect(url).not.toContain(" ");
    expect(url).toContain("waze.com");
  });

  it("mete la ciudad en el destino cuando la hay", () => {
    const conCiudad = buildNavUrl("gmaps", "Calle 10", "Envigado");
    expect(decodeURIComponent(conCiudad)).toContain("Calle 10, Envigado");
  });

  it("sin ciudad manda solo la dirección", () => {
    const sinCiudad = buildNavUrl("gmaps", "Calle 10", null);
    expect(decodeURIComponent(sinCiudad)).toContain("destination=Calle 10");
  });
});

describe("orderRoute", () => {
  const guia = (recipient_address: string, zona?: string) => ({
    recipient_address,
    at_zones: zona ? { name: zona } : null,
  });

  it("agrupa por zona antes que por calle", () => {
    const orden = orderRoute([
      guia("Calle 1", "Zona 2"),
      guia("Calle 99", "Zona 1"),
      guia("Calle 2", "Zona 2"),
    ]);
    expect(orden.map((g) => g.at_zones?.name)).toEqual(["Zona 1", "Zona 2", "Zona 2"]);
  });

  it("dentro de la zona ordena los números como números, no como texto", () => {
    // Sin orden numérico, "Calle 10" iría antes que "Calle 9" y el mensajero
    // haría el recorrido al revés.
    const orden = orderRoute([guia("Calle 10", "Z"), guia("Calle 9", "Z"), guia("Calle 2", "Z")]);
    expect(orden.map((g) => g.recipient_address)).toEqual(["Calle 2", "Calle 9", "Calle 10"]);
  });

  it("junta la misma vía escrita de formas distintas", () => {
    // «Cra», «Carrera» y «Kra» son la misma calle: tienen que quedar contiguas
    // o el mensajero da dos vueltas al mismo sitio.
    const orden = orderRoute([
      guia("Carrera 43 #10", "Z"),
      guia("Calle 5 #2", "Z"),
      guia("Kra 43 #12", "Z"),
      guia("Cra 43 #11", "Z"),
    ]);
    const carreras = orden
      .map((g, i) => ({ i, es: /carrera|kra|cra/i.test(g.recipient_address) }))
      .filter((x) => x.es)
      .map((x) => x.i);
    // Los tres índices de carrera tienen que ser consecutivos.
    expect(carreras[2] - carreras[0]).toBe(2);
  });

  it("las guías sin zona van al final, no al principio", () => {
    const orden = orderRoute([guia("Calle 1"), guia("Calle 2", "Zona 1")]);
    expect(orden[orden.length - 1].at_zones).toBeNull();
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [guia("Calle 9", "Z"), guia("Calle 2", "Z")];
    const copia = [...original];
    orderRoute(original);
    expect(original).toEqual(copia);
  });
});
