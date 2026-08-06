"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  Loader2,
  Package,
  Plus,
  UserCog,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { formatCOP, formatDate } from "@/lib/utils";
import { hoyEnColombia, primerDiaDelMes } from "@/lib/tiempo";
import type { Profile } from "@/lib/types";

/** Lo que devuelve at_list_facilities: una sede con sus números ya contados. */
interface FacilityRow {
  id: string;
  name: string;
  city: string;
  address: string;
  active: boolean;
  is_default: boolean;
  commission_bps: number;
  owner_name: string | null;
  comercios: number;
  mensajeros: number;
  guias_totales: number;
  liquidaciones_pendientes: number;
}

interface FacilitySettlement {
  id: string;
  facility_id: string;
  period_start: string;
  period_end: string;
  delivered_count: number;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  status: "pendiente" | "pagado";
  created_at: string;
}

const FORM_VACIO = { name: "", address: "", city: "", commission_pct: "10", phone: "" };

export default function SedesPage() {
  const profile = useProfile();
  const esAdmin = profile.role === "admin";

  const [facilities, setFacilities] = useState<FacilityRow[] | null>(null);
  const [pendientes, setPendientes] = useState<Profile[]>([]);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [asignando, setAsignando] = useState<FacilityRow | null>(null);
  const [candidatoId, setCandidatoId] = useState("");

  const [liquidando, setLiquidando] = useState<FacilityRow | null>(null);
  const [periodo, setPeriodo] = useState({ start: primerDiaDelMes(), end: hoyEnColombia() });
  const [settlements, setSettlements] = useState<FacilitySettlement[] | null>(null);

  const load = useCallback(async () => {
    if (!esAdmin) return;
    const supabase = createClient();
    const [{ data: f }, { data: p }] = await Promise.all([
      supabase.rpc("at_list_facilities"),
      supabase.from("at_profiles").select("*").eq("role", "pendiente").order("full_name"),
    ]);
    setFacilities((f as FacilityRow[]) ?? []);
    setPendientes((p as Profile[]) ?? []);
  }, [esAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function crearSede(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_crear_facility", {
      p_name: form.name.trim(),
      p_address: form.address.trim(),
      p_city: form.city.trim(),
      p_commission_bps: Math.round(Number(form.commission_pct || 0) * 100),
      p_phone: form.phone.trim() || null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCreando(false);
    setForm({ ...FORM_VACIO });
    setMsg(`${form.name} queda afiliado. Ahora asígnale un administrador.`);
    load();
  }

  async function asignar() {
    if (!asignando || !candidatoId) return;
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_asignar_admin_cedi", {
      p_profile_id: candidatoId,
      p_facility_id: asignando.id,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMsg(`Administrador asignado a ${asignando.name}.`);
    setAsignando(null);
    setCandidatoId("");
    load();
  }

  async function abrirLiquidacion(f: FacilityRow) {
    setLiquidando(f);
    setSettlements(null);
    const supabase = createClient();
    const { data } = await supabase
      .from("at_facility_settlements")
      .select("*")
      .eq("facility_id", f.id)
      .order("period_end", { ascending: false });
    setSettlements((data as FacilitySettlement[]) ?? []);
  }

  async function generarLiquidacion() {
    if (!liquidando) return;
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_generate_facility_settlement", {
      p_facility_id: liquidando.id,
      p_period_start: periodo.start,
      p_period_end: periodo.end,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    abrirLiquidacion(liquidando);
    load();
  }

  async function pagarLiquidacion(id: string) {
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_pay_facility_settlement", { p_settlement_id: id });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (liquidando) abrirLiquidacion(liquidando);
    load();
  }

  if (!esAdmin) {
    return (
      <>
        <PageHeader title="Sedes" />
        <Card>
          <p className="p-6 text-center text-slate-500">
            Afiliar y liquidar CEDIs es una decisión del administrador nacional.
          </p>
        </Card>
      </>
    );
  }

  if (facilities === null) return <Loading label="Cargando sedes…" />;

  return (
    <>
      <PageHeader
        title="Sedes"
        subtitle={`${facilities.length} CEDI(s) — el propio y los afiliados`}
        actions={
          <Button onClick={() => { setCreando(true); setError(null); }}>
            <Plus className="size-4" /> Afiliar CEDI
          </Button>
        }
      />

      {msg && (
        <div className="mb-4 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">{msg}</p>
        </div>
      )}

      <div className="space-y-3">
        {facilities.map((f) => (
          <Card key={f.id}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{f.name}</p>
                  {f.is_default && <Pill label="CEDI Principal" tone="blue" />}
                  <Pill
                    label={f.is_default ? "Sin comisión" : `${(f.commission_bps / 100).toFixed(1)}% de comisión`}
                    tone="slate"
                  />
                  {f.liquidaciones_pendientes > 0 && (
                    <Pill label={`${f.liquidaciones_pendientes} liquidación(es) pendiente(s)`} tone="amber" />
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {f.city} · {f.address}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <UserCog className="size-3.5" />
                    {f.owner_name ?? "Sin administrador asignado"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> {f.mensajeros} mensajero(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="size-3.5" /> {f.guias_totales} guía(s) en total
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                {!f.is_default && (
                  <Button
                    variant="secondary"
                    onClick={() => { setAsignando(f); setCandidatoId(""); setError(null); }}
                  >
                    <UserCog className="size-4" /> Administrador
                  </Button>
                )}
                {!f.is_default && (
                  <Button variant="secondary" onClick={() => abrirLiquidacion(f)}>
                    <Banknote className="size-4" /> Liquidación
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Afiliar CEDI ── */}
      {creando && (
        <Modal title="Afiliar un CEDI nuevo" onClose={() => setCreando(false)}>
          <form onSubmit={crearSede} className="space-y-4">
            <Field label="Nombre">
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="CEDI Cali" className={inputCls} />
            </Field>
            <Field label="Ciudad">
              <input required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Cali" className={inputCls} />
            </Field>
            <Field label="Dirección">
              <input required value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Dirección de la bodega" className={inputCls} />
            </Field>
            <Field label="Teléfono (opcional)">
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Comisión de A Tiempo por entrega (%)">
              <input
                type="number" min="0" max="100" step="0.1" required
                value={form.commission_pct}
                onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
                className={inputCls}
              />
            </Field>
            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            <Button type="submit" disabled={guardando} className="w-full justify-center">
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
              Afiliar CEDI
            </Button>
          </form>
        </Modal>
      )}

      {/* ── Asignar administrador ── */}
      {asignando && (
        <Modal title={`Administrador de ${asignando.name}`} onClose={() => setAsignando(null)}>
          {pendientes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay cuentas pendientes de activación para asignar. La persona debe registrarse
              primero en la app; después aparece aquí.
            </p>
          ) : (
            <>
              <Field label="Cuenta a promover a administrador de CEDI">
                <select value={candidatoId} onChange={(e) => setCandidatoId(e.target.value)} className={inputCls}>
                  <option value="">Selecciona…</option>
                  {pendientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || "(sin nombre)"} {p.phone ? `· ${p.phone}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mb-3 mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                Queda como administrador de {asignando.name}: habilita a sus propios mensajeros y
                ve solo su propia operación.
              </p>
              {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
              <Button disabled={guardando || !candidatoId} onClick={asignar} className="w-full justify-center">
                {guardando && <Loader2 className="size-4 animate-spin" />} Asignar
              </Button>
            </>
          )}
        </Modal>
      )}

      {/* ── Liquidación ── */}
      {liquidando && (
        <Modal title={`Liquidación · ${liquidando.name}`} onClose={() => setLiquidando(null)}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label="Desde">
              <input type="date" value={periodo.start} onChange={(e) => setPeriodo((p) => ({ ...p, start: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Hasta">
              <input type="date" value={periodo.end} onChange={(e) => setPeriodo((p) => ({ ...p, end: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          <Button disabled={guardando} onClick={generarLiquidacion} className="mb-5 w-full justify-center">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            Generar liquidación del periodo
          </Button>

          {settlements === null ? (
            <Loading label="Cargando liquidaciones…" />
          ) : settlements.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Sin liquidaciones todavía.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {settlements.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatDate(s.period_start)} — {formatDate(s.period_end)}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        {s.delivered_count} entrega(s) · bruto {formatCOP(s.gross_amount)} · comisión{" "}
                        {formatCOP(s.commission_amount)}
                      </p>
                      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                        Neto para el CEDI: {formatCOP(s.net_amount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Pill label={s.status === "pagado" ? "Pagado" : "Pendiente"} tone={s.status === "pagado" ? "green" : "amber"} />
                      {s.status === "pendiente" && (
                        <Button variant="secondary" onClick={() => pagarLiquidacion(s.id)} disabled={guardando}>
                          Marcar pagado
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
