"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  BadgeCheck,
  Check,
  Clock,
  Eye,
  Facebook,
  FileUp,
  Instagram,
  LoaderCircle,
  MessageCircle,
  Music2,
  ShieldAlert,
  ShieldCheck,
  SquareArrowOutUpRight,
  TriangleAlert,
  X as IconoX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { PageHeader, Card, Field, Loading, inputCls } from "@/components/ui";
import { reabrirPermisosTurno } from "@/components/PermisosTurno";
import {
  COURIER_DOCS,
  COURIER_REQUIRED_DOCS,
  COURIER_TYPE_HINTS,
  COURIER_TYPE_LABELS,
  DOC_LABELS,
  DOC_STATUS_COLORS,
  DOC_STATUS_LABELS,
  ROLE_LABELS,
  SOCIAL_PLATFORMS,
} from "@/lib/constants";
import { signedDocUrl, uploadCourierDoc } from "@/lib/courierDocs";
import { formatDateTime } from "@/lib/utils";
import type { CourierDocument, CourierType, DocType, SocialPlatform } from "@/lib/types";

const ICONO_RED: Record<SocialPlatform, typeof Instagram> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  x: IconoX,
};

/**
 * La red social, para cualquier rol — cliente, asesor, mensajero, CEDI,
 * administrador. Aparte del resto de la pantalla, que sigue siendo solo del
 * mensajero, porque esto no tiene nada que ver con documentos ni
 * habilitación: es un dato de contacto que cada quien elige mostrar o no.
 */
function TuRedSocial() {
  const profile = useProfile();
  const [plataforma, setPlataforma] = useState<SocialPlatform | "">(
    profile.social_platform ?? ""
  );
  const [handle, setHandle] = useState(profile.social_handle ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hint = plataforma ? SOCIAL_PLATFORMS.find((p) => p.value === plataforma)?.hint : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("at_profiles")
        .update({
          social_platform: plataforma || null,
          social_handle: plataforma ? handle.trim() || null : null,
        })
        .eq("id", profile.id);
      if (error) throw error;
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="mb-4">
      <form onSubmit={guardar} className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ff812c]/10 text-[#ff812c]">
            {plataforma ? (() => {
              const Icono = ICONO_RED[plataforma];
              return <Icono className="size-5" />;
            })() : (
              <Instagram className="size-5" />
            )}
          </span>
          <div>
            <p className="font-semibold text-slate-900">Tu red social</p>
            <p className="text-sm text-slate-500">
              La que elijas queda en tu perfil. Es opcional.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Red">
            <select
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value as SocialPlatform | "")}
              className={`${inputCls} appearance-none cursor-pointer`}
            >
              <option value="">Ninguna</option>
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={plataforma ? (hint ?? "Usuario o enlace") : "Usuario o enlace"}>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              disabled={!plataforma}
              placeholder={hint ?? "Elige una red primero"}
              className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={guardando}
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff812c] px-4 text-sm font-bold text-[#1C1C1E] active:scale-[0.98] disabled:opacity-60"
        >
          {guardando ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : guardado ? (
            <Check className="size-4" />
          ) : null}
          {guardado ? "Guardado" : "Guardar"}
        </button>
      </form>
    </Card>
  );
}

