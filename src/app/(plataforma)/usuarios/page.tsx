"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Loader2, Users, X, BellRing, Store, Bike, Check, Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { Pill } from "@/components/StatusBadge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { Profile, Role, Zone } from "@/lib/types";

/** Lo mínimo del comercio para poder elegirlo en una lista. */
interface Comercio {
  id: string;
  business_name: string;
}

export default function UsersPage() {
  const yo = useProfile();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [comercios, setComercios] = useState<Comercio[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ role: "pendiente", client_id: "", zone_id: "", active: true, max_capacity: 30 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);

  const esAdmin = yo.role === "admin";
  // El borrado pide escribir el nombre antes de habilitarse. Va en su propio
  // estado y no dentro del formulario porque no es un campo del perfil: es una
  // confirmación de una acción que no tiene vuelta atrás.
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [textoBorrado, setTextoBorrado] = useState("");

  async function eliminarCuenta() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_admin_eliminar_usuario", {
      p_id: editing.id,
      p_motivo: "Eliminado desde Usuarios",
    });
    setBusy(false);
    if (error) {
      // La base rechaza los casos que dejarían cuentas descuadradas —el último
      // admin, un mensajero con cierres de caja— y su mensaje explica cuál es.
      setError(error.message);
      setConfirmandoBorrado(false);
      return;
    }
    setEditing(null);
    setConfirmandoBorrado(false);
    setTextoBorrado("");
    load();
  }

  const load = useCallback(async () => {
    if (!esAdmin) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("at_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setProfiles((data as Profile[]) ?? []);
  }, [esAdmin]);

  // Los comercios vuelven a cargarse, y solo por el asesor.
  //
  // Se habían quitado con razón: para el rol 'cliente' el admin no elige nada,
  // porque at_profiles_autoclient le crea el comercio solo. Pero al aparecer el
  // asesor quedó un caso sin dueño — un asesor SÍ pertenece a un comercio y
  // alguien tiene que poder decir a cuál.
  //
  // El camino normal es otro: el asesor elige su comercio al registrarse y su
  // jefe lo habilita desde Mi equipo. Esto es la salida de emergencia para
  // cuando alguien quedó a medias, que es justo como quedó el primero.
  useEffect(() => {
    if (!esAdmin) return;
    load();
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .order("name")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
    supabase
      .from("at_clients")
      .select("id, business_name")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => setComercios((data as Comercio[]) ?? []));
  }, [esAdmin, load]);

  const pending = (profiles ?? []).filter((p) => p.role === "pendiente" && p.requested_role);

  function openEdit(p: Profile) {
    setConfirmandoBorrado(false);
    setTextoBorrado("");
    setEditing(p);
    setError(null);
    setForm({
      role: p.role,
      client_id: p.client_id ?? "",
      zone_id: p.zone_id ?? "",
      active: p.active,
      max_capacity: p.max_capacity ?? 30,
    });
  }

  // ── Aprobar solicitud: solo asigna el rol ──
  // Si el rol es cliente, el trigger at_profiles_autoclient crea su comercio y lo
  // enlaza en el mismo movimiento: aquí no se toca at_clients ni client_id.
  async function approve(p: Profile) {
    setActingId(p.id);
    setReqError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("at_profiles")
      .update({
        role: p.requested_role as Role,
        active: true,
        requested_role: null,
      })
      .eq("id", p.id);
    setActingId(null);
    if (error) {
      setReqError(error.message);
      return;
    }
    await load();
  }

  // ── Rechazar solicitud: deja la cuenta inactiva y la saca de la cola ──
  async function reject(p: Profile) {
    setActingId(p.id);
    setReqError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("at_profiles")
      .update({ active: false, requested_role: null })
      .eq("id", p.id);
    setActingId(null);
    if (error) {
      setReqError(error.message);
      return;
    }
    load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("at_profiles")
      .update({
        role: form.role as Role,
        // El comercio, según el rol:
        //  cliente → lo resuelve el trigger at_profiles_autoclient; no se toca.
        //  asesor  → el que se eligió arriba. ANTES SE PONÍA EN NULL, y por eso
        //            el primer asesor de producción quedó sin comercio: la
        //            pantalla se lo borraba al guardar. Sin client_id no puede
        //            crear un pedido ni ver el catálogo — at_my_client() le
        //            devuelve nulo y todas las políticas lo dejan fuera.
        //  el resto → null: el personal de A Tiempo no pertenece a un comercio.
        client_id:
          form.role === "cliente"
            ? editing.client_id
            : form.role === "asesor"
              ? form.client_id || null
              : null,
        zone_id: form.role === "mensajero" ? form.zone_id || null : null,
        active: form.active,
        max_capacity: form.role === "mensajero" ? form.max_capacity : editing.max_capacity,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(null);
    load();
  }

  // Asignar roles es la llave de toda la jerarquía, así que es solo del admin.
  // La base ya lo impide (RLS deja actualizar el perfil propio o al admin, y
  // at_guard_profile_role bloquea escalar el rol), pero sin este corte la
  // pantalla igual le listaba todos los usuarios a cualquier staff que
  // escribiera la URL.
  if (!esAdmin) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Usuarios
        </h1>
        <p className="mt-6 text-[15px] text-slate-500 dark:text-slate-400">
          Solo un administrador gestiona los usuarios y sus roles.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Usuarios y roles</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Verifica solicitudes de registro y asigna roles operativos
          </p>
        </div>
        {pending.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-[#ff812c]/10 text-[#ff812c] px-3.5 py-2 text-[13px] font-bold shrink-0">
            <BellRing className="w-4 h-4" />
            {pending.length} solicitud{pending.length !== 1 ? "es" : ""}
          </div>
        )}
      </div>

      {/* ── Solicitudes pendientes de verificación ── */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">
            Solicitudes de registro
          </h2>

          {reqError && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-100 dark:border-rose-500/20">
              <p className="text-[14px] text-rose-700 dark:text-rose-400 font-medium">{reqError}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {pending.map((p) => {
              const isClient = p.requested_role === "cliente";
              const acting = actingId === p.id;
              return (
                <div
                  key={p.id}
                  className="bg-white dark:bg-[#2C2C2E] rounded-3xl shadow-sm p-5 flex flex-col gap-4 border border-[#ff812c]/20"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isClient ? "bg-[#ff812c]/10 text-[#ff812c]" : "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400"}`}>
                      {isClient ? <Store className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-bold text-slate-900 dark:text-white truncate">
                        {p.full_name || "(sin nombre)"}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        Solicita: <span className="font-semibold">{ROLE_LABELS[p.requested_role as Role]}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                      {formatDate(p.created_at)}
                    </span>
                  </div>

                  {/* Datos declarados */}
                  <div className="rounded-2xl bg-[#F2F2F7] dark:bg-[#1C1C1E] p-3.5 space-y-1.5 text-[13px]">
                    {isClient ? (
                      <>
                        <Row label="Negocio" value={p.business_name} />
                        <Row label="Tipo" value={p.business_type} />
                        <Row label="NIT" value={p.business_nit} />
                        <Row label="Dirección" value={p.business_address} />
                        <Row label="Teléfono" value={p.phone} />
                      </>
                    ) : (
                      <Row label="Teléfono" value={p.phone} />
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => reject(p)}
                      disabled={acting}
                      className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300 bg-[#F2F2F7] dark:bg-[#1C1C1E] hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4" /> Rechazar
                    </button>
                    <button
                      onClick={() => approve(p)}
                      disabled={acting}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-[#1C1C1E] bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {acting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Aprobar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Translúcida, sin blur: el modal de edición de abajo se queda opaco
          a propósito, aísla una decisión de rol que no debe verse a medias. */}
      <div className="bg-[#FFFFFF]/90 dark:bg-[#2C2C2E]/90 rounded-3xl shadow-sm border border-transparent overflow-hidden transition-colors">
        {profiles === null ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[15px]">Cargando usuarios…</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <p className="text-[16px] text-slate-500 dark:text-slate-400">No hay usuarios registrados</p>
          </div>
        ) : (
          <>
          {/* Versión apilada para teléfono: la tabla de 700 px obligaba a
              arrastrar de lado para llegar al botón de gestionar el rol. */}
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 lg:hidden">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="font-bold text-[16px] text-slate-900 dark:text-white">
                      {p.full_name || "(sin nombre)"}
                    </p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      {p.phone ? `${p.phone} · ` : ""}{formatDate(p.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill
                      label={p.role === "pendiente" && p.requested_role ? `Solicita ${ROLE_LABELS[p.requested_role]}` : ROLE_LABELS[p.role]}
                      tone={p.role === "pendiente" ? "amber" : p.role === "admin" ? "blue" : "slate"}
                    />
                    <Pill label={p.active ? "Activo" : "Inactivo"} tone={p.active ? "green" : "red"} />
                  </div>
                </div>
                <button
                  onClick={() => openEdit(p)}
                  className="inline-flex shrink-0 items-center gap-2 min-h-[40px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
                >
                  <ShieldCheck className="w-4 h-4" /> Rol
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Nombre</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Rol</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Registro</th>
                  <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">Gestionar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F2F2F7]/30 dark:hover:bg-[#1C1C1E]/30 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-[16px] text-slate-900 dark:text-white">{p.full_name || "(sin nombre)"}</p>
                      <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">{p.phone ?? ""}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Pill
                        label={p.role === "pendiente" && p.requested_role ? `Solicita ${ROLE_LABELS[p.requested_role]}` : ROLE_LABELS[p.role]}
                        tone={p.role === "pendiente" ? "amber" : p.role === "admin" ? "blue" : "slate"}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Pill label={p.active ? "Activo" : "Inactivo"} tone={p.active ? "green" : "red"} />
                    </td>
                    <td className="px-6 py-4 text-[14px] font-medium text-slate-500 dark:text-slate-400">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEdit(p)}
                        className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all"
                      >
                        <ShieldCheck className="w-4 h-4" /> Rol
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Action Modal (Apple HIG Style Bottom Sheet/Alert) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity p-4 sm:p-0">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-[32px] shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">

            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
              <div>
                <h3 className="text-[19px] font-bold text-slate-900 dark:text-white truncate pr-4">Gestionar usuario</h3>
                <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{editing.full_name || "Usuario"}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-500 dark:text-slate-400 hover:opacity-80 transition-opacity shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={save} className="p-6 space-y-5">
              {/* Datos declarados en la solicitud (contexto) */}
              {editing.requested_role && (
                <div className="rounded-2xl bg-[#ff812c]/10 border border-[#ff812c]/20 p-4 space-y-1.5">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-[#ff812c]">
                    Solicitó registrarse como {ROLE_LABELS[editing.requested_role]}
                  </p>
                  {editing.business_name && <Row label="Negocio" value={editing.business_name} />}
                  {editing.business_type && <Row label="Tipo" value={editing.business_type} />}
                  {editing.business_nit && <Row label="NIT" value={editing.business_nit} />}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                  Rol en la plataforma
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>

              {form.role === "cliente" && (
                <div className="rounded-2xl bg-[#F2F2F7] dark:bg-[#1C1C1E] p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Store className="w-5 h-5 text-[#ff812c] shrink-0 mt-0.5" />
                  <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Todo usuario con rol cliente <strong>es</strong> un e-commerce: su comercio se
                    crea automáticamente y aparece en la lista de Clientes. No hay que vincular nada.
                  </p>
                </div>
              )}

              {form.role === "asesor" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Comercio para el que trabaja
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                    className="w-full min-h-[46px] rounded-2xl bg-[#F2F2F7] px-4 text-[15px] text-slate-900 focus:outline-none dark:bg-[#1C1C1E] dark:text-white"
                  >
                    <option value="">Sin asignar</option>
                    {comercios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.business_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                    Lo normal es que el asesor elija su comercio al registrarse y su jefe lo
                    habilite desde Mi equipo. Esto es para arreglar a quien quedó sin comercio:
                    sin él no puede crear pedidos ni ver el catálogo de la tienda.
                  </p>
                </div>
              )}

              {form.role === "mensajero" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Zona habitual
                  </label>
                  <select
                    value={form.zone_id}
                    onChange={(e) => setForm((f) => ({ ...f, zone_id: e.target.value }))}
                    className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Sin zona fija</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>

                  <label className="text-[15px] font-semibold text-slate-900 dark:text-white block mt-4">
                    Capacidad máxima (paquetes simultáneos en ruta)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.max_capacity}
                    onChange={(e) => setForm((f) => ({ ...f, max_capacity: Math.max(1, Number(e.target.value) || 1) }))}
                    className="w-full min-h-[52px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-2xl px-4 text-[16px] text-slate-900 dark:text-white focus:outline-none transition-all"
                  />
                </div>
              )}

              <label className="flex items-center gap-3 p-4 rounded-2xl bg-[#F2F2F7] dark:bg-[#1C1C1E] cursor-pointer active:opacity-80 transition-opacity mt-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="w-5 h-5 rounded border-gray-300 text-[#ff812c] focus:ring-[#ff812c] bg-white dark:bg-black dark:border-gray-700"
                />
                <span className="text-[16px] font-semibold text-slate-900 dark:text-white select-none">
                  Cuenta activa
                </span>
              </label>

              {error && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4 border border-rose-100 dark:border-rose-500/20">
                  <p className="text-[14px] text-rose-700 dark:text-rose-400 font-medium leading-snug">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 min-h-[52px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[52px] rounded-2xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar"}
                </button>
              </div>

              {/* Eliminar la cuenta.
                  Va al final, separado por una línea y en texto y no en botón:
                  es irreversible y no debería competir visualmente con Guardar.
                  Antes de borrar hay que escribir el nombre — es lo único que
                  distingue «quería borrar a esta persona» de «me equivoqué de
                  fila». La base además se niega sola en los casos que dejarían
                  cuentas descuadradas; aquí no se duplica esa lógica. */}
              {esAdmin && editing.id !== yo.id && (
                <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-5">
                  {!confirmandoBorrado ? (
                    <button
                      type="button"
                      onClick={() => setConfirmandoBorrado(true)}
                      className="text-[14px] font-semibold text-rose-600 dark:text-rose-400 active:opacity-70"
                    >
                      Eliminar esta cuenta
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                        Se borra la cuenta de{" "}
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {editing.full_name || "esta persona"}
                        </strong>{" "}
                        y no se puede deshacer. Su historial de pedidos y entregas se
                        conserva, pero sin su nombre. Para confirmar, escríbelo:
                      </p>
                      <input
                        value={textoBorrado}
                        onChange={(e) => setTextoBorrado(e.target.value)}
                        placeholder={editing.full_name || "nombre"}
                        className="w-full rounded-2xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 py-3 text-[16px] text-slate-900 dark:text-white focus:outline-none"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmandoBorrado(false);
                            setTextoBorrado("");
                          }}
                          className="flex-1 min-h-[46px] rounded-2xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300"
                        >
                          Mejor no
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            textoBorrado.trim().toLowerCase() !==
                              (editing.full_name || "").trim().toLowerCase()
                          }
                          onClick={eliminarCuenta}
                          className="flex-1 min-h-[46px] rounded-2xl font-bold bg-rose-500 text-white disabled:opacity-40"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Fila etiqueta/valor para los datos declarados
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-slate-400 dark:text-slate-500 shrink-0 w-[70px]">{label}</span>
      <span className="text-slate-700 dark:text-slate-200 font-medium break-words min-w-0">
        {value?.trim() ? value : "—"}
      </span>
    </div>
  );
}
