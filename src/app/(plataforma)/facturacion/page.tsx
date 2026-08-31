"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Edit,
  Eye,
  ExternalLink,
  FilePlus2,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { Pill } from "@/components/StatusBadge";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { reportarPago, urlComprobante } from "@/lib/paymentReceipts";
import { formatCOP, formatDate, formatDateTime } from "@/lib/utils";
import { hoyEnColombia, primerDiaDelMes } from "@/lib/tiempo";
import type {
  Client,
  CodRemittance,
  EstadoCartera,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  InvoiceStatus,
} from "@/lib/types";

const TONES: Record<InvoiceStatus, "slate" | "blue" | "green" | "red"> = {
  borrador: "slate",
  emitida: "blue",
  pagada: "green",
  anulada: "red",
};

export default function BillingPage() {
  const profile = useProfile();
  const isOps = ["admin", "coordinador", "admin_cedi"].includes(profile.role);
  const esCliente = profile.role === "cliente";

  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [cartera, setCartera] = useState<EstadoCartera | null>(null);
  // Lo que le hemos girado (o le vamos a girar) del contraentrega recaudado.
  const [remesas, setRemesas] = useState<CodRemittance[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<{
    invoice: Invoice;
    items: InvoiceItem[];
    pagos: InvoicePayment[];
  } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [polarBusy, setPolarBusy] = useState<string | null>(null); // invoice id en proceso
  const [editingInvoice, setEditingInvoice] = useState(false);
  const [editableItems, setEditableItems] = useState<InvoiceItem[]>([]);

  // Reportar un pago (comercio) y revisarlo (administración).
  const [pagando, setPagando] = useState<Invoice | null>(null);
  const [formPago, setFormPago] = useState({ monto: "", referencia: "", metodo: "Transferencia" });
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [rechazando, setRechazando] = useState<InvoicePayment | null>(null);
  const [motivo, setMotivo] = useState("");

  const [form, setForm] = useState({
    client_id: "",
    period_start: primerDiaDelMes(),
    period_end: hoyEnColombia(),
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_invoices")
      .select("*, at_clients(business_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setInvoices((data as Invoice[]) ?? []);

    if (esCliente && profile.client_id) {
      const [{ data: c }, { data: rs }] = await Promise.all([
        supabase.rpc("at_estado_cartera", { p_client_id: profile.client_id }),
        supabase
          .from("at_cod_remittances")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setCartera(c as EstadoCartera);
      setRemesas((rs as CodRemittance[]) ?? []);
    }
  }, [esCliente, profile.client_id]);

  useEffect(() => {
    load();
    if (!isOps) return;
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
  }, [load, isOps]);

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
    setEditingInvoice(false);
    const supabase = createClient();
    const [{ data: items }, { data: pagos }] = await Promise.all([
      supabase.from("at_invoice_items").select("*").eq("invoice_id", inv.id).order("description"),
      supabase
        .from("at_invoice_payments")
        .select("*")
        .eq("invoice_id", inv.id)
        .order("reported_at", { ascending: false }),
    ]);
    const itemList = (items as InvoiceItem[]) ?? [];
    setDetail({
      invoice: inv,
      items: itemList,
      pagos: (pagos as InvoicePayment[]) ?? [],
    });
    setEditableItems(itemList);
  }

  async function guardarCambiosFactura() {
    if (!detail) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    try {
      // 1. Identificar ítems eliminados
      const itemsAEliminar = detail.items.filter(
        (original) => !editableItems.some((edited) => edited.id === original.id)
      );

      // 2. Eliminar ítems
      for (const item of itemsAEliminar) {
        const { error } = await supabase.rpc("at_delete_invoice_item", {
          p_item_id: item.id,
        });
        if (error) throw error;
      }

      // 3. Upsert ítems creados o modificados
      for (const item of editableItems) {
        const isNew = item.id.startsWith("temp-");
        const { error } = await supabase.rpc("at_upsert_invoice_item", {
          p_invoice_id: detail.invoice.id,
          p_item_id: isNew ? null : item.id,
          p_description: item.description,
          p_amount: Number(item.amount),
        });
        if (error) throw error;
      }

      setMsg({ ok: true, text: "Factura actualizada correctamente." });
      setEditingInvoice(false);

      // Recargar
      const { data: updatedInv } = await supabase
        .from("at_invoices")
        .select("*, at_clients(business_name)")
        .eq("id", detail.invoice.id)
        .single();

      if (updatedInv) {
        await openDetail(updatedInv as Invoice);
      }
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Error al guardar cambios" });
    } finally {
      setBusy(false);
    }
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

  async function enviarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!pagando) return;
    setBusy(true);
    setMsg(null);
    try {
      await reportarPago({
        usuarioId: profile.id,
        invoiceId: pagando.id,
        monto: Number(formPago.monto),
        referencia: formPago.referencia,
        metodo: formPago.metodo,
        comprobante,
      });
      setMsg({
        ok: true,
        text: "Pago reportado. Apenas administración verifique el comprobante, la factura queda saldada.",
      });
      setPagando(null);
      setComprobante(null);
      setFormPago({ monto: "", referencia: "", metodo: "Transferencia" });
      load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "No se pudo reportar el pago" });
    } finally {
      setBusy(false);
    }
  }

  async function pagarConPolar(inv: Invoice) {
    setPolarBusy(inv.id);
    setMsg(null);
    try {
      const res = await fetch("/api/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: inv.id, amount: inv.total }),
      });
      // La forma la fija src/lib/api/respuesta.ts: `ok` y, si no, `motivo`.
      const json = (await res.json()) as { ok?: boolean; url?: string; motivo?: string };
      if (!json.ok || !json.url) {
        setMsg({ ok: false, text: json.motivo ?? "No se pudo iniciar el pago con Polar" });
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      setMsg({ ok: false, text: "Error de conexión al iniciar pago con Polar" });
    } finally {
      setPolarBusy(null);
    }
  }

  async function verificarPago(pagoId: string, aprobado: boolean, notas?: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_verify_invoice_payment", {
      p_payment_id: pagoId,
      p_approved: aprobado,
      p_notes: notas ?? null,
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setRechazando(null);
    setMotivo("");
    setMsg({
      ok: true,
      text: aprobado ? "Pago verificado." : "Pago rechazado; le avisamos al comercio.",
    });
    if (detail) {
      const actualizada = (invoices ?? []).find((i) => i.id === detail.invoice.id);
      openDetail(actualizada ?? detail.invoice);
    }
    load();
  }

  async function verComprobante(path: string) {
    const url = await urlComprobante(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setMsg({ ok: false, text: "No se pudo abrir el comprobante" });
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Facturación
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {esCliente
              ? "Tu cuenta con A Tiempo: cada entrega entra sola apenas se completa"
              : "Cierre operativo por cliente e-commerce"}
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

      {/* Estado de cartera del comercio: es lo que decide si puede seguir
          despachando, así que va arriba de todo y no escondido en un detalle. */}
      {esCliente && cartera && (() => {
        /* Estar bloqueado exige DEBER algo. Un comercio llegó a ver «Tienes $0
           vencidos: no puedes solicitar más recogidas» —una factura en cero,
           de cuando el comprador pagó el domicilio en la puerta, contaba como
           vencida—. La causa se corrigió en la base, pero la condición se
           deriva también aquí: ningún camino futuro debería poder decirle a
           alguien que está en mora de nada. */
        const debe = Number(cartera.saldo) > 0;
        const bloqueado = !cartera.al_dia && debe;
        return (
          <div
            className={`rounded-2xl p-4 ${
              bloqueado ? "bg-rose-50 dark:bg-rose-500/10" : "bg-emerald-50 dark:bg-emerald-500/10"
            }`}
          >
            <p
              className={`text-[15px] font-bold ${
                bloqueado
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {bloqueado
                ? `Tienes ${formatCOP(cartera.saldo)} vencidos: no puedes solicitar más recogidas`
                : debe
                  ? `Debes ${formatCOP(cartera.saldo)} — puedes seguir solicitando recogidas`
                  : "Estás al día"}
            </p>
            <p
              className={`mt-1 text-[13px] leading-snug ${
                bloqueado
                  ? "text-rose-700/80 dark:text-rose-400/80"
                  : "text-emerald-700/80 dark:text-emerald-400/80"
              }`}
            >
              {bloqueado
                ? "Reporta el pago con su comprobante y, apenas lo verifiquemos, se desbloquea."
                : debe && cartera.vence_en
                  ? `Tienes plazo hasta el ${formatDateTime(cartera.vence_en)} para pagar.`
                  : "No tienes facturas pendientes."}
            </p>
          </div>
        );
      })()}

      {/* ── Tu recaudo ──
          La otra mitad de la cuenta: lo que nosotros te debemos a ti del
          contraentrega. Va desglosado porque el neto solo se entiende viendo
          qué se descontó y por qué. */}
      {esCliente && remesas.length > 0 && (
        <section>
          <h2 className="mb-3 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Tu recaudo contraentrega
          </h2>
          {/* Translúcida y con blur: probado en vivo, /90 sin blur no se
              distinguía de una tarjeta opaca en ninguno de los dos temas —
              el alfa solo no bastaba. Con blur el costo es el de UN
              contenedor por pantalla, no el de las 234 tarjetas del barrido
              completo que sí preocupaban por batería; mismo cálculo que ya
              usan la cabecera y la barra inferior de AppShell. Los modales de
              esta pantalla (nueva factura, detalle, rechazar pago) se quedan
              opacos: aíslan una decisión, y sus bloques internos no se tocan
              para no multiplicar la opacidad. */}
          <ul className="overflow-hidden rounded-2xl atl-superficie shadow-sm   divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
            {remesas.map((r) => (
              <li key={r.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                      {r.remittance_number}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {r.guide_count} entrega(s) · {formatDate(r.period_start)} —{" "}
                      {formatDate(r.period_end)}
                    </p>
                  </div>
                  <Pill
                    label={r.status === "pagada" ? "Girado" : "Por girar"}
                    tone={r.status === "pagada" ? "green" : "amber"}
                  />
                </div>

                <dl className="mt-3 space-y-1 border-t border-slate-900/[0.06] pt-3 text-[13px] dark:border-white/[0.08]">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Recaudamos de tus compradores</dt>
                    <dd className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                      {formatCOP(r.gross_amount)}
                    </dd>
                  </div>
                  {Number(r.shipping_kept) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">
                        − Domicilios que ya cobramos al comprador
                      </dt>
                      <dd className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {formatCOP(r.shipping_kept)}
                      </dd>
                    </div>
                  )}
                  {Number(r.invoice_offset) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500 dark:text-slate-400">
                        − Abonado a tus fletes pendientes
                      </dt>
                      <dd className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {formatCOP(r.invoice_offset)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-900/[0.06] pt-1 dark:border-white/[0.08]">
                    <dt className="font-bold text-slate-900 dark:text-white">
                      {r.status === "pagada" ? "Te giramos" : "Te giramos"}
                    </dt>
                    <dd className="text-[15px] font-bold tabular-nums text-[#ff812c]">
                      {formatCOP(r.net_amount)}
                    </dd>
                  </div>
                </dl>

                {r.paid_at && (
                  <p className="mt-2 text-[12px] text-emerald-600 dark:text-emerald-400">
                    Girado el {formatDateTime(r.paid_at)}
                    {r.reference ? ` · Ref: ${r.reference}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Invoices List — translúcida y con blur (ver la nota de arriba). */}
      <div className="atl-superficie   rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
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
            <p className="text-[16px] text-slate-500 dark:text-slate-400">
              {esCliente
                ? "Todavía no tienes entregas facturadas"
                : "No hay facturas generadas"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.06] dark:border-white/[0.08] text-left">
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Factura</th>
                    {!esCliente && (
                      <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cliente</th>
                    )}
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Periodo</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                    <th className="px-5 py-3 text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-900/[0.04] dark:border-white/[0.04] last:border-0 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => openDetail(inv)}
                          className="text-[15px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity"
                        >
                          {inv.invoice_number}
                        </button>
                      </td>
                      {!esCliente && (
                        <td className="px-5 py-3.5 text-[15px] text-slate-600 dark:text-slate-400">
                          {inv.at_clients?.business_name}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-[14px] text-slate-500 dark:text-slate-400">
                        {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                      </td>
                      <td className="px-5 py-3.5 text-[15px] font-bold text-slate-900 dark:text-white">
                        {formatCOP(inv.total)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill label={INVOICE_STATUS_LABELS[inv.status]} tone={TONES[inv.status]} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {esCliente && inv.status !== "pagada" && inv.status !== "anulada" && Number(inv.total) > 0 && (
                            <>
                              <button
                                onClick={() => pagarConPolar(inv)}
                                disabled={polarBusy === inv.id}
                                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg active:scale-95 transition-transform disabled:opacity-60"
                              >
                                {polarBusy === inv.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CreditCard className="w-3.5 h-3.5" />
                                )}
                                Pagar con Polar
                                {polarBusy !== inv.id && <ExternalLink className="w-3 h-3 opacity-60" />}
                              </button>
                              <button
                                onClick={() => {
                                  setPagando(inv);
                                  setFormPago({ monto: String(inv.total), referencia: "", metodo: "Transferencia" });
                                  setComprobante(null);
                                }}
                                className="text-[13px] font-semibold text-[#1C1C1E] bg-[#ff812c] hover:bg-[#ff812c]/90 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                              >
                                Reportar pago
                              </button>
                            </>
                          )}
                          {isOps && inv.status === "borrador" && (
                            <button
                              onClick={() => setStatus(inv, "emitida")}
                              className="text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                            >
                              Emitir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
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
                  {!esCliente && (
                    <p className="text-[14px] text-slate-600 dark:text-slate-400">
                      {inv.at_clients?.business_name}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">
                      {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                    </p>
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                      {formatCOP(inv.total)}
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {esCliente && inv.status !== "pagada" && inv.status !== "anulada" && Number(inv.total) > 0 && (
                      <>
                        <button
                          onClick={() => pagarConPolar(inv)}
                          disabled={polarBusy === inv.id}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white bg-slate-800 dark:bg-slate-700 min-h-[40px] rounded-xl active:scale-95 transition-transform disabled:opacity-60"
                        >
                          {polarBusy === inv.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CreditCard className="w-4 h-4" />
                          )}
                          Pagar con Polar
                        </button>
                        <button
                          onClick={() => {
                            setPagando(inv);
                            setFormPago({ monto: String(inv.total), referencia: "", metodo: "Transferencia" });
                            setComprobante(null);
                          }}
                          className="flex-1 text-[13px] font-semibold text-[#1C1C1E] bg-[#ff812c] min-h-[40px] rounded-xl active:scale-95 transition-transform"
                        >
                          Reportar pago
                        </button>
                      </>
                    )}
                    {isOps && inv.status === "borrador" && (
                      <button
                        onClick={() => setStatus(inv, "emitida")}
                        className="flex-1 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-gray-700 min-h-[40px] rounded-xl active:scale-95 transition-transform"
                      >
                        Emitir
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Reportar pago (comercio) ── */}
      {pagando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setPagando(null)}>
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col atl-relleno  rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-900/[0.06] dark:border-white/[0.08]">
              <div>
                <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Reportar pago</h2>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  {pagando.invoice_number} · {formatCOP(pagando.total)}
                </p>
              </div>
              <button
                onClick={() => setPagando(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={enviarPago} className="min-h-0 overflow-y-auto p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Valor pagado</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formPago.monto}
                  onChange={(e) => setFormPago((f) => ({ ...f, monto: e.target.value }))}
                  className="w-full min-h-[52px] rounded-2xl atl-superficie px-4 text-[17px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff812c]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">Medio de pago</label>
                <select
                  value={formPago.metodo}
                  onChange={(e) => setFormPago((f) => ({ ...f, metodo: e.target.value }))}
                  className="w-full min-h-[52px] rounded-2xl atl-superficie px-4 text-[17px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff812c]"
                >
                  {["Transferencia", "Nequi", "Daviplata", "Consignación", "Efectivo"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Referencia o número de comprobante
                </label>
                <input
                  value={formPago.referencia}
                  onChange={(e) => setFormPago((f) => ({ ...f, referencia: e.target.value }))}
                  placeholder="Ej: 45789021"
                  className="w-full min-h-[52px] rounded-2xl atl-superficie px-4 text-[17px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff812c]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Comprobante
                </label>
                <label className="flex items-center gap-3 min-h-[52px] px-4 rounded-2xl atl-superficie cursor-pointer active:opacity-80">
                  <Upload className="w-5 h-5 text-[#ff812c] shrink-0" />
                  <span className="text-[15px] text-slate-700 dark:text-slate-300 truncate">
                    {comprobante ? comprobante.name : "Adjuntar foto o PDF del pago"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Sin comprobante también se puede reportar, pero la verificación se demora más.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 bg-[#ff812c] text-[#1C1C1E] font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
                Reportar pago
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Generar factura (ops) ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowNew(false)}>
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col atl-relleno  rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-900/[0.06] dark:border-white/[0.08]">
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Generar factura del periodo</h2>
              <button
                onClick={() => setShowNew(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={generate} className="min-h-0 overflow-y-auto p-5 space-y-5">
              <p className="rounded-xl atl-superficie px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                Cada entrega ya entra sola a la cuenta del comercio apenas se completa. Esto es para
                cerrar a mano un periodo con lo que haya quedado suelto.
              </p>
              <section>
                <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">Cliente</h3>
                <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center px-4 min-h-[52px]">
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
                <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08]">
                    <label className="w-[60px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Desde</label>
                    <input
                      type="date"
                      required
                      value={form.period_start}
                      onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                      className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center px-4 min-h-[52px]">
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

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 flex items-center justify-center atl-superficie text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-[2] flex items-center justify-center space-x-2 bg-[#ff812c] text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FilePlus2 className="w-5 h-5" />}
                  <span>Generar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detalle de factura ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div
            className="w-full max-w-md max-h-[90dvh] flex flex-col atl-relleno  rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-900/[0.06] dark:border-white/[0.08]">
              <div>
                <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">{detail.invoice.invoice_number}</h2>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">
                  {detail.invoice.at_clients?.business_name ?? ""}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-5 space-y-3">
              {editingInvoice ? (
                <div className="space-y-3">
                  <div className="atl-superficie rounded-2xl p-4 shadow-sm space-y-3">
                    {editableItems.map((it, idx) => (
                      <div key={it.id} className="flex gap-2 items-center">
                        <input
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => {
                            const next = [...editableItems];
                            next[idx] = { ...next[idx], description: e.target.value };
                            setEditableItems(next);
                          }}
                          placeholder="Descripción"
                          className="flex-[2] text-[14px] atl-relleno  p-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff812c]"
                        />
                        <input
                          type="number"
                          required
                          value={it.amount === 0 ? "" : it.amount}
                          onChange={(e) => {
                            const next = [...editableItems];
                            next[idx] = { ...next[idx], amount: Number(e.target.value) };
                            setEditableItems(next);
                          }}
                          placeholder="Valor"
                          className="flex-1 text-[14px] atl-relleno  p-2.5 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff812c]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditableItems(editableItems.filter((_, i) => i !== idx));
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setEditableItems([
                          ...editableItems,
                          {
                            id: `temp-${Date.now()}`,
                            invoice_id: detail.invoice.id,
                            guide_id: null,
                            description: "",
                            amount: 0,
                          },
                        ]);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1 py-2 text-[13px] font-semibold text-[#ff812c] hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl border border-dashed border-slate-900/[0.12] dark:border-white/[0.10]"
                    >
                      <Plus className="w-4 h-4" /> Agregar concepto
                    </button>
                  </div>

                  <div className="atl-superficie rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm">
                    <span className="flex items-center gap-2 text-[16px] font-bold text-slate-900 dark:text-white">
                      <Receipt className="w-5 h-5 text-[#ff812c]" />
                      Nuevo Total
                    </span>
                    <span className="text-[22px] font-extrabold text-slate-900 dark:text-white">
                      {formatCOP(editableItems.reduce((acc, it) => acc + Number(it.amount), 0))}
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingInvoice(false);
                        setEditableItems(detail.items);
                      }}
                      className="flex-1 min-h-[46px] rounded-xl bg-gray-100 dark:bg-gray-700 font-semibold text-slate-700 dark:text-slate-300 text-[14px]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={guardarCambiosFactura}
                      className="flex-1 min-h-[46px] rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] disabled:opacity-60 text-[14px]"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> : null}
                      Guardar cambios
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
                    {detail.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="text-[14px] text-slate-600 dark:text-slate-400">{it.description}</span>
                        <span
                          className={`text-[15px] font-semibold shrink-0 ${
                            Number(it.amount) === 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {Number(it.amount) === 0 ? "Sin cobro" : formatCOP(it.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="atl-superficie rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm">
                    <span className="flex items-center gap-2 text-[16px] font-bold text-slate-900 dark:text-white">
                      <Receipt className="w-5 h-5 text-[#ff812c]" />
                      Total
                    </span>
                    <span className="text-[22px] font-extrabold text-slate-900 dark:text-white">
                      {formatCOP(detail.invoice.total)}
                    </span>
                  </div>

                  {isOps && detail.invoice.status === "borrador" && (
                    <button
                      type="button"
                      onClick={() => setEditingInvoice(true)}
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-900/[0.06] dark:border-white/[0.08] text-slate-700 dark:text-slate-300 font-semibold text-[14px] hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <Edit className="w-4 h-4" /> Editar ítems de factura
                    </button>
                  )}
                </>
              )}

              {/* Pagos reportados */}
              {detail.pagos.length > 0 && (
                <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm">
                  <p className="px-4 pt-4 pb-2 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Pagos reportados
                  </p>
                  <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
                    {detail.pagos.map((p) => (
                      <li key={p.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                              {formatCOP(p.amount)}
                              <span className="ml-2 text-[13px] font-normal text-slate-500 dark:text-slate-400">
                                {p.method}
                              </span>
                            </p>
                            <p className="text-[13px] text-slate-500 dark:text-slate-400">
                              {p.reference ? `Ref: ${p.reference} · ` : ""}
                              {formatDateTime(p.reported_at)}
                            </p>
                            {p.status === "rechazado" && p.review_notes && (
                              <p className="mt-1 flex items-start gap-1.5 text-[13px] text-rose-600 dark:text-rose-400">
                                <TriangleAlert className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                                {p.review_notes}
                              </p>
                            )}
                          </div>
                          <Pill
                            label={
                              p.status === "verificado"
                                ? "Verificado"
                                : p.status === "rechazado"
                                  ? "Rechazado"
                                  : "Por verificar"
                            }
                            tone={
                              p.status === "verificado"
                                ? "green"
                                : p.status === "rechazado"
                                  ? "red"
                                  : "amber"
                            }
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.receipt_path && (
                            <button
                              onClick={() => verComprobante(p.receipt_path!)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-900/[0.06] dark:border-white/[0.08] px-3 text-xs font-semibold text-slate-700 dark:text-slate-200"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver comprobante
                            </button>
                          )}
                          {isOps && p.status === "pendiente" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => verificarPago(p.id, true)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                <Check className="w-3.5 h-3.5" /> Verificar
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => { setRechazando(p); setMotivo(""); }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-600 disabled:opacity-60"
                              >
                                <X className="w-3.5 h-3.5" /> Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Rechazar un pago ── */}
      {rechazando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setRechazando(null)}>
          <div
            className="w-full max-w-sm atl-superficie rounded-3xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
              Rechazar el pago de {formatCOP(rechazando.amount)}
            </h3>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: el comprobante no corresponde al valor reportado."
              className="mt-3 w-full rounded-2xl atl-relleno  p-4 text-[15px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff812c] resize-none"
            />
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              El comercio recibe este mensaje y puede volver a reportarlo corregido.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setRechazando(null)}
                className="flex-1 min-h-[46px] rounded-xl bg-gray-100 dark:bg-gray-700 font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                disabled={busy || !motivo.trim()}
                onClick={() => verificarPago(rechazando.id, false, motivo.trim())}
                className="flex-1 min-h-[46px] rounded-xl bg-rose-600 font-bold text-white disabled:opacity-60"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
