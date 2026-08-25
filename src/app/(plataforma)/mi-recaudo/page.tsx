"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Bike,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { formatCOP } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import type { EstadoDelDinero, MiRecaudo } from "@/lib/types";

/**
 * Los cuatro estados del dinero, en el orden en que lo recorre.
 *
 * El texto importa más que el número: quien abre esta pantalla quiere saber si
 * su plata está o no está, y por qué. Por eso cada estado dice quién la tiene
 * ahora mismo, en vez de un tecnicismo como "conciliado" o "sin remesa".
 */
const ESTADOS: {
  clave: EstadoDelDinero;
  titulo: string;
  explica: string;
  icono: typeof Wallet;
  color: string;
  fondo: string;
}[] = [
  {
    clave: "con_el_mensajero",
    titulo: "Recaudado, aún en la calle",
    explica: "Ya se cobró, pero el mensajero todavía no cierra su caja del día.",
    icono: Bike,
    color: "text-slate-500 dark:text-slate-400",
    fondo: "bg-slate-100 dark:bg-slate-700/40",
  },
  {
    clave: "en_nuestras_manos",
    titulo: "Lo tenemos nosotros",
    explica: "Caja cerrada y cuadrada. Entra en tu próximo giro.",
    icono: Wallet,
    color: "text-amber-600 dark:text-amber-400",
    fondo: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    clave: "en_remesa",
    titulo: "Giro en preparación",
    explica: "Ya tiene número de remesa. Está por consignarse.",
    icono: FileText,
    color: "text-blue-600 dark:text-blue-400",
    fondo: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    clave: "girado",
    titulo: "Ya te lo consignamos",
    explica: "Salió de nuestra cuenta, con fecha y referencia.",
    icono: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    fondo: "bg-emerald-50 dark:bg-emerald-500/10",
  },
];

