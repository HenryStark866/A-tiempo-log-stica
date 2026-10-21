/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MOTOR DE CANALES — un solo cerebro para quien no tiene internet
 *
 * Un SMS, un mensaje de WhatsApp, una sesion USSD o una tecla oprimida en una
 * llamada son, para la persona, la misma conversacion: quiere saber donde va
 * su pedido o ver que vende la panaderia del barrio. Este archivo es esa
 * conversacion, escrita UNA vez. Cada canal pone un adaptador delgado que
 * traduce lo que llega a un `MensajeEntrante` y entrega lo que sale.
 *
 * ── Por que una funcion y una `Fuente`, y no consultas aqui adentro ───────
 * `procesar` no sabe de Supabase ni de HTTP: todo lo que lee o escribe pasa
 * por la interfaz `Fuente`. La ruta /api/sms/entrante le pasa la de la base
 * (fuente-supabase.ts); los tests y el simulador, la de memoria
 * (fuente-memoria.ts). Asi la conversacion completa se prueba en
 * milisegundos, sin base y sin mandar un solo SMS.
 *
 * ── Lo que esta fase NO hace ──────────────────────────────────────────────
 * No mueve dinero (fase 1, con PIN y topes) ni crea guias: PEDIR deja una
 * solicitud que el comercio confirma, igual que el checkout de la vitrina
 * manda un WhatsApp al comercio en vez de crear la guia. Un SMS de alguien a
 * quien nadie verifico no puede generar cobros de flete a un comercio.
 *
 * ── Los textos ────────────────────────────────────────────────────────────
 * Sin tildes y en 160 caracteres, por la misma razon de la 0142 y la 0145:
 * fuera del alfabeto GSM de 7 bits el SMS se parte y se cobra doble. `sms()`
 * es la ultima red: limpia y corta todo lo que sale de aqui.
 *
 * Este archivo no importa nada a proposito: el simulador lo carga con Node
 * directamente (scripts/simular-sms.mjs), sin compilar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Canal = "sms" | "whatsapp" | "ussd" | "voz" | "agente";

export interface MensajeEntrante {
  canal: Canal;
  /** Como lo manda el proveedor; la base lo normaliza a +57... */
  telefono: string;
  texto: string;
  /** Id del mensaje en el proveedor: es la llave de idempotencia. */
  proveedorId: string | null;
}

export interface Perfil {
  id: string;
  nombre: string;
  rol: string;
}

export interface Comercio {
  id: string;
  nombre: string;
}

export interface ItemCatalogo {
  id: string;
  nombre: string;
  precio: number;
}

export interface Guia {
  numero: string;
  estado: string;
  comercio: string;
  actualizada: string;
  entregada: string | null;
}

/** Lo que se recuerda entre un mensaje y el siguiente (vive 30 min en la base). */
export type Sesion =
  | { paso: "elegir_comercio"; comercios: Comercio[] }
  | { paso: "catalogo"; comercio: Comercio; productos: ItemCatalogo[]; siguiente: number }
  | {
      paso: "pedido_nombre" | "pedido_direccion" | "pedido_confirmar";
      comercio: Comercio;
      producto: ItemCatalogo;
      cantidad: number;
      nombre?: string;
      direccion?: string;
    };

export interface Contexto {
  /** Normalizado, +57... */
  telefono: string;
  perfil: Perfil | null;
  /** Hay un alta por SMS (0145) a medio camino: esa conversacion manda. */
  altaViva: boolean;
  baja: boolean;
  sesion: Sesion | null;
}

export interface Mensaje {
  para: string;
  texto: string;
}

export interface SolicitudPedido {
  telefono: string;
  canal: Canal;
  comercioId: string;
  productoId: string;
  cantidad: number;
  nombre: string;
  direccion: string;
}

export type ResultadoPedido =
  | {
      ok: true;
      codigo: string;
      comercio: string;
      producto: string;
      total: number;
      telefonoComercio: string | null;
    }
  | { ok: false; motivo: "limite" | "producto" | "datos" | "telefono" };

/** `dejar` = no tocar la sesion; `null` = borrarla. */
export type CambioDeSesion = Sesion | null | "dejar";