export default function MyProfilePage() {
  const profile = useProfile();
  const esMensajero = profile.role === "mensajero";
  const [docs, setDocs] = useState<CourierDocument[]>([]);
  const [loading, setLoading] = useState(esMensajero);
  const [busy, setBusy] = useState<DocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // El tipo lo fija el admin al habilitar; mientras tanto es colaborativo, que
  // es lo que exige más papeles. Así nunca se le piden menos de los debidos.
  const tipo: CourierType = profile.courier_type ?? "colaborativo";
  const requeridos = COURIER_REQUIRED_DOCS[tipo];

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("at_courier_documents")
      .select("*")
      .eq("courier_id", profile.id);
    setDocs((data as CourierDocument[]) ?? []);
    setLoading(false);
  }, [profile.id]);

  // Los documentos son solo del mensajero — nadie más los tiene, así que nadie
  // más necesita esta consulta.
  useEffect(() => {
    if (esMensajero) load();
  }, [load, esMensajero]);

  async function handleFile(docType: DocType, file: File) {
    setError(null);
    setBusy(docType);
    try {
      await uploadCourierDoc(profile.id, docType, file, expiry[docType]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el documento");
    } finally {
      setBusy(null);
    }
  }

  async function verDocumento(path: string) {
    const url = await signedDocUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("No se pudo abrir el documento");
  }

  const porTipo = new Map(docs.map((d) => [d.doc_type, d]));
  const faltantes = requeridos.filter((t) => porTipo.get(t)?.status !== "aprobado");
  const habilitado = Boolean(profile.verified_at);

  // Los obligatorios primero: es lo que le desbloquea el trabajo.
  const ordenados = [...COURIER_DOCS].sort((a, b) => {
    const ra = requeridos.includes(a.value) ? 0 : 1;
    const rb = requeridos.includes(b.value) ? 0 : 1;
    return ra - rb;
  });

  return (
    <>
      <PageHeader
        title="Mi perfil"
        subtitle={
          esMensajero
            ? `${COURIER_TYPE_LABELS[tipo]} · ${COURIER_TYPE_HINTS[tipo]}`
            : `${profile.full_name} · ${ROLE_LABELS[profile.role]}`
        }
      />

      <TuRedSocial />

      {/* El resto de la pantalla —documentos, habilitación, permisos del
          turno— es solo del mensajero: son cosas que no existen para los
          demás roles. Quien no lo sea ya vio lo suyo arriba y termina aquí. */}
      {!esMensajero ? null : loading ? (
        <Loading />
      ) : (
        <>
      {habilitado ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              Estás habilitado para trabajar
            </p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Tus documentos fueron aprobados el {formatDateTime(profile.verified_at!)}. Mantenlos
              al día: si se te vence el SOAT o la licencia, se suspende la habilitación.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Todavía no puedes recibir entregas
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {faltantes.length > 0
                ? `Falta que apruebe${faltantes.length > 1 ? "n" : ""}: ${faltantes
                    .map((t) => DOC_LABELS[t])
                    .join(", ")}.`
                : "Ya subiste todo. Un administrador está revisando tus documentos."}
            </p>
          </div>
        </div>
      )}

      {/* Único sitio de la app, aparte del primer arranque, donde se puede
          volver a ver el diálogo de permisos. Antes de esto, quien ya lo
          había resuelto una vez —o probaba con otro rol— no tenía forma de
          revisarlo: ni de confirmar que quedó bien, ni de reintentarlo si lo
          había bloqueado sin querer. */}
      <Card className="mb-4">
        <button
          type="button"
          onClick={() => reabrirPermisosTurno()}
          className="flex w-full items-center gap-3 p-4 text-left active:opacity-70"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ff812c]/10 text-[#ff812c]">
            <ShieldCheck className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">
              Permisos del turno
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ubicación y pantalla encendida. Tócalo para revisarlos o volver a concederlos.
            </p>
          </span>
        </button>
      </Card>

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-center text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {ordenados.map((doc) => {
          const actual = porTipo.get(doc.value);
          const obligatorio = requeridos.includes(doc.value);
          const subiendo = busy === doc.value;

          return (
            <Card key={doc.value}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">{doc.label}</p>
                    {obligatorio ? (
                      <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300">
                        Obligatorio
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Opcional</span>
                    )}
                    {actual && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          DOC_STATUS_COLORS[actual.status]
                        }`}
                      >
                        {DOC_STATUS_LABELS[actual.status]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{doc.hint}</p>

                  {actual?.status === "rechazado" && actual.review_notes && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-rose-600 dark:text-rose-400">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>{actual.review_notes} — vuelve a subirlo corregido.</span>
                    </p>
                  )}
                  {actual?.status === "pendiente" && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                      <Clock className="size-4 shrink-0" />
                      Subido el {formatDateTime(actual.uploaded_at)}
                    </p>
                  )}

                  {/* Papeles que no se tienen en el cajón: hay que ir a
                      sacarlos. Sin el enlace, «certificado de medidas
                      correctivas» es una tarea sin instrucciones, y el
                      mensajero se queda esperando a que alguien le explique. */}
                  {doc.tramite && !actual && (
                    <a
                      href={doc.tramite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#ff812c] px-4 text-sm font-bold text-[#ff812c] active:scale-[0.98]"
                    >
                      <SquareArrowOutUpRight className="size-4" />
                      {doc.tramite.label}
                    </a>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {doc.expires && (
                    <input
                      type="date"
                      aria-label={`Vence el — ${doc.label}`}
                      value={expiry[doc.value] ?? actual?.expires_on ?? ""}
                      onChange={(e) =>
                        setExpiry((x) => ({ ...x, [doc.value]: e.target.value }))
                      }
                      className={`${inputCls} w-[150px]`}
                    />
                  )}
                  {actual && (
                    <button
                      onClick={() => verDocumento(actual.file_path)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200"
                    >
                      <Eye className="size-4" /> Ver
                    </button>
                  )}
                  <input
                    ref={(el) => {
                      inputs.current[doc.value] = el;
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(doc.value, f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => inputs.current[doc.value]?.click()}
                    disabled={subiendo}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff812c] px-4 text-sm font-bold text-[#1C1C1E] active:scale-[0.98] disabled:opacity-60"
                  >
                    {subiendo ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <FileUp className="size-4" />
                    )}
                    {actual ? "Reemplazar" : "Subir"}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
        </>
      )}
    </>
  );
}
