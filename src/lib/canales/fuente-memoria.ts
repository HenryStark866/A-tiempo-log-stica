import type {
  Canal,
  CambioDeSesion,
  Comercio,
  Contexto,
  Fuente,
  Guia,
  ItemCatalogo,
  Mensaje,
  MensajeEntrante,
  Perfil,
  ResultadoPedido,
  Sesion,
  SolicitudPedido,
} from "./motor";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FUENTE EN MEMORIA — para los tests y el simulador
 *
 * Imita lo que hacen las funciones de la migración 0150 con datos de mentira,
 * incluidas las reglas que importan: la guía solo se le muestra a su
 * destinatario o a su comercio, el precio del pedido sale del catálogo y no
 * de lo que diga la sesión, y un mismo mensaje del proveedor se atiende una
 * sola vez. Si estas reglas cambian en SQL, cambian aquí.
 *
 * Solo importa tipos (que Node borra al cargar el archivo): así el simulador
 * la usa sin compilar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface DatosDeMemoria {
  perfiles: (Perfil & { telefono: string; comercioId?: string })[];
  comercios: (Comercio & { telefono: string | null })[];
  productos: (ItemCatalogo & { comercioId: string; activo: boolean })[];
  guias: (Guia & { telefonoDestinatario: string; comercioId: string; creada: string })[];
  /** Teléfonos con un alta por SMS (0145) a medio camino. */
  altasVivas: string[];
}

export interface PedidoGuardado extends SolicitudPedido {
  codigo: string;
  total: number;
}