export interface Fuente {
  /** `atender: false` = ya se atendio ese mismo mensaje (reintento del proveedor). */
  registrarEntrante(m: MensajeEntrante): Promise<{ id: string; atender: boolean }>;
  /** `null` si el numero no es un celular valido. */
  contexto(canal: Canal, telefono: string): Promise<Contexto | null>;
  /** Le pasa el mensaje al alta de la 0145, que contesta por su cuenta. */
  delegarAlta(telefono: string, texto: string): Promise<{ creado: boolean; rol: string | null }>;
  guia(telefono: string, numero: string): Promise<Guia | null>;
  misGuias(telefono: string): Promise<Guia[]>;
  comercios(termino: string): Promise<Comercio[]>;
  productos(comercioId: string): Promise<ItemCatalogo[]>;
  pedir(s: SolicitudPedido): Promise<ResultadoPedido>;
  marcarBaja(telefono: string, baja: boolean): Promise<void>;
  /** Guarda la sesion, encola las respuestas y da el mensaje por atendido, todo junto. */
  aplicar(
    entranteId: string,
    canal: Canal,
    telefono: string | null,
    sesion: CambioDeSesion,
    mensajes: Mensaje[]
  ): Promise<void>;
}

export type Intencion =
  | { tipo: "alta" }
  | { tipo: "ignorar" }
  | { tipo: "baja" }
  | { tipo: "reactivar" }
  | { tipo: "menu"; noEntendi: boolean }
  | { tipo: "ayuda" }
  | { tipo: "cancelar" }
  | { tipo: "guia"; numero: string }
  | { tipo: "mis_guias" }
  | { tipo: "catalogo"; termino: string }
  | { tipo: "elegir_comercio"; n: number }
  | { tipo: "mas" }
  | { tipo: "pedir"; n: number; cantidad: number }
  | { tipo: "dato"; valor: string }
  | { tipo: "confirmar"; si: boolean }
  | { tipo: "repreguntar" };

export interface Resultado {
  ruta: "motor" | "alta" | "repetido" | "invalido";
  intencion: Intencion["tipo"] | null;
  mensajes: Mensaje[];
  creado?: boolean;
  rol?: string | null;
}

// ── Textos ────────────────────────────────────────────────────────────────

export const LARGO_SMS = 160;

