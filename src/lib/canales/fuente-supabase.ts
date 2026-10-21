import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Canal,
  CambioDeSesion,
  Comercio,
  Contexto,
  Fuente,
  Guia,
  ItemCatalogo,
  Mensaje,
  ResultadoPedido,
  Sesion,
} from "./motor";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FUENTE DE VERDAD — el motor de canales contra la base
 *
 * Cada método es una RPC de la migración 0150 (o de la 0145, para el alta).
 * Necesita el cliente con la llave de servicio: todas esas funciones se le
 * niegan a anon y authenticated.
 *
 * Un error de la base se lanza con su código en `codigo`. La ruta mira uno:
 * PT429, el freno de `at_limitar`, que no es un fallo sino un número que
 * escribe demasiado.
 *
 * Solo importa tipos, igual que el motor: el simulador la carga con Node sin
 * compilar para hablar con la base local.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface ErrorDeBase {
  message: string;
  code?: string;
}

function lanzar(donde: string, e: ErrorDeBase): never {
  throw Object.assign(new Error(`${donde}: ${e.message}`), { codigo: e.code ?? null });
}

async function rpc<T>(db: SupabaseClient, nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(nombre, args);
  if (error) lanzar(nombre, error);
  return data as T;
}

const PASOS = new Set(["elegir_comercio", "catalogo", "pedido_nombre", "pedido_direccion", "pedido_confirmar"]);

export function fuenteSupabase(db: SupabaseClient): Fuente {
  return {
    async registrarEntrante(m) {
      return rpc<{ id: string; atender: boolean }>(db, "at_canal_registrar_entrante", {
        p_canal: m.canal,
        p_proveedor_id: m.proveedorId,
        p_telefono: m.telefono,
        p_texto: m.texto,
      });
    },

    async contexto(canal: Canal, telefono: string): Promise<Contexto | null> {
      const c = await rpc<{
        telefono: string;
        perfil: { id: string; nombre: string; rol: string } | null;
        alta_viva: boolean;
        baja: boolean;
        sesion: { paso?: string } | null;
      } | null>(db, "at_canal_contexto", { p_canal: canal, p_telefono: telefono });
      if (!c) return null;
      // La sesión la escribe solo este código, pero viene de una columna jsonb:
      // un paso que no se reconoce se trata como si no hubiera sesión.
      const sesion = c.sesion && PASOS.has(c.sesion.paso ?? "") ? (c.sesion as Sesion) : null;
      return { telefono: c.telefono, perfil: c.perfil, altaViva: c.alta_viva, baja: c.baja, sesion };
    },

    /**
     * El alta de la 0145, tal como la hacía la ruta antes de que hubiera motor:
     * la conversación la lleva `at_sms_recibir`, y cuando la persona confirma,
     * aquí se crea el usuario en auth (el hash de la clave lo gobierna GoTrue,
     * no SQL) y `at_sms_confirmar_alta` remata.
     */
    async delegarAlta(telefono: string, texto: string) {
      const paso = (await rpc<{ crear?: boolean; alta_id?: string; rol?: string } | null>(db, "at_sms_recibir", {
        p_telefono: telefono,
        p_texto: texto,
      })) ?? {};

      if (!paso.crear || !paso.alta_id) return { creado: false, rol: paso.rol ?? null };

      // El teléfono es la identidad (quien llega por aquí puede no tener
      // correo). La clave es aleatoria y nadie la ve: a esta cuenta se entra
      // por código de un solo uso.
      const { data: creado, error } = await db.auth.admin.createUser({
        phone: telefono.replace(/[^0-9+]/g, ""),
        phone_confirm: true, // el SMS llegó DESDE ese número: el número está probado
        password: crypto.randomUUID() + crypto.randomUUID(),
        user_metadata: { alta: "sms", rol_pedido: paso.rol ?? "comprador" },
      });
      // Si falla, la conversación se queda en 'listo': cuando se arregle, el
      // siguiente SI la remata sin volver a preguntarle nada a la persona.
      if (error || !creado?.user) lanzar("crear usuario", { message: error?.message ?? "sin usuario" });

      await rpc(db, "at_sms_confirmar_alta", { p_alta_id: paso.alta_id, p_user_id: creado.user.id });
      return { creado: true, rol: paso.rol ?? null };
    },

    async guia(telefono: string, numero: string) {
      return rpc<Guia | null>(db, "at_canal_guia", { p_telefono: telefono, p_numero: numero });
    },

    async misGuias(telefono: string) {
      return (await rpc<Guia[] | null>(db, "at_canal_mis_guias", { p_telefono: telefono })) ?? [];
    },

    async comercios(termino: string) {
      return (await rpc<Comercio[] | null>(db, "at_canal_comercios", { p_termino: termino })) ?? [];
    },

    async productos(comercioId: string) {
      const filas = (await rpc<ItemCatalogo[] | null>(db, "at_canal_productos", { p_client_id: comercioId })) ?? [];
      // numeric llega como número o como texto según el driver: se fuerza aquí.
      return filas.map((p) => ({ ...p, precio: Number(p.precio) }));
    },

    async pedir(s): Promise<ResultadoPedido> {
      const r = await rpc<{
        ok: boolean;
        motivo?: "limite" | "producto" | "datos" | "telefono";
        codigo?: string;
        comercio?: string;
        producto?: string;
        total?: number | string;
        telefono_comercio?: string | null;
      }>(db, "at_canal_pedir", {
        p_telefono: s.telefono,
        p_canal: s.canal,
        p_pedido: {
          comercio_id: s.comercioId,
          producto_id: s.productoId,
          cantidad: String(s.cantidad),
          nombre: s.nombre,
          direccion: s.direccion,
        },
      });
      if (!r.ok) return { ok: false, motivo: r.motivo ?? "datos" };
      return {
        ok: true,
        codigo: r.codigo!,
        comercio: r.comercio!,
        producto: r.producto!,
        total: Number(r.total),
        telefonoComercio: r.telefono_comercio ?? null,
      };
    },

    async marcarBaja(telefono: string, baja: boolean) {
      await rpc(db, "at_canal_marcar_baja", { p_telefono: telefono, p_baja: baja });
    },

    async aplicar(entranteId: string, canal: Canal, telefono: string | null, sesion: CambioDeSesion, mensajes: Mensaje[]) {
      await rpc(db, "at_canal_aplicar", {
        p_entrante: entranteId,
        p_canal: canal,
        p_telefono: telefono,
        p_sesion_accion: sesion === "dejar" ? "dejar" : sesion === null ? "borrar" : "guardar",
        p_sesion: sesion === "dejar" || sesion === null ? null : sesion,
        p_mensajes: mensajes,
      });
    },
  };
}
