"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  Contact,
  Hourglass,
  IdCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Map,
  MapPinned,
  Package,
  PackageOpen,
  Radio,
  Receipt,
  Route,
  Clock,
  ShieldAlert,
  Store,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationsProvider } from "@/components/NotificationsContext";
import { ProfileProvider } from "@/components/ProfileContext";
import { InstalarApp } from "@/components/InstalarApp";
import { Reloj } from "@/components/Reloj";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import type { Profile, Role } from "@/lib/types";

interface NavItem {
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
 *  cliente     → su comercio, sus guías, sus productos y su seguimiento.
 *
 * Esconder algo del menú NO es protegerlo: cada pantalla valida el rol por su
 * cuenta, y la base valida otra vez en RLS y en los RPC.
 */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Mi panel", icon: LayoutDashboard, roles: ["admin", "coordinador", "operario", "mensajero", "cliente"] },
  { href: "/guias", label: "Guías", icon: Package, roles: ["admin", "coordinador", "operario", "cliente"] },
  { href: "/recogidas", label: "Recogidas", icon: PackageOpen, roles: ["admin", "coordinador", "operario", "cliente"] },
  { href: "/cedi", label: "CEDI", icon: Warehouse, roles: ["admin", "coordinador", "operario"] },
  { href: "/mapa", label: "Mapa", icon: Map, roles: ["admin", "coordinador", "operario"] },
  { href: "/codigos", label: "Códigos", icon: KeyRound, roles: ["admin", "coordinador", "operario"] },
  // El mensajero ya no entra aquí: Ruteo pasó a ser el tablero de despacho del
  // CEDI. Su ruta del día la ve en /entregas.
  { href: "/rutas", label: "Ruteo", icon: Route, roles: ["admin", "coordinador", "operario"] },
  { href: "/novedades", label: "Novedades", icon: AlertTriangle, roles: ["admin", "coordinador", "operario"] },
  // El operario coordina el CEDI: necesita ver dónde va cada mensajero para
  // saber a quién le cabe el siguiente lote y a quién llamar si se atrasa.
  { href: "/seguimiento", label: "Seguimiento", icon: Radio, roles: ["cliente", "admin", "coordinador", "operario"] },
  { href: "/destinatarios", label: "Clientes", icon: Contact, roles: ["cliente"] },
  { href: "/productos", label: "Productos", icon: Tag, roles: ["cliente"] },
  { href: "/mi-comercio", label: "Mi comercio", icon: Store, roles: ["cliente"] },
  { href: "/conductor/recogida", label: "Mis recogidas", icon: PackageOpen, roles: ["mensajero"] },
  { href: "/entregas", label: "Mi ruta", icon: MapPinned, roles: ["mensajero"] },
  { href: "/mi-perfil", label: "Mi perfil", icon: IdCard, roles: ["mensajero"] },
  { href: "/mensajeros", label: "Mensajeros", icon: BadgeCheck, roles: ["admin", "coordinador"] },
  { href: "/recaudo", label: "Recaudo", icon: Banknote, roles: ["admin", "coordinador", "mensajero"] },
  { href: "/facturacion", label: "Facturación", icon: Receipt, roles: ["admin", "coordinador", "cliente"] },
  // Consulta, no edición: el operario llama al comercio cuando una recogida
  // llega incompleta. Modificar sus datos sigue siendo de coordinación.
  { href: "/clientes", label: "Clientes", icon: Building2, roles: ["admin", "coordinador", "operario", "mensajero"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
  { href: "/seguridad", label: "Seguridad", icon: ShieldAlert, roles: ["admin", "coordinador"] },
];

export function AppShell({
  profile,
  email,
  children,
}: {
  profile: Profile;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingRequests, setPendingRequests] = useState(0);
  const tabActiva = useRef<HTMLAnchorElement>(null);

  // La barra de abajo no alcanza a mostrar todas las secciones de un rol con
  // muchos permisos, así que se desplaza a dedo. Al cambiar de pantalla se trae
  // la pestaña actual al centro: si no, el mensajero abre una sección y la
  // barra le sigue mostrando el tramo del principio, sin nada resaltado.
  useEffect(() => {
    tabActiva.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  useEffect(() => {
    if (profile.role !== "admin") return;
    const supabase = createClient();
    supabase
      .from("at_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "pendiente")
      .not("requested_role", "is", null)
      .then(({ count }) => setPendingRequests(count ?? 0));
  }, [profile.role, pathname]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (profile.role === "pendiente" || !profile.active) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 transition-colors duration-300">
          <div className="max-w-md rounded-3xl border border-gray-200 dark:border-gray-800 bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm transition-colors duration-300">
            <Hourglass className="mx-auto mb-4 size-10 text-[#ff812c]" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Cuenta pendiente de activación
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Tu cuenta <strong>{email}</strong> fue creada, pero un administrador
              debe asignarte un rol antes de que puedas operar.
            </p>
            <button
              onClick={signOut}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(profile.role));

  return (
    <ProfileProvider profile={profile}>
      {/* Las dos campanas (teléfono y escritorio) leen de aquí: una sola
          consulta, un solo sondeo y una sola suscripción a Realtime. */}
      <NotificationsProvider userId={profile.id}>
      <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-900 dark:text-slate-100 transition-colors duration-300 flex flex-col md:flex-row font-sans">
          
          {/* Top Header (Mobile Only) — al padding de arriba se le suma la zona
              segura: la barra de estado de iOS es translúcida y la app se
              dibuja por debajo de la hora.

              El `md:` de aquí es el umbral del armazón: por debajo manda esta
              cabecera, por encima la barra lateral. NotificationBell usa ese
              mismo ancho para decidir si abre una hoja o un desplegable; si
              cambia uno, cambia el otro. */}
          <header className="md:hidden flex items-center justify-between gap-2 px-4 sm:px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sticky top-0 z-30 border-b border-gray-200/60 dark:border-gray-800/60">
            {/* El fondo esmerilado va en su propia capa, sin hijos. Un
                backdrop-blur en el <header> mismo crea un containing block
                nuevo para cualquier descendiente `position: fixed`, que
                entonces se ancla a los 73 px del header en vez de a la
                pantalla. Ya rompió una vez el panel de notificaciones: se
                abría hacia arriba y solo asomaba una franja.

                La campana ya no depende de esto —su hoja cuelga de <body>
                por un portal, ver NotificationBell—, pero la capa se queda:
                cuesta un div y evita que el próximo `fixed` que alguien
                ponga aquí dentro se rompa por un motivo invisible. */}
            <div className="absolute inset-0 -z-10 bg-[#FFFFFF]/80 dark:bg-[#2C2C2E]/80 backdrop-blur-xl" />
            {/* `overflow-hidden`: en pantallas de 320 px el logo, el reloj y
                los dos controles no caben juntos. Que lo que ceda sea el
                descriptor de la marca —que ya se sabe de memoria— y no la
                hora, que es dato de trabajo. */}
            <Link
              href={profile.role === 'mensajero' ? '/entregas' : '/dashboard'}
              className="flex min-w-0 items-center gap-2 overflow-hidden"
            >
              <Logo className="scale-[0.8] origin-left" />
            </Link>
            <Reloj className="shrink-0" />
            <div className="flex shrink-0 items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>

          {/* Desktop Left Sidebar — algo más angosta en tablet, donde 256 px se
              comían un tercio del ancho útil de la pantalla. */}
          <aside className="hidden md:flex flex-col w-56 lg:w-64 fixed inset-y-0 left-0 bg-[#FFFFFF] dark:bg-[#2C2C2E] border-r border-gray-200 dark:border-gray-800 z-30 transition-colors duration-300">
            {/* Arriba solo marca y campana. El logo ocupa 147 px y los controles
                40 cada uno: los tres juntos no caben en una barra de 224-256 px,
                y antes la campana se salía por el borde. El cambio de tema se
                fue abajo, con la cuenta, que es donde se lo espera. */}
            <div className="flex items-center justify-between gap-2 px-3 pt-5 lg:px-5 lg:pt-6">
              <Link
                href={profile.role === 'mensajero' ? '/entregas' : '/dashboard'}
                className="flex min-w-0 items-center gap-2"
              >
                <Logo className="scale-90 origin-left" />
              </Link>
              <div className="shrink-0">
                <NotificationBell align="left" />
              </div>
            </div>

            {/* La hora de la operación, no la del computador: quien despacha
                desde el CEDI y quien entrega en la calle tienen que estar
                mirando el mismo reloj. */}
            <div className="px-3 pt-4 pb-3 lg:px-5">
              <Reloj variant="amplio" />
            </div>

            <nav className="flex-1 px-3 lg:px-4 py-2 space-y-1.5 overflow-y-auto no-scrollbar">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 lg:px-4 py-3 text-[15px] font-medium transition-all",
                      active
                        ? "bg-[#ff812c]/10 text-[#ff812c]"
                        : "text-slate-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-slate-400"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", active && "text-[#ff812c]")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.href === "/usuarios" && pendingRequests > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#ff812c] text-white text-[11px] font-bold">
                        {pendingRequests}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:p-4 lg:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                    {profile.full_name || email}
                  </p>
                  <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                    {ROLE_LABELS[profile.role]}
                  </p>
                </div>
                <div className="shrink-0">
                  <ThemeToggle />
                </div>
              </div>
              <button
                onClick={signOut}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-800 py-3 text-[14px] font-medium text-slate-700 dark:text-slate-300 transition hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98]"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          </aside>

          {/* Main Content — `min-w-0` es lo que impide que una tabla ancha
              estire la columna entera en vez de desplazarse dentro de su
              tarjeta, y con ella toda la página. */}
          <main className="flex-1 min-w-0 md:ml-56 lg:ml-64 px-4 py-6 md:p-8 pb-nav md:pb-8 min-h-screen">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>

          {/* Mobile Bottom Tab Bar — va en la capa del armazón (30), no en la de
              los modales (50). Estaban las dos en 50 y, empatadas, mandaba el
              orden del DOM: la barra se dibuja después de <main>, así que tapaba
              los botones de cada hoja que sube desde abajo. Su alto sale de
              --atl-nav, el mismo que usan `pb-nav` y `bottom-nav`. */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-gray-200/60 dark:border-gray-800/60 pb-safe px-safe z-30">
            {/* Misma separación que en el header móvil: el fondo esmerilado
                no debe envolver nada position:fixed que se agregue aquí más
                adelante. */}
            <div className="absolute inset-0 -z-10 bg-[#FFFFFF]/80 dark:bg-[#2C2C2E]/80 backdrop-blur-xl" />
            <div className="flex items-center justify-start h-[var(--atl-nav)] px-2 overflow-x-auto overscroll-x-contain no-scrollbar gap-1">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    ref={active ? tabActiva : undefined}
                    className="flex flex-col items-center justify-center min-w-[72px] shrink-0 h-full space-y-1 active:scale-95 transition-transform"
                  >
                    <span className="relative">
                      <item.icon
                        className={cn(
                           "w-6 h-6",
                          active ? "text-[#ff812c]" : "text-slate-400 dark:text-slate-500"
                        )}
                      />
                      {item.href === "/usuarios" && pendingRequests > 0 && (
                        <span className="absolute -top-1 -right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff812c] text-white text-[10px] font-bold leading-none">
                          {pendingRequests}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "max-w-full truncate px-0.5 text-[10px] font-medium tracking-wide",
                        active ? "text-[#ff812c]" : "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
              
              <button
                onClick={signOut}
                className="flex flex-col items-center justify-center min-w-[72px] shrink-0 h-full space-y-1 active:scale-95 transition-transform"
              >
                <LogOut className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                <span className="text-[10px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
                  Salir
                </span>
              </button>
            </div>
          </nav>

          {/* Se asoma una sola vez, cuando el navegador dice que se puede
              instalar, y se calla dos semanas si la cierran. */}
          <InstalarApp />
      </div>
      </NotificationsProvider>
    </ProfileProvider>
  );
}
