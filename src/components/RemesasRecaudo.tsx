"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Banknote, Check, Loader2, Send, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCOP, formatDate, formatDateTime } from "@/lib/utils";
import type { Client, CodRemittance, RecaudoPorGirar } from "@/lib/types";

/**
 * El tercer tramo de la plata: lo que ATL le devuelve al comercio de lo que
 * recaudó en su nombre.
 *
 * Se muestra desglosado a propósito —bruto, lo que era nuestro, el cruce
 * contra su factura, el neto— porque un solo número al final es imposible de
 * auditar y es justo donde un comercio desconfía.
 *
 * Solo entra a la remesa el recaudo que el mensajero ya consignó y quedó
 * conciliado: girar plata que todavía no nos entró sería prestarla sin saberlo.
 */
export function RemesasRecaudo() {
  const [clientes, setClientes] = useState<Client[]>([]);
  const [remesas, setRemesas] = useState<CodRemittance[] | null>(null);
  const [porGirar, setPorGirar] = useState<Record<string, RecaudoPorGirar>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [girando, setGirando] = useState<CodRemittance | null>(null);
  const [pago, setPago] = useState({ referencia: "", metodo: "Transferencia" });

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [{ data: cs }, { data: rs }] = await Promise.all([
      supabase.from("at_clients").select("*").eq("active", true).order("business_name"),
      supabase
        .from("at_cod_remittances")
        .select("*, at_clients(business_name)")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const lista = (cs as Client[]) ?? [];
    setClientes(lista);
    setRemesas((rs as CodRemittance[]) ?? []);

    // Cuánto hay listo por comercio. Se pregunta uno por uno porque cada
    // respuesta ya viene con su desglose armado desde la base.
    const pendientes: Record<string, RecaudoPorGirar> = {};
    await Promise.all(
      lista.map(async (c) => {
        const { data } = await supabase.rpc("at_recaudo_por_girar", { p_client_id: c.id });
        const r = data as RecaudoPorGirar | null;
        if (r && Number(r.guias) > 0) pendientes[c.id] = r;
      })
    );
    setPorGirar(pendientes);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function generar(clienteId: string) {
    setBusy(clienteId);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_generate_cod_remittance", {
      p_client_id: clienteId,
      p_period_start: null,
      p_period_end: null,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    const r = data as CodRemittance;
    setMsg({
      ok: true,
      text:
        `${r.remittance_number}: recaudamos ${formatCOP(r.gross_amount)}` +
        (Number(r.invoice_offset) > 0
          ? `, cruzamos ${formatCOP(r.invoice_offset)} contra sus fletes`
          : "") +
        `. Queda por girar ${formatCOP(r.net_amount)}.`,
    });
    cargar();
  }

  async function marcarGirada() {
    if (!girando) return;
    setBusy(girando.id);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_pay_cod_remittance", {
      p_remittance_id: girando.id,
      p_reference: pago.referencia || null,
      p_method: pago.metodo || null,
      p_receipt_path: null,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({ ok: true, text: `${girando.remittance_number} marcada como girada.` });
    setGirando(null);
    setPago({ referencia: "", metodo: "Transferencia" });
    cargar();
  }

  const conRecaudo = clientes.filter((c) => porGirar[c.id]);

  return (
    <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
      <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
        <div className="rounded-xl bg-[#ff812c]/10 p-2 text-[#ff812c] dark:bg-[#ff812c]/20">
          <Send className="h-5 w-5" />
        </div>
        Recaudo por girar a los comercios
      </h2>
      <p className="mb-5 mt-1 pl-11 text-[14px] text-slate-500 dark:text-slate-400">
        La plata del contraentrega que ya nos entró y le pertenece al comercio
      </p>

      {msg && (
        <div
          className={`mb-4 rounded-2xl p-4 ${
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

      {/* Listo para girar */}
      {conRecaudo.length > 0 && (
        <ul className="mb-6 space-y-3">
          {conRecaudo.map((c) => {
            const r = porGirar[c.id];
            const cruce = Math.min(Number(r.disponible), Number(r.deuda_fletes));
            const neto = Number(r.disponible) - cruce;
            return (
              <li
                key={c.id}
                className="rounded-2xl border border-[#ff812c]/30 bg-[#ff812c]/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold text-slate-900 dark:text-white">
                      {c.business_name}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {r.guias} entrega(s) contraentrega ya conciliadas
                    </p>
                  </div>
                  <button
                    onClick={() => generar(c.id)}
                    disabled={busy === c.id}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#ff812c] px-4 text-[14px] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4" />
                    )}
                    Generar giro
                  </button>
                </div>

                {/* El desglose. Es lo que hace auditable el número final. */}
                <dl className="mt-3 space-y-1 border-t border-[#ff812c]/20 pt-3 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Recaudo bruto</dt>
                    <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCOP(r.bruto)}
                    </dd>
                  </div>
                  {Number(r.flete_nuestro) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">
                        − Domicilio cobrado al comprador
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCOP(r.flete_nuestro)}
                      </dd>
                    </div>
                  )}
                  {cruce > 0 && (
                    <div className="flex justify-between">
                      <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <ArrowRightLeft className="h-3 w-3" /> − Cruce con sus fletes pendientes
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCOP(cruce)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[#ff812c]/20 pt-1">
                    <dt className="font-bold text-slate-900 dark:text-white">Neto a girar</dt>
                    <dd className="text-[15px] font-bold tabular-nums text-[#ff812c]">
                      {formatCOP(neto)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {/* Historial */}
      {remesas === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#ff812c]" />
        </div>
      ) : remesas.length === 0 && conRecaudo.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Wallet className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-center text-[15px] text-slate-500 dark:text-slate-400">
            No hay recaudo por girar. Aparece aquí cuando el mensajero consigna y el cierre queda
            conciliado.
          </p>
        </div>
      ) : (
        remesas.length > 0 && (
          <ul className="-mx-2 divide-y divide-gray-100 dark:divide-gray-800">
            {remesas.map((r) => (
              <li key={r.id} className="px-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                      {r.at_clients?.business_name ?? "Comercio"}
                      <span className="ml-2 text-[13px] font-normal text-slate-400">
                        {r.remittance_number}
                      </span>
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {r.guide_count} entrega(s) · {formatDate(r.period_start)} —{" "}
                      {formatDate(r.period_end)}
                    </p>
                    <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                      Bruto {formatCOP(r.gross_amount)}
                      {Number(r.shipping_kept) > 0 && ` · nuestro ${formatCOP(r.shipping_kept)}`}
                      {Number(r.invoice_offset) > 0 && ` · cruce ${formatCOP(r.invoice_offset)}`}
                    </p>
                    {r.paid_at && (
                      <p className="mt-0.5 text-[12px] text-emerald-600 dark:text-emerald-400">
                        Girado {formatDateTime(r.paid_at)}
                        {r.reference ? ` · Ref: ${r.reference}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="text-[17px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatCOP(r.net_amount)}
                    </p>
                    {r.status === "pendiente" ? (
                      <button
                        onClick={() => { setGirando(r); setPago({ referencia: "", metodo: "Transferencia" }); }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#F2F2F7] px-3 text-[13px] font-semibold text-slate-700 dark:bg-[#1C1C1E] dark:text-slate-300"
                      >
                        Marcar girada
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Girada
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {/* Marcar como girada */}
      {girando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setGirando(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#FFFFFF] p-5 shadow-2xl dark:bg-[#2C2C2E]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
              Girar {formatCOP(girando.net_amount)}
            </h3>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              {girando.at_clients?.business_name} · {girando.remittance_number}
            </p>

            <div className="mt-4 space-y-3">
              <select
                value={pago.metodo}
                onChange={(e) => setPago((p) => ({ ...p, metodo: e.target.value }))}
                className="w-full min-h-[48px] rounded-2xl bg-[#F2F2F7] px-4 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#ff812c] dark:bg-[#1C1C1E] dark:text-white"
              >
                {["Transferencia", "Nequi", "Daviplata", "Consignación", "Efectivo"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                value={pago.referencia}
                onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))}
                placeholder="Referencia del giro (opcional)"
                className="w-full min-h-[48px] rounded-2xl bg-[#F2F2F7] px-4 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#ff812c] dark:bg-[#1C1C1E] dark:text-white"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setGirando(null)}
                className="flex-1 min-h-[46px] rounded-xl bg-gray-100 font-semibold text-slate-700 dark:bg-gray-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={marcarGirada}
                disabled={busy === girando.id}
                className="flex-1 min-h-[46px] rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] disabled:opacity-60"
              >
                {busy === girando.id ? "Guardando…" : "Confirmar giro"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
