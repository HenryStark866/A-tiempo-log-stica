"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  ExternalLink,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Button, Modal, Field, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { GuiaQR } from "@/components/GuiaQR";
import { GUIDE_STATUS_LABELS, OPS_ROLES } from "@/lib/constants";
import { formatCOP, formatDateTime } from "@/lib/utils";
import { uploadDeliveryEvidence } from "@/lib/evidence";
import type { Guide, GuideEvent, GuideStatus, Profile, Zone } from "@/lib/types";

// Acciones disponibles según estado y rol (la BD valida de nuevo en el RPC)
function actionsFor(guide: Guide, role: string, userId: string) {
  const acts: { to: GuideStatus; label: string; needsNote?: boolean; needsEvidence?: boolean }[] = [];
  const isOps = OPS_ROLES.includes(role as never);
  const isOp = role === "operario" || isOps;
  const isMyCourier = role === "mensajero" && guide.courier_id === userId;

  switch (guide.status) {
    case "creada":
      if (isOp) acts.push({ to: "recogida", label: "Marcar recogida (digitalizada)" });
      if (isOps) acts.push({ to: "cancelada", label: "Cancelar guía", needsNote: true });
      break;
    case "recogida":
      if (isOp) acts.push({ to: "en_cedi", label: "Recibir en CEDI" });
      break;
    case "zonificada":
      if (isMyCourier || isOps) acts.push({ to: "en_ruta", label: "Iniciar ruta" });
      break;
    case "en_ruta":
      if (isMyCourier || isOps) {
        acts.push({ to: "entregada", label: "Marcar entregada", needsEvidence: true });
        acts.push({ to: "novedad", label: "Reportar novedad", needsNote: true });
      }
      break;
    case "en_devolucion":
      if (isOp) acts.push({ to: "devuelta", label: "Confirmar devolución al e-commerce" });
      break;
  }
  return acts;
}

