"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Loader2, Phone, ShieldCheck, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Asesor, Sede } from "@/lib/types";

/**
 * El equipo del comercio, visto por su dueño.
 *
 * Quien habilita a un asesor NO somos nosotros: es su jefe. A Tiempo no tiene
 * cómo saber si esa persona trabaja ahí, y meternos en esa decisión sería
 * arrogarnos algo que no nos toca —y volvernos el cuello de botella de cada
 * contratación de cada comercio—.
 *
 * Lo que el asesor puede hacer no se decide en esta pantalla: se decide en la
 * base. Aquí solo se dice quién entra y a qué sede. Que no vea las facturas ni
 * el recaudo de su jefe está cerrado con políticas de RLS, no escondiendo
 * botones. Ver migración 0074.
 */
export function EquipoDelComercio() {
  const [asesores, setAsesores] = useState<Asesor[] | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [eligiendoSede, setEligiendoSede] = useState<Asesor | null>(null);
  const [sedeElegida, setSedeElegida] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [{ data: eq, error }, { data: sd }] = await Promise.all([
      supabase.rpc("at_mis_asesores"),
      supabase.rpc("at_mis_sedes"),
    ]);
    if (error) {
      setMsg({ ok: false, text: error.message });
      setAsesores([]);
      return;
    }
    setAsesores((eq as Asesor[]) ?? []);
    setSedes(((sd as Sede[]) ?? []).filter((s) => s.active));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function aprobar(a: Asesor, siteId: string | null) {
    setBusy(a.id);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_aprobar_asesor", {
      p_profile_id: a.id,
      p_site_id: siteId,
    });
    setBusy(null);
    setEligiendoSede(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({ ok: true, text: `${a.full_name} ya puede registrar pedidos y pedir recogidas.` });
    cargar();
  }

  async function rechazar(a: Asesor) {
    setBusy(a.id);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_rechazar_asesor", { p_profile_id: a.id });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({ ok: true, text: `Se rechazó la solicitud de ${a.full_name}.` });
    cargar();
  }

  async function cambiar(a: Asesor, cambios: { p_site_id?: string; p_active?: boolean }) {
    setBusy(a.id);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_actualizar_asesor", {
      p_profile_id: a.id,
      ...cambios,
    });
    setBusy(null);
    setEligiendoSede(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    cargar();
  }


  const porAprobar = asesores?.filter((a) => a.estado === "por_aprobar") ?? [];
  const dentro = asesores?.filter((a) => a.estado !== "por_aprobar") ?? [];

  return (
    <div className="space-y-6 pb-10 font-sans">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Mi equipo
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Tus asesores comerciales: quién puede registrar pedidos y pedir recogidas
        </p>
      </div>

      {msg && (
        <p
          className={`rounded-2xl px-4 py-3 text-[15px] ${
            msg.ok
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
          }`}
        >
          {msg.text}
        </p>
      )}

      {asesores === null ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          Cargando tu equipo…
        </div>
      ) : (
        <>
          {/* Lo que espera decisión va primero y separado: es lo único de esta
              pantalla que tiene a alguien esperando del otro lado. */}
          {porAprobar.length > 0 && (
            <section>
              <h2 className="mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Esperan que los habilites
              </h2>
              <div className="space-y-3">
                {/* Translucida y con blur (patron probado en produccion). Cada tarjeta es la
                    superficie de lectura del asesor pendiente; los botones de abajo no se tocan. */}
                {porAprobar.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border-l-4 border-[#ff812c] atl-superficie p-5 shadow-sm  "
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff812c]/10">
                        <UserPlus className="h-5 w-5 text-[#ff812c]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-bold text-slate-900 dark:text-white">
                          {a.full_name || "Sin nombre"}
                        </p>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">
                          {a.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" /> {a.phone} ·{" "}
                            </span>
                          ) : null}
                          se registró el {formatDate(a.created_at)}
                        </p>
                        <p className="mt-2 text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                          Dice que trabaja contigo. Si es así, habilítalo y podrá registrar
                          pedidos y pedir recogidas a tu nombre —pero no verá tus facturas ni
                          tu recaudo.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setEligiendoSede(a);
                          setSedeElegida(sedes.find((s) => s.es_principal)?.id ?? "");
                        }}
                        disabled={busy === a.id}
                        className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff812c] px-4 font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
                      >
                        {busy === a.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Check className="h-5 w-5" />
                        )}
                        Sí, trabaja aquí
                      </button>
                      <button
                        onClick={() => rechazar(a)}
                        disabled={busy === a.id}
                        className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl atl-relleno px-4 font-semibold text-slate-700 disabled:opacity-60  dark:text-slate-300"
                      >
                        <X className="h-5 w-5" />
                        No lo conozco
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Tu equipo
            </h2>
            {/* Translucida y con blur (probado en vivo: /90 sin blur no se notaba).
                El modal de elegir sede de abajo se queda opaco a proposito. */}
            <div className="overflow-hidden rounded-2xl atl-superficie shadow-sm  ">
              {dentro.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-slate-300 dark:text-slate-600" />
                  <p className="text-[15px] text-slate-500 dark:text-slate-400">
                    Todavía no tienes asesores.
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[14px] leading-snug text-slate-400 dark:text-slate-500">
                    Diles que se registren en la app como «Asesor comercial» y que te elijan
                    a ti. Te aparecerán aquí para que los habilites.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
                  {dentro.map((a) => (
                    <li key={a.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                            {a.full_name || "Sin nombre"}
                          </p>
                          <p className="text-[13px] text-slate-500 dark:text-slate-400">
                            {a.site_name ? (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5" />
                                {a.site_name}
                              </span>
                            ) : (
                              "Sin sede asignada"
                            )}
                            {" · "}
                            {a.pedidos} pedido{a.pedidos === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              a.estado === "habilitado"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300"
                            }`}
                          >
                            {a.estado === "habilitado" ? "Habilitado" : "Suspendido"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setEligiendoSede(a);
                            setSedeElegida(a.site_id ?? "");
                          }}
                          disabled={busy === a.id}
                          className="rounded-xl atl-relleno px-4 py-2 text-[14px] font-semibold text-slate-700 disabled:opacity-60  dark:text-slate-300"
                        >
                          Cambiar sede
                        </button>
                        <button
                          onClick={() => cambiar(a, { p_active: a.estado !== "habilitado" })}
                          disabled={busy === a.id}
                          className={`rounded-xl px-4 py-2 text-[14px] font-semibold disabled:opacity-60 ${
                            a.estado === "habilitado"
                              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          }`}
                        >
                          {a.estado === "habilitado" ? "Quitar acceso" : "Devolver acceso"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {/* Elegir sede, al habilitar o al cambiarla */}
      {eligiendoSede && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-2xl dark:bg-[#2C2C2E]">
            <div className="border-b border-slate-900/[0.06] px-6 pt-6 pb-4 dark:border-white/[0.08]">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                ¿En qué sede trabaja?
              </h3>
              <p className="mt-1 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
                De la sede sale la dirección de sus recogidas y el precio de sus domicilios.
              </p>
            </div>

            <div className="max-h-[50dvh] overflow-y-auto px-6 py-4">
              <select
                value={sedeElegida}
                onChange={(e) => setSedeElegida(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl atl-relleno px-4 py-3.5 text-[17px] text-slate-900 focus:outline-none  dark:text-white"
              >
                <option value="">Sin sede (usa la principal)</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.zone_name ? ` — ${s.zone_name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border-t border-slate-900/[0.06] p-5 dark:border-white/[0.08]">
              <button
                onClick={() =>
                  eligiendoSede.estado === "por_aprobar"
                    ? aprobar(eligiendoSede, sedeElegida || null)
                    : cambiar(eligiendoSede, { p_site_id: sedeElegida || undefined })
                }
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
              >
                {eligiendoSede.estado === "por_aprobar" ? "Habilitar" : "Guardar"}
              </button>
              <button
                onClick={() => setEligiendoSede(null)}
                className="min-h-[48px] w-full rounded-xl atl-relleno font-semibold text-slate-700  dark:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
