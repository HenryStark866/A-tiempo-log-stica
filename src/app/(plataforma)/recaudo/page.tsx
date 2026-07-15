"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
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
  const profile = useProfile();
  const isOps = ["admin", "coordinador"].includes(profile.role);
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
    <>
      <PageHeader
        title="Recaudo y cierre de caja"
        subtitle="Fase 7: consignación diaria en Bancolombia y conciliación para auditoría"
        actions={
          profile.role === "mensajero" && (
            <Button onClick={createSettlement} disabled={busy || myPendingTotal === 0}>
              <Banknote className="size-4" /> Cerrar mi caja ({formatCOP(myPendingTotal)})
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 font-bold text-navy-900">Recaudos sin consignar</h2>
          <p className="mb-4 text-sm text-slate-500">
            Entregas contraentrega aún no incluidas en un cierre de caja
          </p>
          {pendingCod === null ? (
            <Loading />
          ) : pendingCod.length === 0 ? (
            <Empty label="Todo el recaudo está consignado" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingCod.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-bold text-navy-900">{g.guide_number}</p>
                    <p className="text-sm text-slate-500">
                      {g.courier?.full_name ?? "—"} · {g.at_clients?.business_name}
                    </p>
                  </div>
                  <p className="font-bold text-navy-900">{formatCOP(g.cod_amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-navy-900">
            <Landmark className="size-5 text-brand-500" /> Cierres de caja
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            {isOps
              ? "Concilia las consignaciones reportadas por los mensajeros"
              : "Tus cierres: consigna y reporta la referencia bancaria"}
          </p>
          {settlements === null ? (
            <Loading />
          ) : settlements.length === 0 ? (
            <Empty label="No hay cierres de caja" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {settlements.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-navy-900">
                        {s.courier?.full_name ?? "Mensajero"} · {formatDate(s.settlement_date)}
                      </p>
                      <p className="text-sm text-slate-500">
                        Esperado {formatCOP(s.expected_amount)}
                        {s.deposited_amount != null && ` · Consignado ${formatCOP(s.deposited_amount)}`}
                        {s.bank_reference && ` · Ref ${s.bank_reference}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill label={SETTLEMENT_STATUS_LABELS[s.status]} tone={TONES[s.status]} />
                      {s.status === "pendiente" &&
                        (profile.id === s.courier_id || isOps) && (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5"
                            onClick={() => {
                              setDeposit(s);
                              setForm({ amount: String(s.expected_amount), reference: "" });
                            }}
                          >
                            Reportar consignación
                          </Button>
                        )}
                      {s.status === "consignado" && isOps && (
                        <Button className="px-3 py-1.5" disabled={busy} onClick={() => reconcile(s.id)}>
                          Conciliar
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {deposit && (
        <Modal
          title={`Reportar consignación — ${formatCOP(deposit.expected_amount)} esperados`}
          onClose={() => setDeposit(null)}
        >
          <form onSubmit={reportDeposit} className="space-y-4">
            <Field label="Valor consignado (COP)">
              <input
                type="number"
                min="0"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Referencia / número de comprobante Bancolombia">
              <input
                required
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                className={inputCls}
                placeholder="Ej: 45789021"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeposit(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Reportar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
