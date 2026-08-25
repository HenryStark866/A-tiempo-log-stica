"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  Check,
  Eye,
  FileStack,
  Loader2,
  Package,
  Plus,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Button, Modal, Field, inputCls } from "@/components/ui";
import { Pill } from "@/components/StatusBadge";
import { TarifarioMatriz } from "@/components/TarifarioMatriz";
import { FACILITY_DOCS, FACILITY_DOC_LABELS } from "@/lib/constants";
import { signedFacilityDocUrl } from "@/lib/facilityDocs";
import { formatCOP, formatDate, formatDateTime } from "@/lib/utils";
import { hoyEnColombia, primerDiaDelMes } from "@/lib/tiempo";
import { CIUDADES_OPERADAS } from "@/lib/zones";
import type { Profile, SolicitudCedi } from "@/lib/types";

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

  const [solicitudes, setSolicitudes] = useState<SolicitudCedi[] | null>(null);
  const [revisando, setRevisando] = useState<SolicitudCedi | null>(null);
  const [comisionAprobar, setComisionAprobar] = useState("10");
  const [rechazoDoc, setRechazoDoc] = useState<{ id: string; label: string } | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");

  const load = useCallback(async () => {
    if (!esAdmin) return;
    const supabase = createClient();
    const [{ data: f }, { data: p }, { data: s }] = await Promise.all([
      supabase.rpc("at_list_facilities"),
      supabase.from("at_profiles").select("*").eq("role", "pendiente").order("full_name"),
      supabase.rpc("at_list_solicitudes_cedi"),
    ]);
    setFacilities((f as FacilityRow[]) ?? []);
    // Un CEDI afiliado también queda 'pendiente' hasta aprobarse, pero no es
    // candidato a "asignar administrador" de otra sede — ya está pidiendo la
    // suya propia. Se filtra de esa lista para no ofrecerlo dos veces.
    setPendientes(
      ((p as Profile[]) ?? []).filter((x) => x.requested_role !== "admin_cedi")
    );
    setSolicitudes((s as SolicitudCedi[]) ?? []);
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

  async function verDocumento(path: string) {
    const url = await signedFacilityDocUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("No se pudo abrir el documento");
  }

  async function aprobarDocumento(docId: string) {
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_review_facility_doc", {
      p_doc_id: docId,
      p_approved: true,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
    // Refresca la solicitud abierta con el estado nuevo del documento.
    setRevisando((r) => {
      if (!r) return r;
      const s = (solicitudes ?? []).find((x) => x.id === r.id);
      return s ?? r;
    });
  }

  async function rechazarDocumento() {
    if (!rechazoDoc || !motivoRechazo.trim()) return;
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_review_facility_doc", {
      p_doc_id: rechazoDoc.id,
      p_approved: false,
      p_notes: motivoRechazo.trim(),
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRechazoDoc(null);
    setMotivoRechazo("");
    await load();
    setRevisando((r) => {
      if (!r) return r;
      const s = (solicitudes ?? []).find((x) => x.id === r.id);
      return s ?? r;
    });
  }

  async function aprobarSolicitud() {
    if (!revisando) return;
    setError(null);
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_aprobar_solicitud_cedi", {
      p_profile_id: revisando.id,
      p_commission_bps: Math.round(Number(comisionAprobar || 0) * 100),
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMsg(`${revisando.business_name} ya está activo, con zonas de arranque en ${revisando.proposed_city}.`);
    setRevisando(null);
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
          <p className="p-6 text-center text-slate-500 dark:text-slate-400">
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

      {/* ── Solicitudes de CEDI ── */}
      {solicitudes && solicitudes.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <FileStack className="size-4" /> Solicitudes de CEDI ({solicitudes.length})
          </h2>
          <div className="space-y-3">
            {solicitudes.map((s) => {
              const aprobados = s.documentos.filter((d) => d.status === "aprobado").length;
              return (
                <Card key={s.id}>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {s.business_name || "(sin nombre)"}
                        </p>
                        <Pill
                          label={`${aprobados}/${FACILITY_DOCS.length} documento(s) aprobados`}
                          tone={aprobados === FACILITY_DOCS.length ? "green" : "amber"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {s.proposed_city} · {s.business_address}
                      </p>
                      <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                        {s.full_name} {s.phone ? `· ${s.phone}` : ""} · pidió el {formatDateTime(s.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => { setRevisando(s); setComisionAprobar("10"); setError(null); }}
                    >
                      <FileStack className="size-4" /> Revisar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tarifario ── */}
      <div className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Banknote className="size-4" /> Precios del domicilio por par de zonas
        </h2>
        <TarifarioMatriz />
      </div>

      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Sedes activas
      </h2>
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
            <Field label="Ciudad / Municipio">
              <div className="flex gap-2">
                <select
                  value={CIUDADES_OPERADAS.includes(form.city) ? form.city : "Otra ciudad"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== "Otra ciudad") {
                      setForm((f) => ({ ...f, city: val }));
                    } else {
                      setForm((f) => ({ ...f, city: "" }));
                    }
                  }}
                  className={inputCls}
                >
                  <option value="" disabled>Seleccionar municipio...</option>
                  {CIUDADES_OPERADAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {!CIUDADES_OPERADAS.includes(form.city) && (
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Nombre del municipio"
                    className={inputCls}
                  />
                )}
              </div>
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

      {/* ── Revisar solicitud de CEDI ── */}
      {revisando && (
        <Modal title={`Solicitud de ${revisando.business_name || "CEDI"}`} onClose={() => setRevisando(null)}>
          <p className="mb-4 text-[13px] text-slate-500 dark:text-slate-400">
            {revisando.full_name} {revisando.phone ? `· ${revisando.phone}` : ""} · {revisando.proposed_city}
            {" · "}
            {revisando.business_address}
          </p>

          <div className="mb-5 space-y-2">
            {FACILITY_DOCS.map((doc) => {
              const actual = revisando.documentos.find((d) => d.doc_type === doc.value);
              return (
                <div
                  key={doc.value}
                  className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {FACILITY_DOC_LABELS[doc.value]}
                      </p>
                      {actual ? (
                        <Pill
                          label={
                            actual.status === "aprobado"
                              ? "Aprobado"
                              : actual.status === "rechazado"
                                ? "Rechazado"
                                : "En revisión"
                          }
                          tone={actual.status === "aprobado" ? "green" : actual.status === "rechazado" ? "red" : "amber"}
                        />
                      ) : (
                        <Pill label="Sin subir" tone="slate" />
                      )}
                    </div>
                    {actual?.review_notes && (
                      <p className="mt-1 text-[12px] text-rose-600 dark:text-rose-400">{actual.review_notes}</p>
                    )}
                  </div>
                  {actual && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => verDocumento(actual.file_path)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        <Eye className="size-3.5" /> Ver
                      </button>
                      {actual.status !== "aprobado" && (
                        <button
                          disabled={guardando}
                          onClick={() => aprobarDocumento(actual.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          <Check className="size-3.5" /> Aprobar
                        </button>
                      )}
                      {actual.status !== "rechazado" && (
                        <button
                          disabled={guardando}
                          onClick={() => { setRechazoDoc({ id: actual.id, label: FACILITY_DOC_LABELS[doc.value] }); setMotivoRechazo(""); }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-600 disabled:opacity-60"
                        >
                          <X className="size-3.5" /> Rechazar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Field label="Comisión de A Tiempo por entrega (%)">
            <input
              type="number" min="0" max="100" step="0.1"
              value={comisionAprobar}
              onChange={(e) => setComisionAprobar(e.target.value)}
              className={inputCls}
            />
          </Field>
          <p className="mb-3 mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            Al aprobar se crea la sede, se le generan zonas de arranque copiando el tarifario de
            Medellín para {revisando.proposed_city || "su ciudad"}, y la cuenta pasa a administrarla.
          </p>
          {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          <Button
            disabled={guardando || revisando.documentos.filter((d) => d.status === "aprobado").length < FACILITY_DOCS.length}
            onClick={aprobarSolicitud}
            className="w-full justify-center"
          >
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
            Aprobar solicitud y crear el CEDI
          </Button>
          {revisando.documentos.filter((d) => d.status === "aprobado").length < FACILITY_DOCS.length && (
            <p className="mt-2 text-center text-[12px] text-slate-400">
              Aprueba los 5 documentos para poder activar la solicitud.
            </p>
          )}
        </Modal>
      )}

      {/* ── Rechazar un documento de la solicitud ── */}
      {rechazoDoc && (
        <Modal title={`Rechazar ${rechazoDoc.label}`} onClose={() => setRechazoDoc(null)}>
          <Field label="¿Por qué se rechaza?">
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder="Ej: la foto está borrosa y no se lee la dirección."
              className={inputCls}
            />
          </Field>
          <p className="mb-3 mt-2 text-sm text-slate-500 dark:text-slate-400">
            Quien solicita recibe este mensaje y puede volver a subir el documento corregido.
          </p>
          <Button disabled={guardando || !motivoRechazo.trim()} onClick={rechazarDocumento} className="w-full justify-center">
            Rechazar documento
          </Button>
        </Modal>
      )}
    </>
  );
}