/** Lo mismo que at_sms_normalizar_telefono. */
export function normalizarTelefono(t: string): string | null {
  let v = (t ?? "").replace(/\D/g, "");
  if (v === "") return null;
  v = v.replace(/^00/, "");
  if (v.length === 10 && v.startsWith("3")) v = "57" + v;
  if (v.length < 10) return null;
  return "+" + v;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

function numeroDeGuia(n: string): string {
  const v = n.toUpperCase().replace(/\s/g, "");
  if (/^\d+$/.test(v)) return "ATL-" + v;
  if (/^ATL\d+$/.test(v)) return "ATL-" + v.slice(3);
  return v;
}

export function fuenteMemoria(datos: DatosDeMemoria) {
  const entrantes = new Map<string, { id: string; atendido: boolean }>();
  const sesiones = new Map<string, Sesion>();
  const bajas = new Set<string>();
  const buzon: (Mensaje & { canal: Canal })[] = [];
  const pedidos: PedidoGuardado[] = [];
  const altasDelegadas: { telefono: string; texto: string }[] = [];
  let secuencia = 0;

  const esSuya = (g: DatosDeMemoria["guias"][number], tel: string) =>
    normalizarTelefono(g.telefonoDestinatario) === tel ||
    datos.perfiles.some((p) => p.rol === "cliente" && p.comercioId === g.comercioId && normalizarTelefono(p.telefono) === tel);

  const fuente: Fuente = {
    async registrarEntrante(m: MensajeEntrante) {
      const clave = `${m.canal}:${m.proveedorId ?? `sin-id-${++secuencia}`}`;
      const previo = entrantes.get(clave);
      if (previo) return { id: previo.id, atender: !previo.atendido };
      const id = `e${++secuencia}`;
      entrantes.set(clave, { id, atendido: false });
      return { id, atender: true };
    },

    async contexto(canal: Canal, telefono: string): Promise<Contexto | null> {
      const tel = normalizarTelefono(telefono);
      if (!tel) return null;
      const p = datos.perfiles.find((x) => normalizarTelefono(x.telefono) === tel);
      return {
        telefono: tel,
        perfil: p ? { id: p.id, nombre: p.nombre, rol: p.rol } : null,
        altaViva: datos.altasVivas.includes(tel),
        baja: bajas.has(tel),
        sesion: sesiones.get(`${canal}:${tel}`) ?? null,
      };
    },

    async delegarAlta(telefono: string, texto: string) {
      altasDelegadas.push({ telefono, texto });
      buzon.push({ canal: "sms", para: telefono, texto: "[alta por SMS de la 0145: aqui contesta at_sms_recibir]" });
      return { creado: false, rol: null };
    },

    async guia(telefono: string, numero: string) {
      const n = numeroDeGuia(numero);
      const g = datos.guias.find((x) => x.numero === n && esSuya(x, telefono));
      return g ? { numero: g.numero, estado: g.estado, comercio: g.comercio, actualizada: g.actualizada, entregada: g.entregada } : null;
    },

    async misGuias(telefono: string) {
      return datos.guias
        .filter((g) => normalizarTelefono(g.telefonoDestinatario) === telefono)
        .sort((a, b) => b.creada.localeCompare(a.creada))
        .slice(0, 3)
        .map(({ numero, estado, comercio, actualizada, entregada }) => ({ numero, estado, comercio, actualizada, entregada }));
    },

    async comercios(termino: string) {
      const t = norm(termino);
      if (t.length < 3) return [];
      return datos.comercios
        .filter((c) => norm(c.nombre).includes(t) && datos.productos.some((p) => p.comercioId === c.id && p.activo))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .slice(0, 5)
        .map(({ id, nombre }) => ({ id, nombre }));
    },

    async productos(comercioId: string) {
      return datos.productos
        .filter((p) => p.comercioId === comercioId && p.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .slice(0, 30)
        .map(({ id, nombre, precio }) => ({ id, nombre, precio }));
    },

    async pedir(s: SolicitudPedido): Promise<ResultadoPedido> {
      // Mismo orden que at_canal_pedir: primero se valida, después se cuenta el tope.
      const p = datos.productos.find((x) => x.id === s.productoId && x.comercioId === s.comercioId && x.activo);
      const c = datos.comercios.find((x) => x.id === s.comercioId);
      if (!p || !c) return { ok: false, motivo: "producto" };
      const hoy = pedidos.filter((x) => x.telefono === s.telefono).length;
      if (hoy >= 5) return { ok: false, motivo: "limite" };
      const codigo = `P-${(++secuencia).toString(16).toUpperCase().padStart(6, "0")}`;
      const total = p.precio * s.cantidad;
      pedidos.push({ ...s, codigo, total });
      return {
        ok: true,
        codigo,
        comercio: c.nombre,
        producto: p.nombre,
        total,
        telefonoComercio: c.telefono ? normalizarTelefono(c.telefono) : null,
      };
    },

    async marcarBaja(telefono: string, baja: boolean) {
      if (baja) bajas.add(telefono);
      else bajas.delete(telefono);
    },

    async aplicar(entranteId: string, canal: Canal, telefono: string | null, sesion: CambioDeSesion, mensajes: Mensaje[]) {
      if (telefono && sesion !== "dejar") {
        if (sesion === null) sesiones.delete(`${canal}:${telefono}`);
        else sesiones.set(`${canal}:${telefono}`, sesion);
      }
      for (const m of mensajes) buzon.push({ ...m, canal });
      for (const e of entrantes.values()) if (e.id === entranteId) e.atendido = true;
    },
  };

  return { fuente, buzon, pedidos, sesiones, altasDelegadas };
}

/** Datos de mentira para el simulador y los tests. Ningún teléfono es real. */
export function datosDeEjemplo(): DatosDeMemoria {
  const hace = (h: number) => new Date(Date.UTC(2026, 9, 21, 15) - h * 3_600_000).toISOString();
  return {
    perfiles: [
      { id: "u-ana", nombre: "Ana María Gómez", rol: "comprador", telefono: "+573005550001" },
      { id: "u-norte", nombre: "Rosa Pérez", rol: "cliente", telefono: "3005550009", comercioId: "c-norte" },
    ],
    comercios: [
      { id: "c-norte", nombre: "Panadería Norte", telefono: "300 555 0009" },
      { id: "c-sur", nombre: "Panadería del Sur", telefono: null },
      { id: "c-rosa", nombre: "Tienda Doña Rosa", telefono: "3005550010" },
      { id: "c-vacia", nombre: "Panadería Cerrada", telefono: null },
    ],
    productos: [
      { id: "p1", comercioId: "c-norte", nombre: "Pan de bono x10", precio: 8000, activo: true },
      { id: "p2", comercioId: "c-norte", nombre: "Torta de chocolate", precio: 25000, activo: true },
      { id: "p3", comercioId: "c-norte", nombre: "Galletas de avena", precio: 3500, activo: true },
      { id: "p4", comercioId: "c-norte", nombre: "Pandequeso grande", precio: 2500, activo: true },
      { id: "p5", comercioId: "c-norte", nombre: "Mantecada", precio: 1800, activo: true },
      { id: "p6", comercioId: "c-norte", nombre: "Roscón de arequipe", precio: 4200, activo: true },
      { id: "p7", comercioId: "c-norte", nombre: "Croissant de jamón y queso", precio: 5500, activo: true },
      { id: "p8", comercioId: "c-norte", nombre: "Producto retirado", precio: 100, activo: false },
      { id: "p9", comercioId: "c-sur", nombre: "Pan francés", precio: 3000, activo: true },
      { id: "p10", comercioId: "c-rosa", nombre: "Arepas de choclo x5", precio: 9000, activo: true },
    ],
    guias: [
      { numero: "ATL-1001", estado: "en_ruta", comercio: "Panadería Norte", actualizada: hace(1), entregada: null, telefonoDestinatario: "300 555 0001", comercioId: "c-norte", creada: hace(5) },
      { numero: "ATL-0999", estado: "entregada", comercio: "Tienda Doña Rosa", actualizada: hace(30), entregada: hace(30), telefonoDestinatario: "+573005550001", comercioId: "c-rosa", creada: hace(48) },
      { numero: "ATL-1002", estado: "creada", comercio: "Panadería Norte", actualizada: hace(2), entregada: null, telefonoDestinatario: "3005550002", comercioId: "c-norte", creada: hace(2) },
    ],
    altasVivas: [],
  };
}
