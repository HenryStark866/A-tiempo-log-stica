"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
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
    <>
      <PageHeader
        title="Facturación"
        subtitle="Cierre operativo: cortes quincenales o mensuales por cliente e-commerce"
        actions={
          isOps && (
            <Button onClick={() => setShowNew(true)}>
              <FilePlus2 className="size-4" /> Generar factura
            </Button>
          )
        }
      />

      {msg && (
        <p
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
            msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      <Card>
        {invoices === null ? (
          <Loading />
        ) : invoices.length === 0 ? (
          <Empty label="No hay facturas generadas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Factura</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Estado</th>
                  {isOps && <th className="px-5 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openDetail(inv)}
                        className="font-bold text-brand-600 hover:underline"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {inv.at_clients?.business_name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                    </td>
                    <td className="px-5 py-3 font-bold text-navy-900">
                      {formatCOP(inv.total)}
                    </td>
                    <td className="px-5 py-3">
                      <Pill label={INVOICE_STATUS_LABELS[inv.status]} tone={TONES[inv.status]} />
                    </td>
                    {isOps && (
                      <td className="px-5 py-3 text-right">
                        {inv.status === "borrador" && (
                          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setStatus(inv, "emitida")}>
                            Emitir
                          </Button>
                        )}
                        {inv.status === "emitida" && (
                          <Button className="px-3 py-1.5" onClick={() => setStatus(inv, "pagada")}>
                            Marcar pagada
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showNew && (
        <Modal title="Generar factura del periodo" onClose={() => setShowNew(false)}>
          <form onSubmit={generate} className="space-y-4">
            <Field label="Cliente">
              <select
                required
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className={inputCls}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name} ({c.billing_cycle})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Desde">
                <input
                  type="date"
                  required
                  value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="date"
                  required
                  value={form.period_end}
                  onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Se facturan las entregas exitosas (tarifa de entrega) y las devoluciones
              (tarifa de logística inversa) del periodo que aún no estén facturadas.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Generar
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`${detail.invoice.invoice_number} — ${detail.invoice.at_clients?.business_name ?? ""}`}
          onClose={() => setDetail(null)}
        >
          <ul className="divide-y divide-slate-100">
            {detail.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-slate-600">{it.description}</span>
                <span className="font-semibold text-navy-900">{formatCOP(it.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="flex items-center gap-2 font-bold text-navy-900">
              <Receipt className="size-5 text-brand-500" /> Total
            </span>
            <span className="text-xl font-extrabold text-navy-900">
              {formatCOP(detail.invoice.total)}
            </span>
          </div>
        </Modal>
      )}
    </>
  );
}
