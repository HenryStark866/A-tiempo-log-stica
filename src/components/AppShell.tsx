"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Building2,
  Hourglass,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Package,
  PackageOpen,
  Receipt,
  Route,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ProfileProvider } from "@/components/ProfileContext";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
  { href: "/rutas", label: "Ruteo", icon: Route, roles: ["admin", "coordinador", "operario"] },
  { href: "/entregas", label: "Mi ruta", icon: MapPinned, roles: ["mensajero"] },
  { href: "/recaudo", label: "Recaudo", icon: Banknote, roles: ["admin", "coordinador", "mensajero"] },
  { href: "/facturacion", label: "Facturación", icon: Receipt, roles: ["admin", "coordinador", "cliente"] },
  { href: "/clientes", label: "Clientes", icon: Building2, roles: ["admin", "coordinador"] },
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
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (profile.role === "pendiente" || !profile.active) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Hourglass className="mx-auto mb-4 size-10 text-brand-500" />
          <h1 className="text-lg font-bold text-navy-900">
            Cuenta pendiente de activación
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tu cuenta <strong>{email}</strong> fue creada, pero un administrador
            de A Tiempo Logística debe asignarte un rol antes de que puedas
            operar en la plataforma.
          </p>
          <button
            onClick={signOut}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(profile.role));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-5">
        <Logo dark />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">
          {profile.full_name || email}
        </p>
        <p className="mb-3 text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/20"
        >
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <ProfileProvider profile={profile}>
      <div className="min-h-screen bg-slate-50">
        {/* Sidebar escritorio */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy-950 lg:block">
          {sidebar}
        </aside>

        {/* Sidebar móvil */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 bg-navy-950 shadow-2xl">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-1 text-slate-300 hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        {/* Barra superior móvil */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="size-5" />
          </button>
          <span className="flex items-center gap-2 font-bold text-navy-900">
            <Truck className="size-5 text-brand-500" /> A Tiempo Logística
          </span>
        </header>

        <main className="px-4 py-6 lg:ml-64 lg:px-8 lg:py-8">{children}</main>
      </div>
    </ProfileProvider>
  );
}
