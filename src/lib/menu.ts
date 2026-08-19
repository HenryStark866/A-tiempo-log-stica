import type React from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  Contact,
  IdCard,
  KeyRound,
  LayoutDashboard,
  Map,
  MapPinned,
  Package,
  PackageOpen,
  Radio,
  Receipt,
  Route,
  ShieldAlert,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import type { Role } from "@/lib/types";

/**
 * El menú de la plataforma: qué existe y quién lo ve.
 *
 * Vive aquí y no dentro de AppShell porque lo dibujan DOS sitios: la barra
 * lateral y la pantalla de inicio. Copiarlo en el segundo habría garantizado
 * que un día se agregue una opción a uno y no al otro, y que alguien jure que
 * la pantalla existe mientras otro jura que no.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
}

/**
 * Jerarquía de la operación. Cada rol ve lo que necesita para su parte del
 * flujo, y nada más:
 *
 *  admin       → todo, incluida la gestión de usuarios.
 *  coordinador → todo menos usuarios: además de la operación, lleva lo
 *                financiero (recaudo, facturación) y habilita mensajeros.
 *  operario    → el CEDI de punta a punta: recibe, despacha por zonas,
 *                resuelve novedades y ve qué se entregó. NO toca plata ni
 *                aprueba personal; eso es decisión de coordinación.
 *  mensajero   → sus recogidas, su ruta, su perfil y su recaudo.
 *  cliente     → su comercio, sus sedes, su equipo, sus pedidos, su recaudo,
 *                sus productos y su seguimiento. Es el DUEÑO.
 *  asesor      → trabaja para un comercio: registra pedidos y pide recogidas.
 *                Nunca ve facturas, pagos ni recaudo; eso es de su jefe.
 *
 * Esconder algo del menú NO es protegerlo: cada pantalla valida el rol por su
 * cuenta, y la base valida otra vez en RLS y en los RPC.
 */
export const NAV: NavItem[] = [
  // «Inicio» NO está en esta lista, y la pantalla sí existe: es donde aterriza
  // todo el mundo al entrar y a donde lleva el logo desde cualquier sitio.
  // Tenerla además como pestaña era ofrecer un camino de vuelta a la pantalla
  // que ya es el punto de partida — una fila del menú gastada en no ir a
  // ninguna parte.
  { href: "/dashboard", label: "Mi panel", icon: LayoutDashboard, roles: ["admin", "coordinador", "operario", "mensajero", "cliente", "admin_cedi", "asesor"] },
  { href: "/pedidos", label: "Pedidos", icon: Package, roles: ["admin", "coordinador", "operario", "cliente", "admin_cedi", "asesor"] },
  { href: "/recogidas", label: "Recogidas", icon: PackageOpen, roles: ["admin", "coordinador", "operario", "cliente", "admin_cedi", "asesor"] },
  { href: "/cedi", label: "CEDI", icon: Warehouse, roles: ["admin", "coordinador", "operario", "admin_cedi"] },
  { href: "/mapa", label: "Mapa", icon: Map, roles: ["admin", "coordinador", "operario", "admin_cedi"] },
  { href: "/codigos", label: "Códigos", icon: KeyRound, roles: ["admin", "coordinador", "operario", "admin_cedi"] },
  // El mensajero ya no entra aquí: Ruteo pasó a ser el tablero de despacho del
  // CEDI. Su ruta del día la ve en /entregas.
  { href: "/rutas", label: "Ruteo", icon: Route, roles: ["admin", "coordinador", "operario", "admin_cedi"] },
  { href: "/novedades", label: "Novedades", icon: AlertTriangle, roles: ["admin", "coordinador", "operario", "admin_cedi"] },
  // El operario coordina el CEDI: necesita ver dónde va cada mensajero para
  // saber a quién le cabe el siguiente lote y a quién llamar si se atrasa.
  { href: "/seguimiento", label: "Seguimiento", icon: Radio, roles: ["cliente", "admin", "coordinador", "operario", "admin_cedi", "asesor"] },
  { href: "/destinatarios", label: "Clientes", icon: Contact, roles: ["cliente", "asesor"] },
  { href: "/productos", label: "Productos", icon: Tag, roles: ["cliente", "asesor"] },
  { href: "/conductor/recogida", label: "Mis recogidas", icon: PackageOpen, roles: ["mensajero"] },
  { href: "/entregas", label: "Mi ruta", icon: MapPinned, roles: ["mensajero"] },
  // Mi perfil es de TODOS, no solo del mensajero. La pantalla se abrió a todos
  // los roles —cada quien edita sus datos y su red social— pero este menú se
  // quedó atrás, así que para un admin o un comercio la pantalla existía sin
  // que hubiera manera de llegar a ella. En escritorio se llega además tocando
  // tu nombre abajo en la barra; en el teléfono ese bloque no existe y esta
  // fila es el único camino.
  { href: "/mi-perfil", label: "Mi perfil", icon: IdCard, roles: ["admin", "coordinador", "operario", "mensajero", "cliente", "admin_cedi", "asesor"] },
  { href: "/mensajeros", label: "Mensajeros", icon: BadgeCheck, roles: ["admin", "coordinador", "admin_cedi"] },
  { href: "/recaudo", label: "Recaudo", icon: Banknote, roles: ["admin", "coordinador", "mensajero", "admin_cedi"] },
  // El comercio ve SU recaudo aparte: la plata que le cobramos a sus
  // compradores y en cuál de los cuatro estados está. /recaudo es la caja de la
  // operación y no es lo mismo — mezclarlas le mostraría plata de otros.
  { href: "/mi-recaudo", label: "Mi recaudo", icon: Banknote, roles: ["cliente"] },
  // El comercio lo capta y factura A Tiempo a nivel nacional (decisión de
  // negocio): admin_cedi no entra aquí ni a /clientes, esos siguen siendo
  // del personal nacional.
  { href: "/facturacion", label: "Facturación", icon: Receipt, roles: ["admin", "coordinador", "cliente"] },
  // Consulta, no edición: el operario llama al comercio cuando una recogida
  // llega incompleta. Modificar sus datos sigue siendo de coordinación.
  { href: "/clientes", label: "Clientes", icon: Building2, roles: ["admin", "coordinador", "operario", "mensajero"] },
  { href: "/sedes", label: "Sedes", icon: Building2, roles: ["admin"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { href: "/seguridad", label: "Seguridad", icon: ShieldAlert, roles: ["admin", "coordinador"] },
];
