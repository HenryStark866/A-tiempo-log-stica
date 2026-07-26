"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Contact,
  Hourglass,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Package,
  PackageOpen,
  Radio,
  Receipt,
  Route,
  Clock,
  Store,
  Tag,
  Users,
  Warehouse,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileProvider } from "@/components/ProfileContext";
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

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "coordinador", "operario", "mensajero", "cliente"] },
  { href: "/guias", label: "Guías", icon: Package, roles: ["admin", "coordinador", "operario", "cliente"] },
  { href: "/recogidas", label: "Recogidas", icon: PackageOpen, roles: ["admin", "coordinador", "operario", "cliente"] },
  { href: "/cedi", label: "CEDI", icon: Warehouse, roles: ["admin", "coordinador", "operario"] },
  { href: "/rutas", label: "Ruteo", icon: Route, roles: ["admin", "coordinador", "operario", "mensajero"] },
  { href: "/novedades", label: "Novedades", icon: AlertTriangle, roles: ["admin", "coordinador", "operario"] },
  { href: "/seguimiento", label: "Seguimiento", icon: Radio, roles: ["cliente", "admin", "coordinador"] },
  { href: "/destinatarios", label: "Clientes", icon: Contact, roles: ["cliente"] },
  { href: "/productos", label: "Productos", icon: Tag, roles: ["cliente"] },
  { href: "/mi-comercio", label: "Mi comercio", icon: Store, roles: ["cliente"] },
  { href: "/entregas", label: "Mi ruta", icon: MapPinned, roles: ["mensajero"] },
  { href: "/recaudo", label: "Recaudo", icon: Banknote, roles: ["admin", "coordinador", "mensajero"] },
  { href: "/facturacion", label: "Facturación", icon: Receipt, roles: ["admin", "coordinador", "cliente"] },
  { href: "/clientes", label: "Clientes", icon: Building2, roles: ["admin", "coordinador", "mensajero"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
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
      <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-900 dark:text-slate-100 transition-colors duration-300 flex flex-col md:flex-row font-sans">
          
          {/* Top Header (Mobile Only) */}
          <header className="md:hidden flex items-center justify-between px-6 py-4 bg-[#FFFFFF]/80 dark:bg-[#2C2C2E]/80 backdrop-blur-xl sticky top-0 z-40 border-b border-gray-200/60 dark:border-gray-800/60">
            <Link href={profile.role === 'mensajero' ? '/entregas' : '/dashboard'} className="flex items-center gap-2">
              <Logo className="scale-[0.8] origin-left" />
            </Link>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>

          {/* Desktop Left Sidebar */}
          <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 bg-[#FFFFFF] dark:bg-[#2C2C2E] border-r border-gray-200 dark:border-gray-800 z-50 transition-colors duration-300">
            <div className="p-6 flex items-center justify-between">
              <Link href={profile.role === 'mensajero' ? '/entregas' : '/dashboard'} className="flex items-center gap-2">
                <Logo className="scale-90 origin-left" />
              </Link>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <ThemeToggle />
              </div>
            </div>

            <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto no-scrollbar">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition-all",
                      active
                        ? "bg-[#ff812c]/10 text-[#ff812c]"
                        : "text-slate-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-slate-400"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", active && "text-[#ff812c]")} />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/usuarios" && pendingRequests > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#ff812c] text-white text-[11px] font-bold">
                        {pendingRequests}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between px-2 mb-4">
                <div className="overflow-hidden">
                  <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                    {profile.full_name || email}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    {ROLE_LABELS[profile.role]}
                  </p>
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

          {/* Main Content */}
          <main className="flex-1 md:ml-64 px-4 py-6 md:p-8 pb-24 md:pb-8 w-full min-h-screen">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>

          {/* Mobile Bottom Tab Bar */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#FFFFFF]/80 dark:bg-[#2C2C2E]/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 pb-safe z-50">
            <div className="flex items-center justify-start h-[68px] px-2 overflow-x-auto no-scrollbar gap-2">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center justify-center min-w-[72px] h-full space-y-1 active:scale-95 transition-transform"
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
                        "text-[10px] font-medium tracking-wide",
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
                className="flex flex-col items-center justify-center min-w-[72px] h-full space-y-1 active:scale-95 transition-transform"
              >
                <LogOut className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                <span className="text-[10px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
                  Salir
                </span>
              </button>
            </div>
          </nav>
      </div>
    </ProfileProvider>
  );
}
