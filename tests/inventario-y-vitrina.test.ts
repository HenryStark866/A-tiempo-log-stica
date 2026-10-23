import { describe, it, expect } from "vitest";
import {
  disponibilidad,
  fusionarExtra,
  leerInventarioOferta,
  liquidarVenta,
  porcentajeEntre,
  precioConDescuento,
  textoBajoPedido,
  textoVendidos,
  COMISION_YAM,
} from "@/lib/inventario";
import { mapearFilaVitrina, slugComercio, type FilaVitrina } from "@/lib/vitrina";

describe("inventario híbrido (Modo A stock contado vs Modo B hecho sobre pedido)", () => {
  it("modo stock: si stock_quantity es 0 la disponibilidad marca agotado", () => {
    const info = leerInventarioOferta({ stock_quantity: 0 }, 50000);
    expect(info.modo).toBe("stock");
    expect(info.stock).toBe(0);

    const disp = disponibilidad(info);
    expect(disp.agotado).toBe(true);
    expect(disp.ultimasUnidades).toBe(false);
    expect(disp.bajoPedido).toBe(false);
  });

  it("modo stock: si stock_quantity está entre 1 y 3 muestra últimas unidades", () => {
    const info = leerInventarioOferta({ stock_quantity: 2 }, 50000);
    const disp = disponibilidad(info);
    expect(disp.agotado).toBe(false);
    expect(disp.ultimasUnidades).toBe(true);
    expect(disp.maxCantidad).toBe(2);
  });

  it("modo bajo pedido: no se agota y despliega días hábiles de elaboración", () => {
    const info = leerInventarioOferta({ is_made_to_order: true, lead_time_days: 4 }, 75000);
    expect(info.modo).toBe("pedido");
    expect(info.diasElaboracion).toBe(4);

    const disp = disponibilidad(info);
    expect(disp.agotado).toBe(false);
    expect(disp.bajoPedido).toBe(true);
    expect(textoBajoPedido(info.diasElaboracion)).toBe(
      "Elaborado bajo pedido (Listo para envío en 4 días hábiles)"
    );
  });

  it("contador social de vendidos redondea adecuadamente", () => {
    expect(textoVendidos(0)).toBeNull();
    expect(textoVendidos(5)).toBe("5 vendidos");
    expect(textoVendidos(47)).toBe("Más de 40 vendidos");
    expect(textoVendidos(350)).toBe("Más de 300 vendidos");
  });
});

describe("módulo de promociones, descuentos y regla contable (7% YAM)", () => {
  it("calcula oferta con precio original tachado y porcentaje", () => {
    const info = leerInventarioOferta(
      { is_on_sale: true, original_price: 58000, discount_percent: 15 },
      49300
    );
    expect(info.enOferta).toBe(true);
    expect(info.precioOriginal).toBe(58000);
    expect(info.descuentoPct).toBe(15);
  });

  it("calcula precio con descuento y porcentaje equivalente", () => {
    expect(precioConDescuento(58000, 15)).toBe(49300);
    expect(porcentajeEntre(58000, 49300)).toBe(15);
  });

  it("regla contable: la comisión de YAM (7%) se liquida sobre el valor neto final cobrado", () => {
    const precioFinalNeto = 49300;
    const precioOriginal = 58000;
    const cantidad = 2;

    const liq = liquidarVenta(precioFinalNeto, cantidad, precioOriginal);
    expect(liq.total).toBe(98600); // 49300 * 2
    expect(liq.comisionYam).toBe(Math.round(98600 * COMISION_YAM)); // 6902
    expect(liq.netoComercio).toBe(98600 - 6902); // 91698
    expect(liq.ahorro).toBe((58000 - 49300) * 2); // 17400
  });

  it("fusionarExtra conserva propiedades previas de extra (CSV, foto, etc.)", () => {
    const previo = { foto: "https://ejemplo.com/p.jpg", talla: "M", categoria: "Ropa" };
    const fusion = fusionarExtra(previo, {
      is_made_to_order: true,
      lead_time_days: 3,
      stock_quantity: undefined,
    });
    expect(fusion.foto).toBe("https://ejemplo.com/p.jpg");
    expect(fusion.talla).toBe("M");
    expect(fusion.is_made_to_order).toBe(true);
    expect(fusion.lead_time_days).toBe(3);
    expect(fusion.stock_quantity).toBeUndefined();
  });
});

describe("mapeo seguro de la vitrina según RLS de migración 0143", () => {
  it("convierte una fila con join anónimo de at_clients en un MockProduct bien tipado", () => {
    const fila: FilaVitrina = {
      id: "prod-1",
      client_id: "cli-1",
      sku: "SKU-TEST",
      name: "Café de Finca",
      description: "Delicioso café",
      price: 35000,
      extra: { category: "Café", is_made_to_order: false, stock_quantity: 10 },
      at_clients: {
        id: "cli-1",
        business_name: "Café Fredonia",
        city: "Fredonia, Antioquia",
        phone: "+573001234567",
        logo_url: "https://ejemplo.com/logo.png",
      },
    };

    const mapeado = mapearFilaVitrina(fila);
    expect(mapeado.id).toBe("prod-1");
    expect(mapeado.store_name).toBe("Café Fredonia");
    expect(mapeado.store_slug).toBe("cafe-fredonia");
    expect(mapeado.store_location).toBe("Fredonia, Antioquia");
    expect(mapeado.store_phone).toBe("+573001234567");
    expect(mapeado.price).toBe(35000);
  });

  it("genera slug de comercio sin tildes ni caracteres extraños", () => {
    expect(slugComercio("Botánica & Esencias")).toBe("botanica-esencias");
    expect(slugComercio("Café Origen")).toBe("cafe-origen");
  });
});
