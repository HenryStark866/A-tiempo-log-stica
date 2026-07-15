"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { formatCOP } from "@/lib/utils";
import type { Client } from "@/lib/types";

const EMPTY_FORM = {
  business_name: "",
  nit: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  billing_cycle: "quincenal",
  delivery_rate: "6000",
  return_rate: "3000",
  active: true,
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_clients")
      .select("*")
      .order("business_name");
    setClients((data as Client[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(c: Client | "new") {
    setEditing(c);
    setError(null);
    setForm(
      c === "new"
        ? { ...EMPTY_FORM }
        : {
            business_name: c.business_name,
            nit: c.nit ?? "",
            contact_name: c.contact_name ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            address: c.address ?? "",
            billing_cycle: c.billing_cycle,
            delivery_rate: String(c.delivery_rate),
            return_rate: String(c.return_rate),
            active: c.active,
          }
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      business_name: form.business_name,
      nit: form.nit || null,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      billing_cycle: form.billing_cycle,
      delivery_rate: Number(form.delivery_rate) || 0,
      return_rate: Number(form.return_rate) || 0,
      active: form.active,
    };
    const { error } =
      editing === "new"
        ? await supabase.from("at_clients").insert(payload)
        : await supabase.from("at_clients").update(payload).eq("id", (editing as Client).id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    load();
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Clientes e-commerce"
        subtitle="Comercios aliados, tarifas y ciclo de facturación"
        actions={
          <Button onClick={() => openEdit("new")}>
            <Plus className="size-4" /> Nuevo cliente
          </Button>
        }
      />

      <Card>
        {clients === null ? (
          <Loading />
        ) : clients.length === 0 ? (
          <Empty label="No hay clientes registrados" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Comercio</th>
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3">Ciclo</th>
                  <th className="px-5 py-3">Tarifa entrega</th>
                  <th className="px-5 py-3">Tarifa devolución</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Editar</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-navy-900">{c.business_name}</p>
                      <p className="text-xs text-slate-400">NIT {c.nit ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <p>{c.contact_name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{c.email ?? ""}</p>
                    </td>
                    <td className="px-5 py-3 capitalize text-slate-600">{c.billing_cycle}</td>
                    <td className="px-5 py-3 font-medium text-slate-700">{formatCOP(c.delivery_rate)}</td>
                    <td className="px-5 py-3 font-medium text-slate-700">{formatCOP(c.return_rate)}</td>
                    <td className="px-5 py-3">
                      <Pill label={c.active ? "Activo" : "Inactivo"} tone={c.active ? "green" : "red"} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal
          title={editing === "new" ? "Nuevo cliente" : `Editar ${(editing as Client).business_name}`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Razón social / comercio">
                <input required value={form.business_name} onChange={set("business_name")} className={inputCls} />
              </Field>
              <Field label="NIT">
                <input value={form.nit} onChange={set("nit")} className={inputCls} />
              </Field>
              <Field label="Contacto">
                <input value={form.contact_name} onChange={set("contact_name")} className={inputCls} />
              </Field>
              <Field label="Correo">
                <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
              </Field>
              <Field label="Teléfono">
                <input value={form.phone} onChange={set("phone")} className={inputCls} />
              </Field>
              <Field label="Ciclo de facturación">
                <select value={form.billing_cycle} onChange={set("billing_cycle")} className={inputCls}>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </Field>
            </div>
            <Field label="Dirección del comercio">
              <input value={form.address} onChange={set("address")} className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tarifa por entrega (COP)">
                <input type="number" min="0" required value={form.delivery_rate} onChange={set("delivery_rate")} className={inputCls} />
              </Field>
              <Field label="Tarifa por devolución (COP)">
                <input type="number" min="0" required value={form.return_rate} onChange={set("return_rate")} className={inputCls} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="size-4 accent-brand-500"
              />
              Cliente activo
            </label>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Guardar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
