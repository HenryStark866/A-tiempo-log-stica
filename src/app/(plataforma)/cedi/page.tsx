"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScanBarcode, Undo2, Loader2, Package, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { Guide } from "@/lib/types";

const ROLES_CEDI = ["admin", "coordinador", "operario"];

export default function CediPage() {
  const profile = useProfile();
  const [incoming, setIncoming] = useState<Guide[] | null>(null);
  const [returns, setReturns] = useState<Guide[] | null>(null);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ROLES_CEDI.includes(profile.role)) return;
    const supabase = createClient();
    const [{ data: inc }, { data: ret }] = await Promise.all([
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name)")
        .eq("status", "recogida")
        .order("picked_up_at"),
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name)")
        .eq("status", "novedad")
        .order("updated_at"),
    ]);
    setIncoming((inc as Guide[]) ?? []);
    setReturns((ret as Guide[]) ?? []);
  }, [profile.role]);

  useEffect(() => {
    load();
  }, [load]);

  async function receive(guideId: string, guideNumber: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: guideId,
      p_new_status: "en_cedi",
      p_note: "Escaneo de recepción en bodega",
    });
    setBusy(false);
    setMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: `${guideNumber} recibida en CEDI ✓` }
    );
    load();
  }

  async function receiveByScan(e: React.FormEvent) {
    e.preventDefault();
    const num = scan.trim().toUpperCase();
    if (!num) return;
    const g = (incoming ?? []).find((x) => x.guide_number.toUpperCase() === num);
    if (!g) {
      setMsg({ ok: false, text: `La guía ${num} no está en estado "recogida"` });
      return;
    }
    setScan("");
    await receive(g.id, g.guide_number);
  }

  async function processReturn(guideId: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_process_return", {
      p_guide_id: guideId,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      const g = data as Guide;
      setMsg({
        ok: true,
        text:
          g.status === "en_devolucion"
            ? `${g.guide_number}: 2do fallo → logística inversa`
            : `${g.guide_number}: reprogramada para nuevo despacho`,
      });
    }
    load();
  }

  // El CEDI es la bodega: recibir y despachar es del personal de operaciones.
  // Sin este corte, un comercio que escribiera la URL veía la pantalla (con
  // sus propias guías, por RLS), que no significa nada para él y confunde.
  if (!ROLES_CEDI.includes(profile.role)) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          CEDI
        </h1>
        <p className="mt-6 text-[15px] text-slate-500 dark:text-slate-400">
          Esta sección es del personal del centro de distribución.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">CEDI — Centro de Distribución</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Fase 2.1: validación de entrada a bodega · Fases 8-9: retorno de novedades
        </p>
      </div>

      {msg && (
        <div className={`rounded-2xl p-4 ${msg.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"}`}>
          <p className={`text-[14px] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            {msg.text}
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Reception Card */}
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
            <div className="bg-[#ff812c]/10 dark:bg-[#ff812c]/20 p-2 rounded-xl text-[#ff812c]">
              <ScanBarcode className="w-5 h-5" />
            </div>
            Recepción en bodega
          </h2>
          <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400 pl-11">
            Guías recogidas en comercio pendientes de escaneo de entrada
          </p>

          <form onSubmit={receiveByScan} className="mb-5 flex flex-col sm:flex-row gap-3">
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Escanea o digita la guía (ATL-…)"
              className="flex-1 min-h-[48px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-xl px-4 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
            />
            <button 
              type="submit" 
              disabled={busy}
              className="min-h-[48px] px-6 rounded-xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center shrink-0"
            >
              {busy && scan ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Recibir
            </button>
          </form>

          {incoming === null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px]">Cargando pendientes…</p>
            </div>
          ) : incoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">No hay guías pendientes de ingreso</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {incoming.map((g) => (
                <li key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-2">
                  <div>
                    <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
                      {g.guide_number}
                    </Link>
                    <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">
                      {g.at_clients?.business_name} · recogida {formatDateTime(g.picked_up_at)}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => receive(g.id, g.guide_number)}
                    className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all self-start sm:self-auto shrink-0"
                  >
                    Recibir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Returns / Novedades Card */}
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
            <div className="bg-amber-50 dark:bg-amber-500/10 p-2 rounded-xl text-amber-500">
              <Undo2 className="w-5 h-5" />
            </div>
            Retorno de novedades
          </h2>
          <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400 pl-11">
            El sistema evalúa reintentos: 1er fallo reprograma, 2do fallo pasa a logística inversa
          </p>

          {returns === null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px]">Cargando novedades…</p>
            </div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <SearchX className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">No hay novedades por procesar</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {returns.map((g) => (
                <li key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-2">
                  <div className="flex flex-col gap-1.5">
                    <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
                      {g.guide_number}
                    </Link>
                    <p className="text-[14px] text-slate-600 dark:text-slate-400">
                      {g.at_clients?.business_name} · intento {g.delivery_attempts}/2
                    </p>
                    <div className="self-start mt-1">
                      <StatusBadge status={g.status} />
                    </div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => processReturn(g.id)}
                    className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all self-start sm:self-auto shrink-0"
                  >
                    Procesar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
