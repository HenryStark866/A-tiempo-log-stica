"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  MapPinOff,
  Package,
  Send,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCOP } from "@/lib/utils";
import type { Guide } from "@/lib/types";

interface BoardGuide {
  id: string;
  guide_number: string;
  recipient_name: string;
  recipient_address: string;
  recipient_city: string;
  is_cod?: boolean;
  cod_amount?: number;
  business_name: string;
}

interface BoardZone {
  zone_id: string;
  zone_name: string;
  sort_order: number;
  pendientes: number;
  guias: BoardGuide[];
}

interface BoardCourier {
  id: string;
  full_name: string;
  courier_type: string | null;
  zone_id: string | null;
  zone_name: string | null;
  max_capacity: number;
  carga_actual: number;
}

interface Board {
  zonas: BoardZone[];
  sin_zona: BoardGuide[];
  mensajeros: BoardCourier[];
}

export default function RoutingPage() {
  const profile = useProfile();
  const [board, setBoard] = useState<Board | null>(null);
  const [active, setActive] = useState<Guide[] | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: b, error }, { data: act }] = await Promise.all([
      supabase.rpc("at_cedi_board"),
      supabase
        .from("at_guides")
        .select(
          "*, at_clients(business_name), at_zones(name), courier:at_profiles!at_guides_courier_id_fkey(full_name)"
        )
        .in("status", ["zonificada", "en_ruta"])
        .order("updated_at", { ascending: false }),
    ]);
    if (error) setMsg({ ok: false, text: error.message });
    setBoard((b as Board) ?? { zonas: [], sin_zona: [], mensajeros: [] });
    setActive((act as Guide[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function despachar(zone: BoardZone) {
    const courierId = sel[zone.zone_id];
    if (!courierId) return;
    setBusy(zone.zone_id);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_assign_zone_batch", {
      p_zone_id: zone.zone_id,
      p_courier_id: courierId,
      p_limit: null,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      const r = data as { asignadas: number; restantes: number; mensajero: string };
      setMsg({
        ok: true,
        text:
          `${r.asignadas} guía(s) de ${zone.zone_name} asignadas a ${r.mensajero}` +
          (r.restantes > 0
            ? ` · quedan ${r.restantes} sin despachar, no le alcanzó el cupo`
            : ""),
      });
    }
    load();
  }

  if (!["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role)) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Ruteo</h1>
        <p className="mt-6 text-slate-500">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  const totalPendientes =
    (board?.zonas.reduce((n, z) => n + Number(z.pendientes), 0) ?? 0) +
    (board?.sin_zona.length ?? 0);

  return (
    <div className="pb-10 space-y-6 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Ruteo
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          La zona se asigna sola al recibir en bodega. Aquí solo despachas el lote de cada zona.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-2xl p-4 ${
            msg.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"
          }`}
        >
          <p
            className={`text-[14px] font-medium ${
              msg.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {msg.text}
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold text-slate-800 dark:text-white">
          Por despachar{" "}
          <span className="font-normal text-slate-500 dark:text-slate-400">
            ({board ? totalPendientes : "…"})
          </span>
        </h2>

        {board === null ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF] py-16 text-slate-500 shadow-sm dark:bg-[#2C2C2E] dark:text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#ff812c] border-t-transparent" />
            <p className="text-[15px]">Cargando tablero…</p>
          </div>
        ) : board.zonas.length === 0 && board.sin_zona.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF] py-16 shadow-sm dark:bg-[#2C2C2E]">
            <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">
              Todo despachado. No hay guías esperando en el CEDI.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {board.zonas.map((z) => {
              const elegido = board.mensajeros.find((m) => m.id === sel[z.zone_id]);
              const cupo = elegido
                ? Math.max(elegido.max_capacity - elegido.carga_actual, 0)
                : null;
              const faltaCupo = cupo !== null && cupo < Number(z.pendientes);
              const expandida = abierta === z.zone_id;

              return (
                <div
                  key={z.zone_id}
                  className="overflow-hidden rounded-3xl bg-[#FFFFFF] shadow-sm dark:bg-[#2C2C2E]"
                >
                  <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      onClick={() => setAbierta(expandida ? null : z.zone_id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff812c]/10 text-[19px] font-bold text-[#ff812c]">
                        {z.pendientes}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-bold text-slate-900 dark:text-white">
                          {z.zone_name}
                        </p>
                        <p className="text-[14px] text-slate-500 dark:text-slate-400">
                          {z.pendientes} paquete{Number(z.pendientes) > 1 ? "s" : ""} ·{" "}
                          {expandida ? "ocultar" : "ver detalle"}
                        </p>
                      </div>
                      <ChevronDown
                        className={`ml-auto size-5 shrink-0 text-slate-400 transition-transform ${
                          expandida ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={sel[z.zone_id] ?? ""}
                        onChange={(e) =>
                          setSel((s) => ({ ...s, [z.zone_id]: e.target.value }))
                        }
                        className="min-h-[48px] rounded-xl border border-transparent bg-[#F2F2F7] px-4 text-[15px] text-slate-900 focus:border-[#ff812c] focus:outline-none focus:ring-1 focus:ring-[#ff812c] dark:border-slate-700 dark:bg-[#1C1C1E] dark:text-white sm:min-w-[230px]"
                      >
                        <option value="">Elegir mensajero…</option>
                        {/* Los de esta zona primero: es a quien se le despacha
                            normalmente, y evita buscarlo en la lista. */}
                        {[...board.mensajeros]
                          .sort((a, b) => {
                            const az = a.zone_id === z.zone_id ? 0 : 1;
                            const bz = b.zone_id === z.zone_id ? 0 : 1;
                            return az - bz || a.full_name.localeCompare(b.full_name);
                          })
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name}
                              {m.zone_id === z.zone_id ? " ★" : ""} · {m.carga_actual}/
                              {m.max_capacity}
                            </option>
                          ))}
                      </select>

                      <button
                        disabled={!sel[z.zone_id] || busy === z.zone_id}
                        onClick={() => despachar(z)}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#ff812c] px-5 font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                      >
                        {busy === z.zone_id ? (
                          <div className="size-5 animate-spin rounded-full border-2 border-[#1C1C1E] border-t-transparent" />
                        ) : (
                          <Send className="size-5" />
                        )}
                        Despachar
                      </button>
                    </div>
                  </div>

                  {faltaCupo && (
                    <p className="flex items-start gap-2 border-t border-gray-100 px-5 py-3 text-[13px] font-medium text-amber-600 dark:border-gray-800 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      A {elegido!.full_name} solo le caben {cupo} más. Se le asignarán esas y
                      quedarán {Number(z.pendientes) - cupo!} para otro mensajero.
                    </p>
                  )}

                  {expandida && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                      {z.guias.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0">
                            <Link
                              href={`/pedidos/${g.id}`}
                              className="text-[15px] font-semibold text-[#ff812c] hover:underline"
                            >
                              {g.guide_number}
                            </Link>
                            <p className="truncate text-[14px] text-slate-500 dark:text-slate-400">
                              {g.recipient_name} · {g.recipient_address}
                            </p>
                          </div>
                          {g.is_cod && (
                            <span className="shrink-0 text-[14px] font-bold text-slate-900 dark:text-white">
                              {formatCOP(g.cod_amount ?? 0)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            {/* Sin zona: no se pueden despachar en lote porque no se sabe a qué
                grupo pertenecen. Alguien tiene que abrir cada una y corregir la
                dirección o elegirle zona a mano. */}
            {board.sin_zona.length > 0 && (
              <div className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex items-start gap-3 p-5">
                  <MapPinOff className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-[17px] font-bold text-amber-800 dark:text-amber-300">
                      {board.sin_zona.length} sin zona reconocida
                    </p>
                    <p className="text-[14px] text-amber-700 dark:text-amber-400">
                      No se pudo deducir la zona por la dirección, así que no entran en ningún
                      lote. Ábrelas y corrige la dirección o asígnales zona a mano.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-amber-200/60 border-t border-amber-200/60 dark:divide-amber-500/20 dark:border-amber-500/20">
                  {board.sin_zona.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/pedidos/${g.id}`}
                          className="text-[15px] font-semibold text-[#ff812c] hover:underline"
                        >
                          {g.guide_number}
                        </Link>
                        <p className="truncate text-[14px] text-amber-800 dark:text-amber-400">
                          {g.recipient_address} · {g.recipient_city}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold text-slate-800 dark:text-white">
          En operación{" "}
          <span className="font-normal text-slate-500 dark:text-slate-400">
            ({active?.length ?? "…"})
          </span>
        </h2>
        <div className="overflow-hidden rounded-3xl bg-[#FFFFFF] shadow-sm dark:bg-[#2C2C2E]">
          {active === null ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-500 dark:text-slate-400">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#ff812c] border-t-transparent" />
              <p className="text-[15px]">Cargando operaciones…</p>
            </div>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Truck className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[16px] text-slate-500 dark:text-slate-400">
                No hay guías zonificadas o en ruta
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {active.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/pedidos/${g.id}`}
                      className="text-[16px] font-bold text-slate-900 hover:underline dark:text-white"
                    >
                      {g.guide_number}
                    </Link>
                    <p className="mt-1 truncate text-[14px] text-slate-500 dark:text-slate-300">
                      {g.courier?.full_name ?? "—"} · {g.at_zones?.name ?? "sin zona"} ·{" "}
                      {g.at_clients?.business_name}
                    </p>
                  </div>
                  <div className="self-start sm:self-auto">
                    <StatusBadge status={g.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
