"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  CircleCheck,
  Loader2,
  Pencil,
  Plus,
  Store,
  Trash2,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMyClient } from "@/components/useMyClient";
import { ShopifyConnect } from "@/components/ShopifyConnect";
import { PAYMENT_KINDS, PAYMENT_KIND_LABELS } from "@/lib/constants";
import type { PaymentKind, PaymentMethod } from "@/lib/types";

const NEGOCIO_VACIO = {
  business_name: "",
  nit: "",
  address: "",
  phone: "",
  contact_name: "",
};

const MEDIO_VACIO = {
  kind: "nequi" as PaymentKind,
  holder: "",
  identifier: "",
  instructions: "",
};

export default function MiComercioPage() {
  const { client, clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();

  const [negocio, setNegocio] = useState({ ...NEGOCIO_VACIO });
  const [guardandoNegocio, setGuardandoNegocio] = useState(false);
  const [negocioOk, setNegocioOk] = useState(false);
  const [negocioError, setNegocioError] = useState<string | null>(null);

  const [medios, setMedios] = useState<PaymentMethod[] | null>(null);
  const [editando, setEditando] = useState<PaymentMethod | "nuevo" | null>(null);
  const [form, setForm] = useState({ ...MEDIO_VACIO });
  const [guardandoMedio, setGuardandoMedio] = useState(false);
  const [medioError, setMedioError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    if (!client) return;
    setNegocio({
      business_name: client.business_name ?? "",
      nit: client.nit ?? "",
      address: client.address ?? "",
      phone: client.phone ?? "",
      contact_name: client.contact_name ?? "",
    });
  }, [client]);

  const cargarMedios = useCallback(async () => {
    if (!clientId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("at_payment_methods")
      .select("*")
      .eq("client_id", clientId)
      .order("sort_order")
      .order("created_at");
    setMedios((data as PaymentMethod[]) ?? []);
  }, [clientId]);

  useEffect(() => {
    cargarMedios();
  }, [cargarMedios]);

  async function guardarNegocio(e: React.FormEvent) {
    e.preventDefault();
    setNegocioError(null);
    setNegocioOk(false);
    setGuardandoNegocio(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("at_update_my_business", {
      p_business_name: negocio.business_name.trim(),
      p_nit: negocio.nit.trim() || null,
      p_address: negocio.address.trim() || null,
      p_phone: negocio.phone.trim() || null,
      p_contact_name: negocio.contact_name.trim() || null,
    });

    setGuardandoNegocio(false);
    if (error) {
      setNegocioError(error.message);
      return;
    }
    setNegocioOk(true);
    setTimeout(() => setNegocioOk(false), 2500);
  }

  function abrirNuevoMedio() {
    setEditando("nuevo");
    setForm({ ...MEDIO_VACIO });
    setMedioError(null);
  }

  function abrirEdicionMedio(m: PaymentMethod) {
    setEditando(m);
    setForm({
      kind: m.kind,
      holder: m.holder ?? "",
      identifier: m.identifier ?? "",
      instructions: m.instructions ?? "",
    });
    setMedioError(null);
  }

  async function guardarMedio(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setMedioError(null);

    // Efectivo es el único que no necesita un dato de cobro.
    if (form.kind !== "efectivo" && !form.identifier.trim()) {
      setMedioError("Falta el dato con el que te van a pagar.");
      return;
    }
    if (form.kind === "link" && !/^https?:\/\//i.test(form.identifier.trim())) {
      setMedioError("El link de pago debe empezar por https://");
      return;
    }

    setGuardandoMedio(true);
    const supabase = createClient();
    const payload = {
      client_id: clientId,
      kind: form.kind,
      holder: form.holder.trim() || null,
      identifier: form.identifier.trim() || null,
      instructions: form.instructions.trim() || null,
    };

    const { error } =
      editando === "nuevo"
        ? await supabase.from("at_payment_methods").insert({
            ...payload,
            sort_order: (medios?.length ?? 0) + 1,
          })
        : await supabase
            .from("at_payment_methods")
            .update(payload)
            .eq("id", (editando as PaymentMethod).id);

    setGuardandoMedio(false);
    if (error) {
      setMedioError(error.message);
      return;
    }
    setEditando(null);
    cargarMedios();
  }

  async function alternarActivo(m: PaymentMethod) {
    const supabase = createClient();
    await supabase
      .from("at_payment_methods")
      .update({ active: !m.active })
      .eq("id", m.id);
    cargarMedios();
  }

  async function eliminarMedio() {
    if (!borrando) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("at_payment_methods")
      .delete()
      .eq("id", borrando.id);
    setBorrando(null);
    if (!error) cargarMedios();
  }

  if (cargandoComercio) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-[#ff812c]" />
      </div>
    );
  }

  if (errorComercio || !clientId) {
    return (
      <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-5 flex items-start gap-3">
        <TriangleAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <p className="text-[15px] text-rose-600 dark:text-rose-400">
          {errorComercio ?? "Tu cuenta todavía no está enlazada a un comercio."}
        </p>
      </div>
    );
  }

  const fieldRow =
    "flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors";
  const fieldInput =
    "flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white";
  const fieldLabel =
    "w-[110px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0";

  const hint = PAYMENT_KINDS.find((k) => k.value === form.kind)?.hint ?? "";

  return (
    <div className="space-y-10 pb-10">
      <header className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-[#ff812c]/10 inline-flex items-center justify-center">
          <Store className="w-5 h-5 text-[#ff812c]" />
        </span>
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Mi comercio
          </h1>
          <p className="text-[14px] text-slate-500 dark:text-slate-400">
            Tus datos y las formas en que quieres que te paguen
          </p>
        </div>
      </header>

      {/* ── Datos del negocio ── */}
      <section>
        <div className="flex items-center gap-2 mb-3 ml-1">
          <Building2 className="w-4 h-4 text-slate-400" />
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Datos del negocio
          </h2>
        </div>

        <form onSubmit={guardarNegocio}>
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
            <div className={fieldRow}>
              <label className={fieldLabel}>Comercio</label>
              <input
                required
                value={negocio.business_name}
                onChange={(e) => setNegocio((n) => ({ ...n, business_name: e.target.value }))}
                className={fieldInput}
                placeholder="Razón social o marca"
              />
            </div>
            <div className={fieldRow}>
              <label className={fieldLabel}>NIT</label>
              <input
                value={negocio.nit}
                onChange={(e) => setNegocio((n) => ({ ...n, nit: e.target.value }))}
                className={fieldInput}
                placeholder="123456789-0"
              />
            </div>
            <div className={fieldRow}>
              <label className={fieldLabel}>Dirección</label>
              <input
                value={negocio.address}
                onChange={(e) => setNegocio((n) => ({ ...n, address: e.target.value }))}
                className={fieldInput}
                placeholder="Dirección del comercio"
              />
            </div>
            <div className={fieldRow}>
              <label className={fieldLabel}>Teléfono</label>
              <input
                value={negocio.phone}
                onChange={(e) => setNegocio((n) => ({ ...n, phone: e.target.value }))}
                className={fieldInput}
                placeholder="3001234567"
              />
            </div>
            <div className={`${fieldRow} border-b-0`}>
              <label className={fieldLabel}>Contacto</label>
              <input
                value={negocio.contact_name}
                onChange={(e) => setNegocio((n) => ({ ...n, contact_name: e.target.value }))}
                className={fieldInput}
                placeholder="Quién responde por el comercio"
              />
            </div>
          </div>

          {negocioError && (
            <p className="mt-3 text-[14px] text-rose-600 dark:text-rose-400">{negocioError}</p>
          )}

          <button
            type="submit"
            disabled={guardandoNegocio}
            className="mt-4 inline-flex items-center justify-center gap-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl px-6 min-h-[48px] disabled:opacity-60"
          >
            {guardandoNegocio ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : negocioOk ? (
              <CircleCheck className="w-5 h-5" />
            ) : null}
            <span>{negocioOk ? "Guardado" : "Guardar datos"}</span>
          </button>
        </form>
      </section>

      {/* ── Tienda conectada ── */}
      <section>
        <div className="flex items-center gap-2 mb-3 ml-1">
          <Store className="w-4 h-4 text-slate-400" />
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Tu tienda en línea
          </h2>
        </div>
        <ShopifyConnect />
      </section>

      {/* ── Medios de pago ── */}
      <section>
        <div className="flex items-center justify-between mb-3 ml-1">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-400" />
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Medios de pago
            </h2>
          </div>
          <button
            onClick={abrirNuevoMedio}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#ff812c] active:opacity-70"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>

        <p className="mb-3 ml-1 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Esto es lo que ve quien escanea el QR de pago de tus guías. Solo se
          muestran los medios activos.
        </p>

        {medios === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#ff812c]" />
          </div>
        ) : medios.length === 0 ? (
          <div className="rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] shadow-sm px-5 py-10 text-center">
            <Wallet className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-white">
              Todavía no tienes medios de pago
            </p>
            <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
              Sin ellos, el QR de pago le dice al destinatario que pague en
              efectivo al mensajero.
            </p>
            <button
              onClick={abrirNuevoMedio}
              className="mt-5 inline-flex items-center gap-2 bg-[#ff812c] active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl px-5 min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> Agregar el primero
            </button>
          </div>
        ) : (
          <ul className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {medios.map((m) => (
              <li key={m.id} className={`px-4 py-4 ${m.active ? "" : "opacity-50"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                        {PAYMENT_KIND_LABELS[m.kind] ?? m.kind}
                      </p>
                      {!m.active && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Oculto
                        </span>
                      )}
                    </div>
                    {m.identifier && (
                      <p className="mt-0.5 text-[15px] text-slate-600 dark:text-slate-300 break-all">
                        {m.identifier}
                      </p>
                    )}
                    {m.holder && (
                      <p className="mt-0.5 text-[13px] text-slate-400 dark:text-slate-500">
                        A nombre de {m.holder}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => alternarActivo(m)}
                      aria-label={m.active ? "Ocultar del QR" : "Mostrar en el QR"}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:opacity-70"
                    >
                      <Check className={`w-[18px] h-[18px] ${m.active ? "text-emerald-500" : ""}`} />
                    </button>
                    <button
                      onClick={() => abrirEdicionMedio(m)}
                      aria-label="Editar"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:opacity-70"
                    >
                      <Pencil className="w-[18px] h-[18px]" />
                    </button>
                    <button
                      onClick={() => setBorrando(m)}
                      aria-label="Eliminar"
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 active:opacity-70"
                    >
                      <Trash2 className="w-[18px] h-[18px]" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Modal de medio de pago ── */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                {editando === "nuevo" ? "Nuevo medio de pago" : "Editar medio de pago"}
              </h3>
              <button
                onClick={() => setEditando(null)}
                aria-label="Cerrar"
                className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarMedio}>
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm">
                <div className={fieldRow}>
                  <label className={fieldLabel}>Medio</label>
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, kind: e.target.value as PaymentKind }))
                    }
                    className={`${fieldInput} appearance-none cursor-pointer`}
                  >
                    {PAYMENT_KINDS.map((k) => (
                      <option key={k.value} value={k.value} className="text-slate-900">
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.kind !== "efectivo" && (
                  <div className={fieldRow}>
                    <label className={fieldLabel}>
                      {form.kind === "link" ? "Link" : "Dato"}
                    </label>
                    <input
                      value={form.identifier}
                      onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                      className={fieldInput}
                      placeholder={hint}
                      inputMode={
                        form.kind === "nequi" || form.kind === "daviplata" ? "tel" : "text"
                      }
                    />
                  </div>
                )}

                <div className={fieldRow}>
                  <label className={fieldLabel}>Titular</label>
                  <input
                    value={form.holder}
                    onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))}
                    className={fieldInput}
                    placeholder="A nombre de (opcional)"
                  />
                </div>

                <div className={`${fieldRow} border-b-0`}>
                  <label className={fieldLabel}>Nota</label>
                  <input
                    value={form.instructions}
                    onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                    className={fieldInput}
                    placeholder="Ej. enviar comprobante (opcional)"
                  />
                </div>
              </div>

              {medioError && (
                <p className="mt-3 text-[14px] text-rose-600 dark:text-rose-400">{medioError}</p>
              )}

              <button
                type="submit"
                disabled={guardandoMedio}
                className="mt-5 w-full flex items-center justify-center gap-2 bg-[#ff812c] active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] disabled:opacity-60"
              >
                {guardandoMedio && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>Guardar</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirmación de borrado ── */}
      {borrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl p-5 text-center">
            <p className="text-[17px] font-bold text-slate-900 dark:text-white">
              ¿Eliminar {PAYMENT_KIND_LABELS[borrando.kind] ?? borrando.kind}?
            </p>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
              Dejará de aparecer en el QR de pago de todas tus guías.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setBorrando(null)}
                className="flex-1 min-h-[46px] rounded-xl font-semibold text-slate-600 dark:text-slate-300 bg-gray-100 dark:bg-gray-700 active:opacity-70"
              >
                Cancelar
              </button>
              <button
                onClick={eliminarMedio}
                className="flex-1 min-h-[46px] rounded-xl font-bold text-white bg-rose-500 active:opacity-70"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
