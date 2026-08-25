"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, LoaderCircle, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signedDocUrl } from "@/lib/courierDocs";
import { DOC_LABELS, DOC_STATUS_COLORS, DOC_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { FichaUsuario as Ficha } from "@/lib/types";

/**
 * La ficha completa de un usuario, para cuando llama a pedir ayuda.
 *
 * Junta en una sola pantalla lo que estaba en tres sitios y uno de ellos era
 * inaccesible: el perfil (at_profiles), la cuenta de acceso (auth.users, que
 * solo se puede leer por RPC) y sus documentos.
 *
 * Sobre la contraseña: no se muestra porque no se puede. auth.users guarda un
 * hash bcrypt —una huella irreversible—, no la clave. Ni el admin, ni Supabase,
 * ni nosotros podemos leerla. Lo que resuelve el problema real de soporte
 * («no me deja entrar») es mandarle a la persona un enlace para que ponga una
 * nueva, y eso es el botón de abajo.
 */
export function FichaUsuario({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_admin_ficha_usuario", { p_user_id: userId });
    if (error) setError(error.message);
    else setFicha(data as Ficha);
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function mandarEnlaceDeClave() {
    const correo = ficha?.cuenta.email;
    if (!correo) return;
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: `${window.location.origin}/auth/confirmar?next=/nueva-clave`,
    });
    setEnviando(false);
    if (error) setError(error.message);
    else setAviso(`Le mandamos el enlace a ${correo}. Vence en una hora.`);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Copiado");
    } catch {
      setAviso(texto);
    }
  }

  async function verDocumento(path: string) {
    const url = await signedDocUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("No se pudo abrir el documento");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl atl-relleno shadow-2xl  sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-900/[0.06] px-5 py-4 dark:border-white/[0.08]">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-slate-900 dark:text-white">
              {ficha?.perfil.full_name || "Ficha del usuario"}
            </h2>
            {ficha && (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                {ROLE_LABELS[ficha.perfil.role]}
                {ficha.comercio ? ` · ${ficha.comercio.business_name}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-slate-500 dark:bg-gray-700"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
              <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}
          {aviso && (
            <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
              <p className="text-[14px] text-emerald-700 dark:text-emerald-400">{aviso}</p>
            </div>
          )}

          {!ficha && !error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
              <LoaderCircle className="size-5 animate-spin" /> Cargando la ficha…
            </div>
          ) : ficha ? (
            <>
              <Bloque titulo="Cuenta de acceso">
                <Dato
                  etiqueta="Correo"
                  valor={ficha.cuenta.email ?? "—"}
                  accion={
                    ficha.cuenta.email
                      ? { icono: Copy, onClick: () => copiar(ficha.cuenta.email as string) }
                      : undefined
                  }
                />
                <Dato
                  etiqueta="Correo confirmado"
                  valor={
                    ficha.cuenta.email_confirmado_en
                      ? formatDateTime(ficha.cuenta.email_confirmado_en)
                      : "Sin confirmar — no podrá entrar hasta que abra el correo"
                  }
                  alerta={!ficha.cuenta.email_confirmado_en}
                />
                <Dato
                  etiqueta="Último acceso"
                  valor={
                    ficha.cuenta.ultimo_acceso
                      ? formatDateTime(ficha.cuenta.ultimo_acceso)
                      : "Nunca ha entrado"
                  }
                  alerta={!ficha.cuenta.ultimo_acceso}
                />
                <Dato
                  etiqueta="Tiene contraseña"
                  valor={ficha.cuenta.tiene_clave ? "Sí" : "No — entra solo por enlace de correo"}
                />
                {ficha.cuenta.proveedores.length > 0 && (
                  <Dato etiqueta="Entra con" valor={ficha.cuenta.proveedores.join(", ")} />
                )}
                {ficha.cuenta.bloqueada_hasta && (
                  <Dato
                    etiqueta="Bloqueada hasta"
                    valor={formatDateTime(ficha.cuenta.bloqueada_hasta)}
                    alerta
                  />
                )}
                <Dato
                  etiqueta="Cuenta creada"
                  valor={
                    ficha.cuenta.cuenta_creada_en
                      ? formatDateTime(ficha.cuenta.cuenta_creada_en)
                      : "—"
                  }
                />
              </Bloque>

              {/* Por qué no hay una contraseña que mirar. Va aquí y no en la
                  documentación porque es justo aquí donde se busca. */}
              <div className="flex items-start gap-2 rounded-2xl bg-slate-100 p-4 dark:bg-[#2C2C2E]">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-slate-400" />
                <div className="min-w-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                  <p>
                    <strong className="text-slate-900 dark:text-white">
                      La contraseña no se puede ver.
                    </strong>{" "}
                    No está guardada en ninguna parte: de ella solo queda una huella
                    irreversible, y eso es lo que hace que un robo de la base no entregue las
                    claves de nadie.
                  </p>
                  <p className="mt-1.5">
                    Para ayudarle a entrar, mándale el enlace y él pone una nueva.
                  </p>
                </div>
              </div>

              <button
                onClick={mandarEnlaceDeClave}
                disabled={enviando || !ficha.cuenta.email}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] px-5 font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {enviando ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <KeyRound className="size-5" />
                )}
                Mandarle enlace para cambiar la contraseña
              </button>

              <Bloque titulo="Perfil">
                <Dato etiqueta="Nombre" valor={ficha.perfil.full_name || "—"} />
                <Dato
                  etiqueta="Teléfono"
                  valor={ficha.perfil.phone ?? ficha.cuenta.telefono_auth ?? "—"}
                  accion={
                    ficha.perfil.phone
                      ? { icono: Copy, onClick: () => copiar(ficha.perfil.phone as string) }
                      : undefined
                  }
                />
                <Dato etiqueta="Rol" valor={ROLE_LABELS[ficha.perfil.role]} />
                <Dato
                  etiqueta="Estado"
                  valor={ficha.perfil.active ? "Activo" : "Inactivo — no puede entrar"}
                  alerta={!ficha.perfil.active}
                />
                {ficha.perfil.requested_role && (
                  <Dato etiqueta="Solicitó" valor={ROLE_LABELS[ficha.perfil.requested_role]} alerta />
                )}
                {ficha.comercio && <Dato etiqueta="Comercio" valor={ficha.comercio.business_name} />}
                {ficha.perfil.courier_type && (
                  <Dato etiqueta="Tipo de mensajero" valor={ficha.perfil.courier_type} />
                )}
                {ficha.perfil.vehicle_plate && (
                  <Dato etiqueta="Placa" valor={ficha.perfil.vehicle_plate} />
                )}
                {ficha.perfil.role === "mensajero" && (
                  <Dato
                    etiqueta="Habilitado para rodar"
                    valor={
                      ficha.perfil.verified_at
                        ? `Sí, desde ${formatDateTime(ficha.perfil.verified_at)}`
                        : "No — le faltan documentos por aprobar"
                    }
                    alerta={!ficha.perfil.verified_at}
                  />
                )}
                <Dato
                  etiqueta="Id"
                  valor={ficha.perfil.id}
                  accion={{ icono: Copy, onClick: () => copiar(ficha.perfil.id) }}
                />
              </Bloque>

              {ficha.documentos.length > 0 && (
                <Bloque titulo={`Documentos (${ficha.documentos.length})`}>
                  <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
                    {ficha.documentos.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-slate-900 dark:text-white">
                            {DOC_LABELS[d.doc_type] ?? d.doc_type}
                          </p>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">
                            {formatDateTime(d.uploaded_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              DOC_STATUS_COLORS[d.status]
                            }`}
                          >
                            {DOC_STATUS_LABELS[d.status]}
                          </span>
                          <button
                            onClick={() => verDocumento(d.file_path)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                          >
                            Ver
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl atl-superficie p-4 shadow-sm ">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  alerta,
  accion,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
  accion?: { icono: React.ElementType; onClick: () => void };
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-900/[0.06] py-2 last:border-0 dark:border-white/[0.08]">
      <span className="shrink-0 text-[13px] text-slate-500 dark:text-slate-400">{etiqueta}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`truncate text-right text-[14px] ${
            alerta
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : "font-medium text-slate-900 dark:text-white"
          }`}
        >
          {valor}
        </span>
        {accion && (
          <button
            onClick={accion.onClick}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:text-[#ff812c]"
            aria-label={`Copiar ${etiqueta}`}
          >
            <accion.icono className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}