const ETIQUETA_CORTA: Record<EstadoDelDinero, { texto: string; clases: string }> = {
  con_el_mensajero: {
    texto: "En la calle",
    clases: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
  },
  en_nuestras_manos: {
    texto: "Lo tenemos",
    clases: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  en_remesa: {
    texto: "Por consignar",
    clases: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  girado: {
    texto: "Consignado",
    clases: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
};

export default function MiRecaudoPage() {
  const profile = useProfile();
  const [datos, setDatos] = useState<MiRecaudo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_mi_recaudo");
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDatos(data as MiRecaudo);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (profile.role !== "cliente") {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Mi recaudo</h1>
        <p className="mt-6 text-slate-500 dark:text-slate-400">
          Esta pantalla es para comercios. El recaudo de la operación está en{" "}
          <span className="font-semibold">Recaudo</span>.
        </p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        Consultando tu recaudo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Mi recaudo</h1>
        <p className="mt-6 text-rose-500">{error}</p>
      </div>
    );
  }

  const r = datos?.resumen;
  const porRecibir =
    (r?.con_el_mensajero.monto ?? 0) + (r?.en_nuestras_manos.monto ?? 0) + (r?.en_remesa.monto ?? 0);

  return (
    <div className="space-y-6 pb-10 font-sans">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Mi recaudo
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          El dinero que le cobramos a tus compradores y dónde está ahora mismo
        </p>
      </div>

      {/* El titular: lo que le falta por recibir. Es la pregunta que trae a
          alguien a esta pantalla, así que va primero y en grande. */}
      {/* Translucida y con blur (patrón probado en vivo: /90 sin blur no se notaba). */}
      <div className="rounded-3xl bg-[#FFFFFF]/75 p-6 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff812c]/10">
            <Banknote className="h-6 w-6 text-[#ff812c]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-slate-500 dark:text-slate-400">Te falta por recibir</p>
            <p className="text-[34px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              {formatCOP(porRecibir)}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
              De {formatCOP(r?.recaudado_total ?? 0)} recaudados en total, ya te consignamos{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCOP(r?.girado.monto ?? 0)}
              </span>
              .
              {(r?.domicilios_cobrados_al_comprador ?? 0) > 0 && (
                <>
                  {" "}
                  No se incluyen {formatCOP(r?.domicilios_cobrados_al_comprador ?? 0)} de domicilios
                  que el comprador pagó en la puerta: esos ya eran nuestros y no se te descuentan
                  después.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Los cuatro estados */}
      {/* Translucidas y con blur, mismo patrón que la tarjeta del titular. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ESTADOS.map((e) => {
          const dato = r?.[e.clave];
          const Icono = e.icono;
          return (
            <div key={e.clave} className="rounded-2xl bg-[#FFFFFF]/75 p-5 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.fondo}`}>
                  <Icono className={`h-5 w-5 ${e.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    {e.titulo}
                  </p>
                  <p className="text-[12px] text-slate-400 dark:text-slate-500">
                    {dato?.pedidos ?? 0} pedido{(dato?.pedidos ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
                {formatCOP(dato?.monto ?? 0)}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                {e.explica}
              </p>
            </div>
          );
        })}
      </div>

      {/* Giros hechos */}
      <section>
        <h2 className="mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Giros
        </h2>
        {/* Translucida y con blur; el desglose interno (fondo gris) se queda opaco. */}
        <div className="overflow-hidden rounded-2xl bg-[#FFFFFF]/75 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
          {(datos?.remesas.length ?? 0) === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-slate-400">
              Todavía no te hemos hecho ningún giro.
            </p>
          ) : (
            <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
              {datos?.remesas.map((m) => (
                <li key={m.remittance_number} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                        {m.remittance_number}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        {m.guide_count} pedido{m.guide_count === 1 ? "" : "s"} · {m.period_start} al{" "}
                        {m.period_end}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[17px] font-bold text-slate-900 dark:text-white">
                        {formatCOP(m.net_amount)}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          m.status === "pagada"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                        }`}
                      >
                        {m.status === "pagada" ? "Consignado" : "Por consignar"}
                      </span>
                    </div>
                  </div>

                  {/* El desglose va SIEMPRE que haya descuentos: es lo que
                      explica por qué el giro no coincide con lo recaudado, y
                      es justo la duda que genera una desconfianza sorda. */}
                  {(m.shipping_kept > 0 || m.invoice_offset > 0) && (
                    <div className="mt-3 space-y-1 rounded-xl bg-[#F2F2F7] p-3 text-[13px] dark:bg-[#1C1C1E]">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Recaudado a tus compradores</span>
                        <span>{formatCOP(m.gross_amount)}</span>
                      </div>
                      {m.shipping_kept > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Domicilios que pagó el comprador</span>
                          <span>−{formatCOP(m.shipping_kept)}</span>
                        </div>
                      )}
                      {m.invoice_offset > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Abonado a tus facturas</span>
                          <span>−{formatCOP(m.invoice_offset)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-900/[0.06] pt-1 font-semibold text-slate-900 dark:border-white/[0.10] dark:text-white">
                        <span>Te giramos</span>
                        <span>{formatCOP(m.net_amount)}</span>
                      </div>
                    </div>
                  )}

                  {m.paid_at && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                      <Landmark className="h-4 w-4 shrink-0" />
                      {formatDateTime(m.paid_at)}
                      {m.method ? ` · ${m.method}` : ""}
                      {m.reference ? ` · ref. ${m.reference}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Pedido por pedido, para que pueda cuadrar contra su propia
          contabilidad sin pedirnos un reporte. */}
      <section>
        <h2 className="mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Pedido por pedido
        </h2>
        {/* Translucida y con blur, mismo patrón que el resto de la pantalla. */}
        <div className="overflow-hidden rounded-2xl bg-[#FFFFFF]/75 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
          {(datos?.pedidos.length ?? 0) === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-slate-400">
              Todavía no tienes pedidos contraentrega entregados.
            </p>
          ) : (
            <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
              {datos?.pedidos.map((p) => {
                const et = ETIQUETA_CORTA[p.estado_dinero];
                return (
                  <li key={p.guide_number} className="flex items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
                        {p.recipient_name}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        {p.guide_number}
                        {p.delivered_at ? ` · ${formatDateTime(p.delivered_at)}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${et.clases}`}
                        >
                          {et.texto}
                        </span>
                        {p.remittance_number && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {p.remittance_number}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                        {formatCOP(p.le_corresponde)}
                      </p>
                      {p.cod_includes_shipping && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          cobrado {formatCOP(p.cod_amount)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
