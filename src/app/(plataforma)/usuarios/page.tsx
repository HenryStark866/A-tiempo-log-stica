"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { Client, Profile, Role, Zone } from "@/lib/types";

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ role: "pendiente", client_id: "", zone_id: "", active: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setProfiles((data as Profile[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .order("business_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
    supabase
      .from("at_zones")
      .select("*")
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, [load]);

  function openEdit(p: Profile) {
    setEditing(p);
    setError(null);
    setForm({
      role: p.role,
      client_id: p.client_id ?? "",
      zone_id: p.zone_id ?? "",
      active: p.active,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("at_profiles")
      .update({
        role: form.role as Role,
        client_id: form.role === "cliente" ? form.client_id || null : null,
        zone_id: form.role === "mensajero" ? form.zone_id || null : null,
        active: form.active,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditing(null);
    load();
  }

  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        subtitle="Activa cuentas nuevas y asigna roles operativos"
      />

      <Card>
        {profiles === null ? (
          <Loading />
        ) : profiles.length === 0 ? (
          <Empty label="No hay usuarios" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Registro</th>
                  <th className="px-5 py-3 text-right">Gestionar</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-navy-900">{p.full_name || "(sin nombre)"}</p>
                      <p className="text-xs text-slate-400">{p.phone ?? ""}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Pill
                        label={ROLE_LABELS[p.role]}
                        tone={p.role === "pendiente" ? "amber" : p.role === "admin" ? "blue" : "slate"}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <Pill label={p.active ? "Activo" : "Inactivo"} tone={p.active ? "green" : "red"} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="secondary" className="px-3 py-1.5" onClick={() => openEdit(p)}>
                        <ShieldCheck className="size-4" /> Rol
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={`Gestionar a ${editing.full_name || "usuario"}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Rol en la plataforma">
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={inputCls}
              >
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
            {form.role === "cliente" && (
              <Field label="Cliente e-commerce vinculado">
                <select
                  required
                  value={form.client_id}
                  onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Selecciona…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.business_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form.role === "mensajero" && (
              <Field label="Zona habitual">
                <select
                  value={form.zone_id}
                  onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Sin zona fija</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="size-4 accent-brand-500"
              />
              Cuenta activa
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