/** Solo lo que cabe en el alfabeto GSM basico sin escape. */
const FUERA_DE_GSM = /[^A-Za-z0-9 \n!"#$%&'()*+,\-./:;<=>?@_]/g;

export function quitarTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** La ultima red: sin tildes, sin simbolos que partan el SMS, y en 160. */
export function sms(texto: string): string {
  const limpio = quitarTildes(texto)
    .replace(FUERA_DE_GSM, "")
    .replace(/[ ]{2,}/g, " ")
    .trim();
  return limpio.length <= LARGO_SMS ? limpio : limpio.slice(0, LARGO_SMS - 3).trimEnd() + "...";
}

/** Un nombre recortado a `max`, sin puntos suspensivos: en 160 cada letra cuenta. */
function corto(s: string, max: number): string {
  const t = quitarTildes(s).replace(FUERA_DE_GSM, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

export function pesos(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function enmascarar(telefono: string): string {
  return "***" + telefono.replace(/\D/g, "").slice(-4);
}

/** +573001234567 → 3001234567, que es como lo marca un comercio en Colombia. */
function local(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return d.startsWith("57") && d.length === 12 ? d.slice(2) : d;
}

const ESTADOS: Record<string, string> = {
  creada: "registrada, falta recogerla",
  recogida: "recogida",
  en_cedi: "en bodega",
  zonificada: "lista para salir a reparto",
  en_ruta: "en camino",
  entregada: "entregada",
  novedad: "con novedad en la entrega",
  reprogramada: "reprogramada para otro intento",
  en_devolucion: "en devolucion al comercio",
  devuelta: "devuelta al comercio",
  cancelada: "cancelada",
};

function dia(iso: string): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
  }).format(f);
}

export const T = {
  menu: (noEntendi: boolean) =>
    sms(
      (noEntendi ? "No entendi. " : "") +
        "YAM: 1 Mis guias 2 Catalogo 3 Ayuda. Tambien puedes escribir GUIA ATL-123 o CATALOGO y el negocio." +
        (noEntendi ? "" : " BAJA para no recibir mas.")
    ),
  ayuda: (conCuenta: boolean) =>
    sms(
      conCuenta
        ? "GUIA y el numero: estado de un pedido. MIS GUIAS: tus pedidos. CATALOGO y el negocio: productos. PEDIR y el numero: pedir. MENU: volver."
        : "YAM por SMS: GUIA y el numero rastrea un pedido. CATALOGO y el negocio muestra productos. Escribe YAM para crear tu cuenta."
    ),
  baja: () =>
    sms(
      "Listo, no te escribimos mas por aqui. Los codigos de entrega de tus pedidos si te llegan. Escribe ALTA para volver."
    ),
  reactivado: () => sms("Bienvenido de nuevo a YAM. Responde MENU para ver las opciones."),
  cancelado: () => sms("Listo, cancelado. Responde MENU cuando quieras."),
  guia: (g: Guia) => {
    const estado = ESTADOS[g.estado] ?? g.estado;
    const cuando = g.estado === "entregada" && g.entregada ? ` el ${dia(g.entregada)}` : "";
    const act = g.estado === "entregada" ? "" : ` Actualizada ${dia(g.actualizada)}.`;
    return sms(`Guia ${g.numero} de ${corto(g.comercio, 40)}: ${estado}${cuando}.${act}`);
  },
  guiaNoEncontrada: (numero: string) =>
    sms(
      `No encontramos la guia ${corto(numero, 20)} para este numero. Revisa el numero o escribe MIS GUIAS.`
    ),
  misGuias: (gs: Guia[]) => {
    if (gs.length === 0) {
      return sms(
        "No vemos pedidos a nombre de este numero. Si esperas uno, pidele el numero de guia al comercio."
      );
    }
    // Caben las que quepan: tres estados largos no entran en un SMS.
    const pie = ". GUIA y el numero para ver una.";
    let texto = "Tus pedidos:";
    for (const [i, g] of gs.entries()) {
      const item = `${i === 0 ? " " : "; "}${g.numero} ${ESTADOS[g.estado] ?? g.estado}`;
      if ((texto + item + pie).length > LARGO_SMS && i > 0) break;
      texto += item;
    }
    return sms(texto + pie);
  },
  comoBuscar: () => sms("Escribe CATALOGO y el nombre del negocio. Ejemplo: CATALOGO PANADERIA"),
  sinComercios: (termino: string) =>
    sms(`No encontramos negocios con "${corto(termino, 30)}". Prueba con otra palabra.`),
  elegirComercio: (cs: Comercio[]) =>
    sms(
      "Encontramos: " +
        cs.map((c, i) => `${i + 1} ${corto(c.nombre, 20)}`).join(" ") +
        ". Responde el numero."
    ),
  sinProductos: (c: Comercio) =>
    sms(`${corto(c.nombre, 40)} no tiene productos publicados por ahora. Escribe CATALOGO para buscar otro.`),
  finCatalogo: () => sms("Eso es todo el catalogo. Responde PEDIR y el numero, o CATALOGO para buscar otro."),
  nadaMas: () => sms("No hay nada mas que mostrar. Responde MENU para ver las opciones."),
  fueraDeLista: () => sms("Ese numero no esta en la lista. Responde con uno de los numeros que te mostramos."),
  pedirSinCatalogo: () =>
    sms("Primero mira el catalogo: escribe CATALOGO y el nombre del negocio, y luego PEDIR y el numero."),
  pedirNombre: () => sms("Para el pedido: como te llamas? Responde nombre y apellido. CANCELAR para dejarlo."),
  nombreInvalido: () => sms("No entendi el nombre. Responde nombre y apellido, o CANCELAR."),
  pedirDireccion: () => sms("A que direccion y barrio te lo llevamos? CANCELAR para dejarlo."),
  direccionInvalida: () => sms("No entendi la direccion. Escribe direccion y barrio, o CANCELAR."),
  confirmarPedido: (s: { cantidad: number; producto: ItemCatalogo; comercio: Comercio; direccion: string }) =>
    sms(
      `Confirmas ${s.cantidad} ${corto(s.producto.nombre, 22)} por ${pesos(s.producto.precio * s.cantidad)} ` +
        `de ${corto(s.comercio.nombre, 22)}, contra entrega, a ${corto(s.direccion, 34)}? Responde SI o NO.`
    ),
  responderSiNo: () => sms("Responde SI para confirmar el pedido o NO para cancelarlo."),
  pedidoListo: (r: { codigo: string; comercio: string; total: number }) =>
    sms(
      `Listo. Pedido ${r.codigo} enviado a ${corto(r.comercio, 28)} por ${pesos(r.total)} mas envio, ` +
        "contra entrega. El negocio te llama para confirmar."
    ),
  avisoComercio: (r: { codigo: string; producto: string; total: number }, s: {
    cantidad: number;
    nombre: string;
    telefono: string;
    direccion: string;
  }) =>
    sms(
      `YAM pedido por SMS ${r.codigo}: ${s.cantidad} ${corto(r.producto, 20)} ${pesos(r.total)}. ` +
        `${corto(s.nombre, 22)} ${local(s.telefono)}, ${corto(s.direccion, 34)}. Llamalo y crea la guia.`
    ),
  pedidoCancelado: () => sms("Pedido cancelado. Escribe CATALOGO para ver otros productos."),
  pedidoFallido: (motivo: string) =>
    sms(
      motivo === "limite"
        ? "Ya hiciste varios pedidos hoy por SMS. Intenta manana o pide por la app."
        : "Ese producto ya no esta disponible. Escribe CATALOGO para ver lo que hay."
    ),
};

/**
 * Una pagina del catalogo: mete productos mientras quepan en un SMS con su pie.
 * `siguiente` es el indice del primero que no cupo.
 */
export function paginaCatalogo(
  c: Comercio,
  productos: ItemCatalogo[],
  desde: number
): { texto: string; siguiente: number } {
  const cab = `${corto(c.nombre, 30)}:`;
  const pieMas = " PEDIR y el numero. MAS para ver mas.";
  const pieFin = " Responde PEDIR y el numero.";
  const partes: string[] = [];
  let i = desde;
  while (i < productos.length) {
    const p = productos[i];
    const item = ` ${i + 1} ${corto(p.nombre, 26)} ${pesos(p.precio)}`;
    const pie = i + 1 < productos.length ? pieMas : pieFin;
    if ((cab + partes.join("") + item + pie).length > LARGO_SMS && partes.length > 0) break;
    partes.push(item);
    i++;
  }
  const pie = i < productos.length ? pieMas : pieFin;
  return { texto: sms(cab + partes.join("") + pie), siguiente: i };
}

// ── Interpretar: el texto y el contexto deciden que quiere la persona ───────

const PALABRAS_BAJA = new Set(["BAJA", "STOP", "NO MAS", "NO ME ESCRIBAN"]);
const PALABRAS_CANCELAR = new Set(["CANCELAR", "SALIR", "CANCELA"]);
const PALABRAS_MENU = new Set(["MENU", "INICIO", "0", "HOLA", "YAM"]);
const PALABRAS_SI = new Set(["SI", "S", "OK", "CONFIRMO", "DALE"]);
const PALABRAS_NO = new Set(["NO", "N"]);

/** Pura: no consulta nada. El mismo texto con el mismo contexto da lo mismo. */
export function interpretar(texto: string, ctx: Contexto): Intencion {
  // Un alta a medio camino es otra conversacion, con sus propias reglas
  // (0145). Ni BAJA se intercepta: la 0145 ya sabe cortar la suya.
  if (ctx.altaViva) return { tipo: "alta" };

  const t = quitarTildes(texto).toUpperCase().replace(/\s+/g, " ").trim();
  const conCuenta = ctx.perfil !== null;

  if (PALABRAS_BAJA.has(t)) return { tipo: "baja" };
  if (ctx.baja) {
    // Quien pidio BAJA no recibe respuesta a nada, salvo a volver.
    return t === "ALTA" || t === "YAM" ? { tipo: "reactivar" } : { tipo: "ignorar" };
  }

  const s = ctx.sesion;

  // Pasos donde lo que escribe ES el dato (un nombre, una direccion): solo
  // MENU y CANCELAR interrumpen. "GUIA 2" puede ser parte de una direccion.
  if (s && (s.paso === "pedido_nombre" || s.paso === "pedido_direccion")) {
    if (PALABRAS_MENU.has(t)) return conCuenta ? { tipo: "menu", noEntendi: false } : { tipo: "cancelar" };
    if (PALABRAS_CANCELAR.has(t)) return { tipo: "cancelar" };
    return { tipo: "dato", valor: texto.replace(/\s+/g, " ").trim() };
  }
  if (s && s.paso === "pedido_confirmar") {
    if (PALABRAS_SI.has(t)) return { tipo: "confirmar", si: true };
    if (PALABRAS_NO.has(t)) return { tipo: "confirmar", si: false };
    if (PALABRAS_CANCELAR.has(t)) return { tipo: "cancelar" };
    if (PALABRAS_MENU.has(t) && conCuenta) return { tipo: "menu", noEntendi: false };
    return { tipo: "repreguntar" };
  }

  if (PALABRAS_CANCELAR.has(t)) return conCuenta || s ? { tipo: "cancelar" } : { tipo: "alta" };
  if (t === "AYUDA" || t === "?") return { tipo: "ayuda" };

  let m = /^GUIA\s+(.+)$/.exec(t);
  if (m) return { tipo: "guia", numero: m[1].replace(/\s+/g, "") };
  if (/^ATL-?\s?\d+$/.test(t)) return { tipo: "guia", numero: t.replace(/\s+/g, "") };
  if (t === "GUIA" || t === "MIS GUIAS" || t === "MIS PEDIDOS" || t === "PEDIDOS") return { tipo: "mis_guias" };

  m = /^CATALOGO(?:\s+(.+))?$/.exec(t);
  if (m) return { tipo: "catalogo", termino: (m[1] ?? "").trim() };
  if (t === "MAS") return { tipo: "mas" };

  m = /^PEDIR\s+(\d{1,2})(?:\s*X?\s*(\d{1,2}))?$/.exec(t);
  if (m) return { tipo: "pedir", n: Number(m[1]), cantidad: m[2] ? Number(m[2]) : 1 };
  if (t.startsWith("PEDIR")) return { tipo: "pedir", n: 0, cantidad: 1 };

  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (s?.paso === "elegir_comercio") return { tipo: "elegir_comercio", n };
    // En el catalogo, un numero solo es pedir ese producto: asi se maneja
    // igual que un menu de USSD o una llamada (oprima 2).
    if (s?.paso === "catalogo") return { tipo: "pedir", n, cantidad: 1 };
    if (conCuenta) {
      if (n === 1) return { tipo: "mis_guias" };
      if (n === 2) return { tipo: "catalogo", termino: "" };
      if (n === 3) return { tipo: "ayuda" };
    }
  }

  if (conCuenta && PALABRAS_MENU.has(t)) return { tipo: "menu", noEntendi: false };

  // Quien no tiene cuenta y no pidio nada que el motor sepa hacer va al alta
  // de la 0145, que es lo que pasaba antes de que existiera este archivo.
  return conCuenta ? { tipo: "menu", noEntendi: true } : { tipo: "alta" };
}

