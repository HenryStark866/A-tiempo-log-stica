"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Button, Field, inputCls } from "@/components/ui";
import type { Client, Zone } from "@/lib/types";

export default function NewGuidePage() {
  const router = useRouter();
  const profile = useProfile();
  const [clients, setClients] = useState<Client[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "Medellín",
    zone_id: "",
    declared_value: "",
    is_cod: false,
    cod_amount: "",
    notes: "",
  });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        if (profile.role === "cliente" && profile.client_id) {
          setForm((f) => ({ ...f, client_id: profile.client_id! }));
        } else if (list.length) {
          setForm((f) => ({ ...f, client_id: f.client_id || list[0].id }));
        }
      });
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("at_guides")
      .insert({
        client_id: form.client_id,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone || null,
        recipient_address: form.recipient_address,
        recipient_city: form.recipient_city,
        zone_id: form.zone_id || null,
        declared_value: Number(form.declared_value) || 0,
        is_cod: form.is_cod,
        cod_amount: form.is_cod ? Number(form.cod_amount) || 0 : 0,
        notes: form.notes || null,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      setError(error?.message ?? "No se pudo crear la guía");
      setSaving(false);
      return;
    }
    router.push(`/guias/${data.id}`);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Nueva guía"
        subtitle="Registra un envío para recogida y entrega en última milla"
      />
      <Card className="max-w-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Cliente e-commerce">
            <select
              required
              value={form.client_id}
              onChange={set("client_id")}
              className={inputCls}
              disabled={profile.role === "cliente"}
            >
              <option value="">Selecciona…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del destinatario">
              <input required value={form.recipient_name} onChange={set("recipient_name")} className={inputCls} />
            </Field>
            <Field label="Teléfono">
              <input value={form.recipient_phone} onChange={set("recipient_phone")} className={inputCls} />
            </Field>
          </div>

          <Field label="Dirección de entrega">
            <input required value={form.recipient_address} onChange={set("recipient_address")} className={inputCls} placeholder="Cl 10 #43E-31, apto 201" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ciudad">
              <input required value={form.recipient_city} onChange={set("recipient_city")} className={inputCls} />
            </Field>
            <Field label="Zona (opcional)">
              <select value={form.zone_id} onChange={set("zone_id")} className={inputCls}>
                <option value="">Se define en el CEDI</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor declarado (COP)">
              <input type="number" min="0" value={form.declared_value} onChange={set("declared_value")} className={inputCls} />
            </Field>
            <div>
              <label className="mb-1 flex items-center gap-2 pt-1 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_cod}
                  onChange={(e) => setForm((f) => ({ ...f, is_cod: e.target.checked }))}
                  className="size-4 accent-brand-500"
                />
                Pago contraentrega (COD)
              </label>
              {form.is_cod && (
                <input
                  type="number"
                  min="0"
                  required
                  value={form.cod_amount}
                  onChange={set("cod_amount")}
                  className={inputCls}
                  placeholder="Valor a recaudar"
                />
              )}
            </div>
          </div>

          <Field label="Notas (opcional)">
            <textarea value={form.notes} onChange={set("notes")} className={inputCls} rows={2} />
          </Field>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
              Crear guía
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