export default function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfile();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [events, setEvents] = useState<GuideEvent[]>([]);
  const [couriers, setCouriers] = useState<Profile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [noteModal, setNoteModal] = useState<{ to: GuideStatus; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assign, setAssign] = useState({ courier_id: "", zone_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: g } = await supabase
      .from("at_guides")
      .select(
        "*, at_clients(business_name), at_zones(name), courier:at_profiles!at_guides_courier_id_fkey(full_name)"
      )
      .eq("id", id)
      .single();
    setGuide(g as Guide);
    const { data: ev } = await supabase
      .from("at_guide_events")
      .select("*, actor:at_profiles(full_name)")
      .eq("guide_id", id)
      .order("created_at", { ascending: false });
    setEvents((ev as GuideEvent[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
    const supabase = createClient();
    supabase
      .from("at_profiles")
      .select("*")
      .eq("role", "mensajero")
      .eq("active", true)
      .then(({ data }) => setCouriers((data as Profile[]) ?? []));
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, [load]);

  async function changeStatus(to: GuideStatus, withNote?: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: id,
      p_new_status: to,
      p_note: withNote || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNoteModal(null);
    setNote("");
    load();
  }

  async function confirmDelivery() {
    setBusy(true);
    setError(null);
    try {
      let evidenceUrl: string | null = null;
      if (evidenceFile) {
        setUploading(true);
        evidenceUrl = await uploadDeliveryEvidence(id, evidenceFile);
        setUploading(false);
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("at_confirm_delivery", {
        p_guide_id: id,
        p_evidence_url: evidenceUrl,
        p_signature_name: signatureName || null,
        p_note: note || null,
      });
      if (error) {
        setError(error.message);
      } else {
        setDeliveryModal(false);
        setNote("");
        setSignatureName("");
        setEvidenceFile(null);
        load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la evidencia");
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  async function processReturn() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_process_return", { p_guide_id: id });
    setBusy(false);
    if (error) setError(error.message);
    else load();
  }

  async function assignCourier() {
    if (!assign.courier_id) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_assign_courier", {
      p_guide_id: id,
      p_courier_id: assign.courier_id,
      p_zone_id: assign.zone_id || null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else load();
  }

  async function handleDeleteGuide() {
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_delete_guide", { p_guide_id: id });
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
    } else {
      router.replace("/guias");
    }
  }

  if (!guide) return <Loading />;

  const esCliente = profile.role === "cliente";
  const canEditDelete = esCliente && guide.status === "creada";
  const acts = actionsFor(guide, profile.role, profile.id);
  const canAssign =
    ["en_cedi", "reprogramada"].includes(guide.status) &&
    ["admin", "coordinador", "operario"].includes(profile.role);
  const canProcessReturn =
    guide.status === "novedad" &&
    ["admin", "coordinador", "operario"].includes(profile.role);

  return (
    <>
      <PageHeader
        title={guide.guide_number}
        subtitle={`Cliente: ${guide.at_clients?.business_name ?? "—"}`}
        actions={
          <>
            <Link
              href={`/rastreo/${guide.guide_number}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
            >
              Rastreo público <ExternalLink className="size-3.5" />
            </Link>
            {canEditDelete && (
              <>
                <Link href={`/guias/${id}/editar`}>
                  <Button variant="secondary">
                    <Pencil className="size-4" /> Editar
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
                >
                  <Trash2 className="size-4" /> Eliminar
                </Button>
              </>
            )}
            <Link href="/guias">
              <Button variant="secondary">
                <ArrowLeft className="size-4" /> Volver
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-bold text-navy-900">Información del envío</h2>
              <StatusBadge status={guide.status} large />
            </div>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Destinatario</dt>
                <dd className="font-medium text-navy-900">{guide.recipient_name}</dd>
                <dd className="text-slate-500">{guide.recipient_phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Dirección</dt>
                <dd className="font-medium text-navy-900">{guide.recipient_address}</dd>
                <dd className="text-slate-500">
                  {guide.recipient_city} · Zona {guide.at_zones?.name ?? "sin asignar"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Contraentrega</dt>
                <dd className="font-medium text-navy-900">
                  {guide.is_cod ? formatCOP(guide.cod_amount) : "No aplica"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Mensajero</dt>
                <dd className="font-medium text-navy-900">
                  {guide.courier?.full_name ?? "Sin asignar"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Intentos de entrega</dt>
                <dd className="font-medium text-navy-900">{guide.delivery_attempts} / 2</dd>
              </div>
              {guide.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Notas</dt>
                  <dd className="text-slate-700">{guide.notes}</dd>
                </div>
              )}
              {(guide.delivery_evidence_url || guide.delivery_signature_name) && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-400">Evidencia de entrega</dt>
                  {guide.delivery_signature_name && (
                    <dd className="font-medium text-navy-900">Recibió: {guide.delivery_signature_name}</dd>
                  )}
                  {guide.delivery_evidence_url && (
                    <dd>
                      <a
                        href={guide.delivery_evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
                      >
                        Ver foto <ExternalLink className="size-3.5" />
                      </a>
                    </dd>
                  )}
                </div>
              )}
            </dl>
          </Card>

          {(acts.length > 0 || canAssign || canProcessReturn) && (
            <Card className="p-6">
              <h2 className="mb-4 font-bold text-navy-900">Acciones</h2>

              {canAssign && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-700">
                    Picking y zonificación (Fase 3): asignar mensajero
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={assign.courier_id}
                      onChange={(e) => setAssign((a) => ({ ...a, courier_id: e.target.value }))}
                      className={inputCls + " w-auto flex-1"}
                    >
                      <option value="">Mensajero…</option>
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={assign.zone_id}
                      onChange={(e) => setAssign((a) => ({ ...a, zone_id: e.target.value }))}
                      className={inputCls + " w-auto flex-1"}
                    >
                      <option value="">Zona (opcional)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                    <Button onClick={assignCourier} disabled={busy || !assign.courier_id}>
                      Asignar
                    </Button>
                  </div>
                </div>
              )}

              {canProcessReturn && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-1 text-sm font-semibold text-amber-800">
                    Retorno de novedad al CEDI (Fases 8-9)
                  </p>
                  <p className="mb-3 text-sm text-amber-700">
                    Intento {guide.delivery_attempts} de 2.{" "}
                    {guide.delivery_attempts >= 2
                      ? "Pasará a logística inversa (devolución al e-commerce)."
                      : "Se reprogramará para un nuevo despacho."}
                  </p>
                  <Button onClick={processReturn} disabled={busy}>
                    Procesar retorno
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {acts.map((a) => (
                  <Button
                    key={a.to}
                    variant={a.to === "cancelada" || a.to === "novedad" ? "danger" : "primary"}
                    disabled={busy}
                    onClick={() =>
                      a.needsEvidence
                        ? setDeliveryModal(true)
                        : a.needsNote
                        ? setNoteModal({ to: a.to, label: a.label })
                        : changeStatus(a.to)
                    }
                  >
                    {a.label}
                  </Button>
                ))}
              </div>

              {error && (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Card>
          )}
          <GuiaQR
            guideNumber={guide.guide_number}
            paymentToken={guide.payment_token}
            isCod={guide.is_cod}
            codAmount={guide.cod_amount}
          />
        </div>

        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-5 font-bold text-navy-900">Línea de tiempo</h2>
          <ol>
            {events.map((ev, i) => (
              <li key={ev.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < events.length - 1 && (
                  <span className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />
                )}
                {i === 0 ? (
                  <CheckCircle2 className="relative z-10 size-5 shrink-0 text-brand-500" />
                ) : (
                  <Circle className="relative z-10 size-5 shrink-0 fill-white text-slate-300" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-900">
                    {GUIDE_STATUS_LABELS[ev.status]}
                  </p>
                  {ev.note && <p className="text-sm text-slate-600">{ev.note}</p>}
                  <p className="text-xs text-slate-400">
                    {formatDateTime(ev.created_at)}
                    {ev.actor?.full_name ? ` · ${ev.actor.full_name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {noteModal && (
        <Modal title={noteModal.label} onClose={() => setNoteModal(null)}>
          <Field label="Motivo / nota">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Ej: destinatario ausente, dirección errada…"
            />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNoteModal(null)}>
              Cancelar
            </Button>
            <Button disabled={busy || !note.trim()} onClick={() => changeStatus(noteModal.to, note)}>
              Confirmar
            </Button>
          </div>
        </Modal>
      )}

      {deliveryModal && guide && (
        <Modal
          title="Confirmar entrega"
          onClose={() => {
            setDeliveryModal(false);
            setEvidenceFile(null);
            setSignatureName("");
            setNote("");
          }}
        >
          {guide.is_cod && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Contraentrega: la foto de evidencia es obligatoria. Recaudo {formatCOP(guide.cod_amount)}.
            </p>
          )}
          <Field label={`Foto de evidencia ${guide.is_cod ? "*" : "(opcional)"}`}>
            <label className={inputCls + " flex items-center gap-2 cursor-pointer"}>
              <Camera className="size-4 shrink-0 text-brand-600" />
              <span className="truncate">{evidenceFile ? evidenceFile.name : "Adjuntar foto del paquete entregado"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </Field>
          <Field label="Nombre de quien recibe (opcional)">
            <input
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              className={inputCls}
              placeholder="Ej: Carlos Restrepo (portero)"
            />
          </Field>
          <Field label="Observación (opcional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDeliveryModal(false);
                setEvidenceFile(null);
                setSignatureName("");
                setNote("");
              }}
            >
              Cancelar
            </Button>
            <Button disabled={busy || (guide.is_cod && !evidenceFile)} onClick={confirmDelivery}>
              {uploading ? "Subiendo…" : "Confirmar"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal eliminar guía */}
      {showDeleteModal && guide && (
        <Modal
          title="Eliminar guía"
          onClose={() => setShowDeleteModal(false)}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{guide.guide_number}</p>
              <p className="text-sm text-slate-500">Destinatario: {guide.recipient_name}</p>
            </div>
          </div>
          <p className="text-sm text-slate-700 mb-4">
            ¿Seguro que quieres eliminar esta guía? Esta acción no se puede deshacer.
          </p>
          {deleteError && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteGuide} disabled={deleting}>
              {deleting ? "Eliminando…" : "Confirmar eliminación"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
