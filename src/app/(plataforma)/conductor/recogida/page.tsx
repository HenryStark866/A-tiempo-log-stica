"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { formatCOP } from "@/lib/utils";

interface PickupGuide {
  id: string;
  guide_number: string;
  recipient_name: string;
  recipient_city: string;
  is_cod: boolean;
  cod_amount: number;
}

interface Pickup {
  pickup_id: string;
  status: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  notes: string | null;
  business_name: string;
  business_phone: string | null;
  guias: PickupGuide[];
}

export default function CourierPickupPage() {
  const profile = useProfile();
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<string, Set<string>>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_my_pickups");
    if (error) setMsg({ ok: false, text: error.message });
    setPickups((data as Pickup[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function alternar(pickupId: string, guideId: string) {
    setMarcadas((m) => {
      const set = new Set(m[pickupId] ?? []);
      if (set.has(guideId)) set.delete(guideId);
      else set.add(guideId);
      return { ...m, [pickupId]: set };
    });
  }

  function marcarTodas(p: Pickup) {
    setMarcadas((m) => {
      const actual = m[p.pickup_id] ?? new Set<string>();
      const todas = actual.size === p.guias.length;
      return {
        ...m,
        [p.pickup_id]: todas ? new Set() : new Set(p.guias.map((g) => g.id)),
      };
    });
  }

  async function confirmar(p: Pickup) {
    const ids = Array.from(marcadas[p.pickup_id] ?? []);
    if (ids.length === 0) return;
    setBusy(p.pickup_id);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_confirm_pickup", {
      p_pickup_id: p.pickup_id,
      p_guide_ids: ids,
      p_note: nota[p.pickup_id] || null,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      const r = data as { recogidas: number; faltantes: number; comercio: string };
      setMsg({
        ok: true,
        text:
          `${r.recogidas} paquete(s) recogidos en ${r.comercio}. El CEDI ya sabe que vas en camino.` +
          (r.faltantes > 0
            ? ` ${r.faltantes} quedaron sin recoger y el comercio puede volver a pedirlos.`
            : ""),
      });
    }
    load();
  }

  if (!["mensajero", "admin", "coordinador", "operario"].includes(profile.role)) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Recogidas</h1>
        <p className="mt-6 text-slate-500">Esta sección es para mensajeros.</p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Mis recogidas
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Marca cada paquete que recibas. Lo que no marques queda libre para que el comercio
          vuelva a pedirlo.
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

      {pickups === null ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF] py-16 text-slate-500 shadow-sm dark:bg-[#2C2C2E] dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin text-[#ff812c]" />
          <p className="text-[15px]">Cargando tus recogidas…</p>
        </div>
      ) : pickups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF] py-16 shadow-sm dark:bg-[#2C2C2E]">
          <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-[16px] text-slate-500 dark:text-slate-400">
            No tienes recogidas asignadas ahora mismo
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pickups.map((p) => {
            const set = marcadas[p.pickup_id] ?? new Set<string>();
            const completo = p.guias.length > 0 && set.size === p.guias.length;
            const faltan = p.guias.length - set.size;

            return (
              <section
                key={p.pickup_id}
                className="overflow-hidden rounded-3xl bg-[#FFFFFF] shadow-sm dark:bg-[#2C2C2E]"
              >
                <div className="border-b border-gray-100 p-5 dark:border-gray-800">
                  <p className="text-[19px] font-bold text-slate-900 dark:text-white">
                    {p.business_name}
                  </p>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      p.address
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-start gap-2 text-[15px] text-[#ff812c] active:opacity-70"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="underline-offset-2 hover:underline">{p.address}</span>
                  </a>

                  {(p.contact_phone || p.business_phone) && (
                    <a
                      href={`tel:${p.contact_phone ?? p.business_phone}`}
                      className="mt-1.5 flex items-center gap-2 text-[15px] text-slate-600 dark:text-slate-300"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                      {p.contact_name ? `${p.contact_name} · ` : ""}
                      {p.contact_phone ?? p.business_phone}
                    </a>
                  )}

                  {p.scheduled_time && (
                    <p className="mt-1.5 text-[14px] text-slate-500 dark:text-slate-400">
                      Programada para las {p.scheduled_time.slice(0, 5)}
                    </p>
                  )}
                  {p.notes && (
                    <p className="mt-2 rounded-xl bg-[#F2F2F7] px-3 py-2 text-[14px] text-slate-600 dark:bg-[#1C1C1E] dark:text-slate-300">
                      {p.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between px-5 py-3">
                  <p className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {set.size} de {p.guias.length} verificados
                  </p>
                  {p.guias.length > 0 && (
                    <button
                      onClick={() => marcarTodas(p)}
                      className="text-[14px] font-semibold text-[#ff812c] active:opacity-70"
                    >
                      {completo ? "Desmarcar todo" : "Marcar todo"}
                    </button>
                  )}
                </div>

                {p.guias.length === 0 ? (
                  <p className="px-5 pb-5 text-[15px] text-slate-500 dark:text-slate-400">
                    Esta recogida no tiene guías cargadas. Pídele al comercio que las cree antes
                    de entregarte los paquetes.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                    {p.guias.map((g) => {
                      const ok = set.has(g.id);
                      return (
                        <li key={g.id}>
                          <button
                            onClick={() => alternar(p.pickup_id, g.id)}
                            className={`flex w-full items-center gap-3 px-5 py-4 text-left transition-colors ${
                              ok ? "bg-emerald-50/60 dark:bg-emerald-500/10" : ""
                            }`}
                          >
                            {ok ? (
                              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
                            ) : (
                              <Circle className="h-7 w-7 shrink-0 text-slate-300 dark:text-slate-600" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[16px] font-bold text-slate-900 dark:text-white">
                                {g.guide_number}
                              </p>
                              <p className="truncate text-[14px] text-slate-500 dark:text-slate-400">
                                {g.recipient_name} · {g.recipient_city}
                              </p>
                            </div>
                            {g.is_cod && (
                              <span className="shrink-0 text-[14px] font-bold text-slate-900 dark:text-white">
                                {formatCOP(g.cod_amount)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="space-y-3 border-t border-gray-100 p-5 dark:border-gray-800">
                  {faltan > 0 && set.size > 0 && (
                    <p className="flex items-start gap-2 text-[14px] font-medium text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Vas a confirmar {set.size} y dejar {faltan} sin recoger. Esos vuelven a
                      quedar disponibles para el comercio.
                    </p>
                  )}

                  <input
                    value={nota[p.pickup_id] ?? ""}
                    onChange={(e) => setNota((n) => ({ ...n, [p.pickup_id]: e.target.value }))}
                    placeholder="Observación (opcional): caja mojada, faltó una…"
                    className="w-full min-h-[48px] rounded-xl border border-transparent bg-[#F2F2F7] px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#ff812c] focus:outline-none focus:ring-1 focus:ring-[#ff812c] dark:border-slate-700 dark:bg-[#1C1C1E] dark:text-white"
                  />

                  <button
                    onClick={() => confirmar(p)}
                    disabled={set.size === 0 || busy === p.pickup_id}
                    className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                  >
                    {busy === p.pickup_id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <PackageCheck className="h-5 w-5" />
                    )}
                    {set.size === 0
                      ? "Marca los paquetes que recibiste"
                      : `Confirmar recogida de ${set.size} paquete(s)`}
                  </button>

                  <p className="text-center text-[13px] text-slate-400 dark:text-slate-500">
                    Al confirmar, el CEDI recibe el aviso de que vas en camino.
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[14px] text-slate-500 dark:text-slate-400">
        ¿Ya estás en ruta de entrega?{" "}
        <Link href="/entregas" className="font-semibold text-[#ff812c] hover:underline">
          Ver mi ruta
        </Link>
      </p>
    </div>
  );
}
