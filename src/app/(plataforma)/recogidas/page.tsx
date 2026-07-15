"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { PICKUP_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Client, Pickup, PickupStatus } from "@/lib/types";

const TONES: Record<PickupStatus, "slate" | "blue" | "green" | "red"> = {
  pendiente: "slate",
  asignada: "blue",
  completada: "green",
  cancelada: "red",
};

export default function PickupsPage() {
  const profile = useProfile();
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    scheduled_date: new Date().toISOString().slice(0, 10),
    address: "",
    contact_name: "",
    contact_phone: "",
    notes: "",
  });

  const isStaff = ["admin", "coordinador", "operario"].includes(profile.role);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_pickups")
      .select("*, at_clients(business_name), operator:at_profiles!at_pickups_operator_id_fkey(full_name)")
      .order("requested_at", { ascending: false })
      .limit(100);
    setPickups((data as Pickup[]) ?? []);
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
        setForm((f) => ({
          ...f,
          client_id: profile.role === "cliente" ? profile.client_id ?? "" : list[0]?.id ?? "",
          address: profile.role === "cliente" ? list[0]?.address ?? "" : "",
        }));
      });
  }, [load, profile]);

  async function createPickup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("at_pickups").insert({
      client_id: form.client_id,
      scheduled_date: form.scheduled_date,
      address: form.address,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      notes: form.notes || null,
      created_by: profile.id,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShowNew(false);
    load();
  }

  async function updateStatus(p: Pickup, status: PickupStatus) {
    const supabase = createClient();
    await supabase
      .from("at_pickups")
      .update({
        status,
        operator_id: status === "asignada" ? profile.id : p.operator_id,
        completed_at: status === "completada" ? new Date().toISOString() : null,
      })
      .eq("id", p.id);
    load();
  }

  return (
    <>
      <PageHeader
        title="Recogidas"
        subtitle="Fase 1: solicitudes de recogida en el comercio del cliente"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="size-4" /> Solicitar recogida
          </Button>
        }
      />

      <Card>
        {pickups === null ? (
          <Loading />
        ) : pickups.length === 0 ? (
          <Empty label="No hay recogidas registradas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Dirección</th>
                  <th className="px-5 py-3">Operario</th>
                  <th className="px-5 py-3">Estado</th>
                  {isStaff && <th className="px-5 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pickups.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-navy-900">
                      {p.at_clients?.business_name}
                      {p.notes && <p className="text-xs font-normal text-slate-400">{p.notes}</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(p.scheduled_date)}</td>
                    <td className="px-5 py-3 text-slate-600">{p.address}</td>
                    <td className="px-5 py-3 text-slate-600">{p.operator?.full_name ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Pill label={PICKUP_STATUS_LABELS[p.status]} tone={TONES[p.status]} />
                      {p.completed_at && (
                        <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(p.completed_at)}</p>
                      )}
                    </td>
                    {isStaff && (
                      <td className="px-5 py-3 text-right">
                        {p.status === "pendiente" && (
                          <Button variant="secondary" className="px-3 py-1.5" onClick={() => updateStatus(p, "asignada")}>
                            Asignarme
                          </Button>
                        )}
                        {p.status === "asignada" && (
                          <Button className="px-3 py-1.5" onClick={() => updateStatus(p, "completada")}>
                            Completar
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
        <Modal title="Solicitar recogida" onClose={() => setShowNew(false)}>
          <form onSubmit={createPickup} className="space-y-4">
            <Field label="Cliente">
              <select
                required
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className={inputCls}
                disabled={profile.role === "cliente"}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha programada">
                <input
                  type="date"
                  required
                  value={form.scheduled_date}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Teléfono de contacto">
                <input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Dirección de recogida">
              <input
                required
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Notas">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputCls}
                rows={2}
                placeholder="Cantidad estimada de paquetes, horario…"
              />
            </Field>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Solicitar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
