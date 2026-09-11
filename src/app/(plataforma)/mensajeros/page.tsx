"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  Eye,
  ShieldAlert,
  ShieldX,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Loading, Empty, Button, Modal, Field, inputCls } from "@/components/ui";
import {
  COURIER_REQUIRED_DOCS,
  COURIER_TYPE_HINTS,
  COURIER_TYPE_LABELS,
  DOC_LABELS,
  DOC_STATUS_COLORS,
  DOC_STATUS_LABELS,
} from "@/lib/constants";
import { signedDocUrl } from "@/lib/courierDocs";
import { formatDateTime } from "@/lib/utils";
import type { CourierDocument, CourierType, Profile, Zone } from "@/lib/types";

export default function CouriersPage() {
  const profile = useProfile();
  const [couriers, setCouriers] = useState<Profile[]>([]);
  const [docs, setDocs] = useState<CourierDocument[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [rechazo, setRechazo] = useState<CourierDocument | null>(null);
  const [motivo, setMotivo] = useState("");
  const [habilitar, setHabilitar] = useState<Profile | null>(null);
  const [form, setForm] = useState({ tipo: "colaborativo" as CourierType, zone_id: "", cupo: "" });
  const [retirar, setRetirar] = useState<Profile | null>(null);
  const [razon, setRazon] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: d }, { data: z }] = await Promise.all([
      supabase.from("at_profiles").select("*").eq("role", "mensajero").order("full_name"),
      supabase.from("at_courier_documents").select("*"),
      supabase.from("at_zones").select("*").eq("active", true).order("sort_order"),
    ]);
    setCouriers((c as Profile[]) ?? []);
    setDocs((d as CourierDocument[]) ?? []);
    setZones((z as Zone[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function llamar(fn: string, args: Record<string, unknown>, despues?: () => void) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    despues?.();
    load();
  }

  async function ver(path: string) {
    const url = await signedDocUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("No se pudo abrir el documento");
  }

  if (!["admin", "coordinador", "admin_cedi"].includes(profile.role)) {
    return (
      <>
        <PageHeader title="Mensajeros" />
        <Card>
          <p className="p-6 text-center text-slate-500 dark:text-slate-400">No tienes acceso a esta sección.</p>
        </Card>
      </>
    );
  }

  if (loading) return <Loading />;

  const porVerificar = couriers.filter((c) => !c.verified_at).length;

  return (
    <>
      <PageHeader
        title="Mensajeros"
        subtitle={
          porVerificar > 0
            ? `${porVerificar} por verificar · ${couriers.length} en total`
            : `${couriers.length} mensajero(s), todos habilitados`
        }
      />

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-center text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {couriers.length === 0 ? (
        <Empty label="Todavía no hay mensajeros registrados." />
      ) : (
        <div className="space-y-3">
          {couriers.map((c) => {
            const tipo: CourierType = c.courier_type ?? "colaborativo";
            const requeridos = COURIER_REQUIRED_DOCS[tipo];
            const suyos = docs.filter((d) => d.courier_id === c.id);
            const aprobados = requeridos.filter(
              (t) => suyos.find((d) => d.doc_type === t)?.status === "aprobado"
            ).length;
            const listo = aprobados === requeridos.length;
            const expandido = abierto === c.id;

            return (
              <Card key={c.id}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={() => setAbierto(expandido ? null : c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{c.full_name}</p>
                      <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
                        {COURIER_TYPE_LABELS[tipo]}
                      </span>
                      {c.verified_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <BadgeCheck className="size-3" /> Habilitado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          <ShieldAlert className="size-3" /> Sin habilitar
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {c.phone ?? "Sin teléfono"} · Documentos obligatorios aprobados: {aprobados}/
                      {requeridos.length}
                    </p>
                  </button>

                  <div className="flex shrink-0 gap-2">
                    {c.verified_at ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRetirar(c);
                          setRazon("");
                        }}
                      >
                        <ShieldX className="size-4" /> Retirar
                      </Button>
                    ) : (
                      <Button
                        disabled={!listo}
                        title={listo ? undefined : "Faltan documentos por aprobar"}
                        onClick={() => {
                          setHabilitar(c);
                          setForm({
                            tipo,
                            zone_id: c.zone_id ?? "",
                            cupo: c.max_capacity ? String(c.max_capacity) : "",
                          });
                        }}
                      >
                        <BadgeCheck className="size-4" /> Habilitar
                      </Button>
                    )}
                  </div>
                </div>

                {expandido && (
                  <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                    {suyos.length === 0 ? (
                      <p className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        Todavía no ha subido ningún documento.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {suyos.map((d) => (
                          <li
                            key={d.id}
                            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-900 dark:text-white">
                                  {DOC_LABELS[d.doc_type]}
                                </span>
                                {requeridos.includes(d.doc_type) && (
                                  <span className="text-[11px] text-slate-400">Obligatorio</span>
                                )}
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                    DOC_STATUS_COLORS[d.status]
                                  }`}
                                >
                                  {DOC_STATUS_LABELS[d.status]}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Subido {formatDateTime(d.uploaded_at)}
                                {d.expires_on && ` · vence ${d.expires_on}`}
                                {d.review_notes && ` · ${d.review_notes}`}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button
                                onClick={() => ver(d.file_path)}
                                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
                              >
                                <Eye className="size-4" /> Ver
                              </button>
                              {d.status !== "aprobado" && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    llamar("at_review_courier_doc", {
                                      p_doc_id: d.id,
                                      p_approved: true,
                                      p_notes: null,
                                    })
                                  }
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                  <Check className="size-4" /> Aprobar
                                </button>
                              )}
                              {d.status !== "rechazado" && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setRechazo(d);
                                    setMotivo("");
                                  }}
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-600 disabled:opacity-60"
                                >
                                  <X className="size-4" /> Rechazar
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {rechazo && (
        <Modal title={`Rechazar ${DOC_LABELS[rechazo.doc_type]}`} onClose={() => setRechazo(null)}>
          <Field label="¿Por qué se rechaza?">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: la foto está borrosa y no se lee el número."
              className={inputCls}
            />
          </Field>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            El mensajero recibe este mensaje y puede volver a subir el documento corregido.
          </p>
          <Button
            disabled={busy || !motivo.trim()}
            onClick={() =>
              llamar(
                "at_review_courier_doc",
                { p_doc_id: rechazo.id, p_approved: false, p_notes: motivo },
                () => setRechazo(null)
              )
            }
          >
            Rechazar documento
          </Button>
        </Modal>
      )}

      {habilitar && (
        <Modal title={`Habilitar a ${habilitar.full_name}`} onClose={() => setHabilitar(null)}>
          <Field label="Tipo de mensajero">
            <select
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as CourierType }))}
              className={inputCls}
            >
              {(["corporativo", "colaborativo"] as CourierType[]).map((t) => (
                <option key={t} value={t}>
                  {COURIER_TYPE_LABELS[t]} — {COURIER_TYPE_HINTS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zona asignada (opcional)">
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
          <Field label="Cupo de entregas por día (opcional)">
            <input
              type="number"
              min="1"
              value={form.cupo}
              onChange={(e) => setForm((f) => ({ ...f, cupo: e.target.value }))}
              placeholder="Ej: 25"
              className={inputCls}
            />
          </Field>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Si cambias el tipo a colaborativo se le exigen también tarjeta de propiedad y SOAT; si
            no están aprobados, la base rechazará la habilitación.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              llamar(
                "at_verify_courier",
                {
                  p_courier_id: habilitar.id,
                  p_courier_type: form.tipo,
                  p_zone_id: form.zone_id || null,
                  p_max_capacity: form.cupo ? Number(form.cupo) : null,
                },
                () => setHabilitar(null)
              )
            }
          >
            Habilitar mensajero
          </Button>
        </Modal>
      )}

      {retirar && (
        <Modal title={`Retirar habilitación de ${retirar.full_name}`} onClose={() => setRetirar(null)}>
          <Field label="Motivo">
            <textarea
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              rows={3}
              placeholder="Ej: se le venció el SOAT."
              className={inputCls}
            />
          </Field>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            No se borra nada: conserva su historial y sus documentos, solo deja de recibir trabajo
            hasta que lo habilites de nuevo.
          </p>
          <Button
            disabled={busy || !razon.trim()}
            onClick={() =>
              llamar(
                "at_revoke_courier",
                { p_courier_id: retirar.id, p_reason: razon },
                () => setRetirar(null)
              )
            }
          >
            Retirar habilitación
          </Button>
        </Modal>
      )}
    </>
  );
}