// ── Resolver: consulta lo necesario y redacta ───────────────────────────────

async function mostrarCatalogo(
  fuente: Fuente,
  c: Comercio
): Promise<{ sesion: CambioDeSesion; textos: string[] }> {
  const productos = await fuente.productos(c.id);
  if (productos.length === 0) return { sesion: null, textos: [T.sinProductos(c)] };
  const pag = paginaCatalogo(c, productos, 0);
  return {
    sesion: { paso: "catalogo", comercio: c, productos, siguiente: pag.siguiente },
    textos: [pag.texto],
  };
}

export async function resolver(
  i: Intencion,
  ctx: Contexto,
  fuente: Fuente,
  canal: Canal
): Promise<{ sesion: CambioDeSesion; mensajes: Mensaje[] }> {
  const yo = ctx.telefono;
  const a = (textos: string[], sesion: CambioDeSesion = "dejar") => ({
    sesion,
    mensajes: textos.map((texto) => ({ para: yo, texto })),
  });
  const s = ctx.sesion;

  switch (i.tipo) {
    case "alta":
    case "ignorar":
      return a([]);

    case "baja":
      await fuente.marcarBaja(yo, true);
      return a([T.baja()], null);

    case "reactivar":
      await fuente.marcarBaja(yo, false);
      return a([T.reactivado()], null);

    case "menu":
      return a([T.menu(i.noEntendi)], null);

    case "ayuda":
      return a([T.ayuda(ctx.perfil !== null)]);

    case "cancelar":
      return a([T.cancelado()], null);

    case "guia": {
      const g = await fuente.guia(yo, i.numero);
      return a([g ? T.guia(g) : T.guiaNoEncontrada(i.numero)]);
    }

    case "mis_guias":
      return a([T.misGuias(await fuente.misGuias(yo))]);

    case "catalogo": {
      if (i.termino.length < 3) return a([T.comoBuscar()]);
      const cs = await fuente.comercios(i.termino);
      if (cs.length === 0) return a([T.sinComercios(i.termino)]);
      if (cs.length === 1) {
        const r = await mostrarCatalogo(fuente, cs[0]);
        return a(r.textos, r.sesion);
      }
      return a([T.elegirComercio(cs)], { paso: "elegir_comercio", comercios: cs });
    }

    case "elegir_comercio": {
      if (s?.paso !== "elegir_comercio") return a([T.nadaMas()]);
      const c = s.comercios[i.n - 1];
      if (!c) return a([T.fueraDeLista()]);
      const r = await mostrarCatalogo(fuente, c);
      return a(r.textos, r.sesion);
    }

    case "mas": {
      if (s?.paso !== "catalogo") return a([T.nadaMas()]);
      if (s.siguiente >= s.productos.length) return a([T.finCatalogo()]);
      const pag = paginaCatalogo(s.comercio, s.productos, s.siguiente);
      return a([pag.texto], { ...s, siguiente: pag.siguiente });
    }

    case "pedir": {
      if (s?.paso !== "catalogo") return a([T.pedirSinCatalogo()]);
      const producto = s.productos[i.n - 1];
      if (!producto) return a([T.fueraDeLista()]);
      const cantidad = Math.min(Math.max(i.cantidad, 1), 20);
      const base = { comercio: s.comercio, producto, cantidad };
      const nombre = ctx.perfil?.nombre?.trim();
      if (nombre && nombre.length >= 3) {
        return a([T.pedirDireccion()], { paso: "pedido_direccion", ...base, nombre });
      }
      return a([T.pedirNombre()], { paso: "pedido_nombre", ...base });
    }

    case "dato": {
      if (s?.paso === "pedido_nombre") {
        if (i.valor.length < 3 || /^\d+$/.test(i.valor)) return a([T.nombreInvalido()]);
        return a([T.pedirDireccion()], { ...s, paso: "pedido_direccion", nombre: i.valor.slice(0, 80) });
      }
      if (s?.paso === "pedido_direccion") {
        if (i.valor.length < 5) return a([T.direccionInvalida()]);
        const direccion = i.valor.slice(0, 160);
        return a([T.confirmarPedido({ ...s, direccion })], { ...s, paso: "pedido_confirmar", direccion });
      }
      return a([T.menu(true)], null);
    }

    case "confirmar": {
      if (s?.paso !== "pedido_confirmar" || !s.nombre || !s.direccion) return a([T.menu(true)], null);
      if (!i.si) return a([T.pedidoCancelado()], null);
      const r = await fuente.pedir({
        telefono: yo,
        canal,
        comercioId: s.comercio.id,
        productoId: s.producto.id,
        cantidad: s.cantidad,
        nombre: s.nombre,
        direccion: s.direccion,
      });
      if (!r.ok) return a([T.pedidoFallido(r.motivo)], null);
      const mensajes: Mensaje[] = [{ para: yo, texto: T.pedidoListo(r) }];
      if (r.telefonoComercio) {
        mensajes.push({
          para: r.telefonoComercio,
          texto: T.avisoComercio(r, {
            cantidad: s.cantidad,
            nombre: s.nombre,
            telefono: yo,
            direccion: s.direccion,
          }),
        });
      }
      return { sesion: null, mensajes };
    }

    case "repreguntar":
      return a([T.responderSiNo()]);
  }
}

