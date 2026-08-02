"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { Pill } from "@/components/StatusBadge";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatCOP, formatDate } from "@/lib/utils";
import type { Client, Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";

const TONES: Record<InvoiceStatus, "slate" | "blue" | "green" | "red"> = {
  borrador: "slate",
  emitida: "blue",
  pagada: "green",
  anulada: "red",
};

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function BillingPage() {
  const profile = useProfile();
  const isOps = ["admin", "coordinador"].includes(profile.role);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<{ invoice: Invoice; items: InvoiceItem[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    period_start: firstOfMonth(),
    period_end: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_invoices")
      .select("*, at_clients(business_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setInvoices((data as Invoice[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        setForm((f) => ({ ...f, client_id: list[0]?.id ?? "" }));
      });
  }, [load]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_generate_invoice", {
      p_client_id: form.client_id,
      p_period_start: form.period_start,
      p_period_end: form.period_end,
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    const inv = data as Invoice;
    setMsg({ ok: true, text: `Factura ${inv.invoice_number} generada por ${formatCOP(inv.total)}` });
    setShowNew(false);
    load();
  }

  async function openDetail(inv: Invoice) {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_invoice_items")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("description");
    setDetail({ invoice: inv, items: (data as InvoiceItem[]) ?? [] });
  }

  async function setStatus(inv: Invoice, status: InvoiceStatus) {
    const supabase = createClient();
    await supabase
      .from("at_invoices")
      .update({
        status,
        issued_at: status === "emitida" ? new Date().toISOString() : inv.issued_at,
        paid_at: status === "pagada" ? new Date().toISOString() : inv.paid_at,
      })
      .eq("id", inv.id);
    load();
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Facturación</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Cierre operativo: cortes quincenales o mensuales por cliente e-commerce
          </p>
        </div>
        {isOps && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl px-4 min-h-[44px] shadow-sm"
          >
            <FilePlus2 className="w-4 h-4 text-[#1C1C1E]" />
            <span className="text-[15px]">Generar factura</span>
          </button>
        )}
      </div>

      {/* Status Message Banner */}
      {msg && (
        <div
          className={`rounded-2xl px-4 py-3 text-[14px] font-medium transition-all ${
            msg.ok
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Invoices List */}
      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
        {invoices === null ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[15px]">Cargando facturas…</p>
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Receipt className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay facturas generadas</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Factura</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Periodo</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                    {isOps && <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openDetail(inv)}
                          className="text-[15px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity"
                        >
                          {inv.invoice_number}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-[15px] text-slate-600 dark:text-slate-400">
                        {inv.at_clients?.business_name}
                      </td>
                      <td className="px-5 py-3.5 text-[14px] text-slate-500 dark:text-slate-400">
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                      </td>
                      <td className="px-5 py-3.5 text-[15px] font-bold text-slate-900 dark:text-white">
                        {formatCOP(inv.total)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill label={INVOICE_STATUS_LABELS[inv.status]} tone={TONES[inv.status]} />
                      </td>
                      {isOps && (
                        <td className="px-5 py-3.5 text-right">
                          {inv.status === "borrador" && (
                            <button
                              onClick={() => setStatus(inv, "emitida")}
                              className="text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                            >
                              Emitir
                            </button>
                          )}
                          {inv.status === "emitida" && (
                            <button
                              onClick={() => setStatus(inv, "pagada")}
                              className="text-[14px] font-semibold text-[#1C1C1E] bg-[#ff812c] hover:bg-[#ff812c]/90 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                            >
                              Marcar pagada
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {invoices.map((inv) => (
                <div key={inv.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => openDetail(inv)}
                      className="text-[16px] font-bold text-[#ff812c] hover:underline"
                    >
                      {inv.invoice_number}
                    </button>
                    <Pill label={INVOICE_STATUS_LABELS[inv.status]} tone={TONES[inv.status]} />
                  </div>
                  <p className="text-[14px] text-slate-600 dark:text-slate-400">{inv.at_clients?.business_name}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">
                      {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                    </p>
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white">{formatCOP(inv.total)}</p>
                  </div>
                  {isOps && (
                    <div className="flex gap-2 pt-1">
                      {inv.status === "borrador" && (
                        <button
                          onClick={() => setStatus(inv, "emitida")}
                          className="flex-1 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-gray-700 min-h-[40px] rounded-xl active:scale-95 transition-transform"
                        >
                          Emitir
                        </button>
                      )}
                      {inv.status === "emitida" && (
                        <button
                          onClick={() => setStatus(inv, "pagada")}
                          className="flex-1 text-[14px] font-semibold text-[#1C1C1E] bg-[#ff812c] min-h-[40px] rounded-xl active:scale-95 transition-transform"
                        >
                          Marcar pagada
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Generate Invoice Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowNew(false)}>
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Generar factura del periodo</h2>
              <button
                onClick={() => setShowNew(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 active:opacity-70 transition-opacity text-lg leading-none"
              >
                ×
              </button>
            </div>
            {/* Desplaza: en un teléfono bajo, o con el teclado abierto sobre el
                selector de fechas, «Generar» se salía por debajo. */}
            <form onSubmit={generate} className="min-h-0 overflow-y-auto p-5 space-y-5">
              <section>
                <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Cliente</h3>
                <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                    <select
                      required
                      value={form.client_id}
                      onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                      className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.business_name} ({c.billing_cycle})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Periodo</h3>
                <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                    <label className="w-[60px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Desde</label>
                    <input
                      type="date"
                      required
                      value={form.period_start}
                      onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                      className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                    <label className="w-[60px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Hasta</label>
                    <input
                      type="date"
                      required
                      value={form.period_end}
                      onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                      className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </section>

              <p className="text-[13px] text-slate-500 dark:text-slate-400 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-xl px-4 py-3">
                Se facturan las entregas exitosas (tarifa de entrega) y las devoluciones (tarifa de logística inversa) del periodo que aún no estén facturadas.
              </p>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 flex items-center justify-center bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-[2] flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm disabled:opacity-60"
                >
                  {busy ? (
                    <div className="w-5 h-5 border-2 border-[#1C1C1E] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FilePlus2 className="w-5 h-5 text-[#1C1C1E]" />
                  )}
                  <span>Generar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          {/* El detalle crece con las entregas del periodo: una factura de un
              comercio activo trae decenas de renglones. Sin tope de alto el
              modal se estiraba más que la pantalla y, como no desplazaba, el
              total y la propia ✕ quedaban fuera y no había cómo cerrarlo. */}
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-3xl overflow-hidden shadow-2xl transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">{detail.invoice.invoice_number}</h2>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">{detail.invoice.at_clients?.business_name ?? ""}</p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 active:opacity-70 transition-opacity text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-5 space-y-3">
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="text-[15px] text-slate-600 dark:text-slate-400">{it.description}</span>
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white shrink-0">{formatCOP(it.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm">
                <span className="flex items-center gap-2 text-[16px] font-bold text-slate-900 dark:text-white">
                  <Receipt className="w-5 h-5 text-[#ff812c]" />
                  Total
                </span>
                <span className="text-[22px] font-extrabold text-slate-900 dark:text-white">
                  {formatCOP(detail.invoice.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
