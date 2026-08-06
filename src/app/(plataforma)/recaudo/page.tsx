"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Banknote, Landmark, Loader2, X, Wallet, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { Pill } from "@/components/StatusBadge";
import { FiltroActivo, Loading } from "@/components/ui";
import { SETTLEMENT_STATUS_LABELS } from "@/lib/constants";
import { formatCOP, formatDate } from "@/lib/utils";
import type { Guide, Settlement, SettlementStatus } from "@/lib/types";

const TONES: Record<SettlementStatus, "slate" | "blue" | "green" | "red"> = {
  pendiente: "slate",
  consignado: "blue",
  conciliado: "green",
  con_diferencia: "red",
};

export default function CollectionsPage() {
  return (
    <Suspense fallback={<Loading label="Cargando recaudo…" />}>
      <Collections />
    </Suspense>
  );
}

/** Las dos mitades de la pantalla, y cuál pide cada tarjeta de Mi panel. */
const VISTAS = {
  "sin-consignar": "Recaudos sin consignar",
  cierres: "Cierres de caja",
} as const;

type Vista = keyof typeof VISTAS;

function Collections() {
  const profile = useProfile();
  const isOps = ["admin", "coordinador"].includes(profile.role);
  const params = useSearchParams();
  const router = useRouter();

  /**
   * La tarjeta «Recaudo por consignar» abre esta pantalla mostrando solo esa
   * mitad: el número de la tarjeta es exactamente el de los recaudos sin
   * consignar, y aterrizar en las dos listas obliga a buscar cuál era.
   */
  const pedido = params.get("filtro");
  // Un valor que no reconozcamos no puede dejar la pantalla en blanco.
  const vista: Vista | null = pedido === "sin-consignar" || pedido === "cierres" ? pedido : null;
  const verSinConsignar = vista === null || vista === "sin-consignar";
  const verCierres = vista === null || vista === "cierres";
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [pendingCod, setPendingCod] = useState<Guide[] | null>(null);
  const [deposit, setDeposit] = useState<Settlement | null>(null);
  const [form, setForm] = useState({ amount: "", reference: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: s }, { data: cod }] = await Promise.all([
      supabase
        .from("at_settlements")
        .select("*, courier:at_profiles!at_settlements_courier_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name), courier:at_profiles!at_guides_courier_id_fkey(full_name)")
        .eq("is_cod", true)
        .eq("status", "entregada")
        .is("settlement_id", null)
        .order("delivered_at"),
    ]);
    setSettlements((s as Settlement[]) ?? []);
    setPendingCod((cod as Guide[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSettlement() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_create_settlement", {});
    setBusy(false);
    setMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: "Cierre de caja creado: consigna en Bancolombia y reporta el soporte." }
    );
    load();
  }

  async function reportDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!deposit) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_report_deposit", {
      p_settlement_id: deposit.id,
      p_amount: Number(form.amount),
      p_reference: form.reference,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else setMsg({ ok: true, text: "Consignación reportada para auditoría." });
    setDeposit(null);
    setForm({ amount: "", reference: "" });
    load();
  }

  async function reconcile(id: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_reconcile_settlement", {
      p_settlement_id: id,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    load();
  }

  const myPendingTotal = (pendingCod ?? [])
    .filter((g) => profile.role !== "mensajero" || g.courier_id === profile.id)
    .reduce((a, g) => a + g.cod_amount, 0);

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Recaudo y cierre</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400 max-w-lg">
            Fase 7: consignación diaria en Bancolombia y conciliación para auditoría
          </p>
        </div>
        
        {profile.role === "mensajero" && (
          <button
            onClick={createSettlement}
            disabled={busy || myPendingTotal === 0}
            className="min-h-[48px] px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 shrink-0"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
            <span>Cerrar mi caja ({formatCOP(myPendingTotal)})</span>
          </button>
        )}
      </div>

      {msg && (
        <div className={`rounded-2xl p-4 ${msg.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"}`}>
          <p className={`text-[14px] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            {msg.text}
          </p>
        </div>
      )}

      {vista && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
            Filtrado desde Mi panel:
          </span>
          <FiltroActivo
            label={VISTAS[vista]}
            onClear={() => router.replace("/recaudo", { scroll: false })}
          />
        </div>
      )}

      <div className={`grid gap-6 ${vista ? "" : "xl:grid-cols-2"}`}>
        {/* Pending Collections Card */}
        {verSinConsignar && (
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 text-[19px] font-bold text-slate-900 dark:text-white">Recaudos sin consignar</h2>
          <p className="mb-5 text-[14px] text-slate-500 dark:text-slate-400">
            Entregas contraentrega aún no incluidas en un cierre de caja
          </p>
          
          {pendingCod === null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px]">Cargando recaudos…</p>
            </div>
          ) : pendingCod.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Wallet className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">Todo el recaudo está consignado</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {pendingCod.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-3 px-2">
                  <div>
                    <p className="text-[16px] font-bold text-slate-900 dark:text-white">{g.guide_number}</p>
                    <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {g.courier?.full_name ?? "—"} · {g.at_clients?.business_name}
                    </p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-xl shrink-0">
                    <p className="font-bold text-[15px] text-amber-800 dark:text-amber-500">{formatCOP(g.cod_amount)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {/* Settlements Card */}
        {verCierres && (
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
            <div className="bg-[#ff812c]/10 dark:bg-[#ff812c]/20 p-2 rounded-xl text-[#ff812c]">
              <Landmark className="w-5 h-5" />
            </div>
            Cierres de caja
          </h2>
          <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400 pl-11">
            {isOps
              ? "Concilia las consignaciones reportadas por los mensajeros"
              : "Tus cierres: consigna y reporta la referencia bancaria"}
          </p>

          {settlements === null ? (
             <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
             <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
             <p className="text-[14px]">Cargando cierres…</p>
           </div>
          ) : settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">No hay cierres de caja</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {settlements.map((s) => (
                <li key={s.id} className="py-4 px-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-[16px] text-slate-900 dark:text-white">
                        {s.courier?.full_name ?? "Mensajero"}
                      </p>
                      <p className="text-[14px] text-slate-500 dark:text-slate-400">
                        {formatDate(s.settlement_date)}
                      </p>
                      <div className="text-[14px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                        <span><span className="font-medium">Esperado:</span> {formatCOP(s.expected_amount)}</span>
                        {s.deposited_amount != null && <span><span className="font-medium">Consignado:</span> {formatCOP(s.deposited_amount)}</span>}
                        {s.bank_reference && <span><span className="font-medium">Ref:</span> {s.bank_reference}</span>}
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:items-end gap-3 shrink-0">
                      <Pill label={SETTLEMENT_STATUS_LABELS[s.status]} tone={TONES[s.status]} />
                      
                      {s.status === "pendiente" && (profile.id === s.courier_id || isOps) && (
                        <button
                          onClick={() => {
                            setDeposit(s);
                            setForm({ amount: String(s.expected_amount), reference: "" });
                          }}
                          className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all w-full sm:w-auto"
                        >
                          Reportar consignación
                        </button>
                      )}
                      
                      {s.status === "consignado" && isOps && (
                        <button 
                          disabled={busy} 
                          onClick={() => reconcile(s.id)}
                          className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 w-full sm:w-auto"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Conciliar"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>

      {/* Action Modal (Apple HIG Style Bottom Sheet/Alert) */}
      {deposit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          {/* Con tope de alto y cuerpo desplazable: el mensajero lo abre en la
              calle, con el teclado tapando media pantalla, y «Reportar» tiene
              que seguir alcanzable. */}
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] w-full max-w-md max-h-[90dvh] flex flex-col rounded-[32px] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">

            <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white truncate">Reportar consignación</h3>
                <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">Esperados: <span className="font-bold text-amber-600 dark:text-amber-500">{formatCOP(deposit.expected_amount)}</span></p>
              </div>
              <button 
                onClick={() => setDeposit(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={reportDeposit} className="min-h-0 overflow-y-auto p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Valor consignado (COP)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Referencia / número de comprobante Bancolombia
                </label>
                <input
                  required
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Ej: 45789021"
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeposit(null)}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Reportar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