// ── Procesar: el recorrido completo de un mensaje ───────────────────────────

/**
 * Lo que hace cada adaptador al recibir un mensaje. Si algo de la `Fuente`
 * falla, se lanza y el mensaje queda SIN marcar como atendido: el reintento
 * del proveedor lo vuelve a intentar entero, y como la sesion y las
 * respuestas se escriben juntas en `aplicar`, no queda nada a medias.
 */
export async function procesar(fuente: Fuente, m: MensajeEntrante): Promise<Resultado> {
  const reg = await fuente.registrarEntrante(m);
  if (!reg.atender) return { ruta: "repetido", intencion: null, mensajes: [] };

  const ctx = await fuente.contexto(m.canal, m.telefono);
  if (!ctx) {
    await fuente.aplicar(reg.id, m.canal, null, "dejar", []);
    return { ruta: "invalido", intencion: null, mensajes: [] };
  }

  const intencion = interpretar(m.texto, ctx);

  if (intencion.tipo === "alta") {
    const r = await fuente.delegarAlta(ctx.telefono, m.texto);
    await fuente.aplicar(reg.id, m.canal, ctx.telefono, "dejar", []);
    return { ruta: "alta", intencion: "alta", mensajes: [], creado: r.creado, rol: r.rol };
  }

  const { sesion, mensajes } = await resolver(intencion, ctx, fuente, m.canal);
  await fuente.aplicar(reg.id, m.canal, ctx.telefono, sesion, mensajes);
  return { ruta: "motor", intencion: intencion.tipo, mensajes };
}
