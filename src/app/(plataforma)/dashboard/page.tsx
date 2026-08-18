"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Bike,
  ChevronRight,
  Clock,
  PackageCheck,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { GUIDE_STATUS_LABELS, ROLES_DEL_COMERCIO } from "@/lib/constants";
import { cn, formatCOP } from "@/lib/utils";
import type { DashboardKpis, GuideStatus, Role } from "@/lib/types";

const ORDER: GuideStatus[] = [
  "creada",
  "recogida",
  "en_cedi",
  "zonificada",
  "en_ruta",
  "entregada",
  "novedad",
  "reprogramada",
  "en_devolucion",
  "devuelta",
  "cancelada",
];

const BAR_COLORS: Record<GuideStatus, string> = {
  // Estados Pasivos / En Espera (Grises limpios)
  creada: "bg-slate-300 dark:bg-slate-600",
  recogida: "bg-slate-400 dark:bg-slate-500",
  en_cedi: "bg-slate-400 dark:bg-slate-500",
  zonificada: "bg-slate-500 dark:bg-slate-400",

  // Estado Activo / En Movimiento (Naranja de Marca)
  en_ruta: "bg-[#ff812c]",

  // Éxito (Verde)
  entregada: "bg-emerald-500 dark:bg-emerald-600",

  // Alertas / Precaución (Ámbar/Amarillo)
  novedad: "bg-amber-500 dark:bg-amber-600",
  reprogramada: "bg-amber-500 dark:bg-amber-600",

  // Fallos / Detenidos (Rojo/Rosa)
  en_devolucion: "bg-rose-500 dark:bg-rose-600",
  devuelta: "bg-rose-600 dark:bg-rose-700",
  cancelada: "bg-red-500 dark:bg-red-600",
};

/**
 * Qué roles alcanzan cada destino. Es el mismo reparto del menú lateral
 * (`AppShell`), repetido aquí a propósito: una tarjeta que lleve a una pantalla
 * que el rol no puede abrir es peor que una tarjeta quieta, porque promete algo
 * y aterriza en «no tienes acceso». Cuando no hay destino alcanzable, la
 * tarjeta se pinta igual pero sin enlace.
 */
const ALCANCE: Record<string, Role[]> = {
  guias: ["admin", "coordinador", "operario", "cliente", "admin_cedi"],
  recogidas: ["admin", "coordinador", "operario", "cliente", "admin_cedi"],
  mapa: ["admin", "coordinador", "operario", "admin_cedi"],
  recaudo: ["admin", "coordinador", "mensajero", "admin_cedi"],
};

/**
 * Una métrica del panel. Con `href` deja de ser un dato y pasa a ser un botón:
 * lleva a su sección con el filtro ya puesto en la URL, se levanta al pasar el
 * cursor y muestra a dónde va.
 */
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  href,
  accion,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  /** Destino con sus parámetros de filtro. Sin él la tarjeta no es clicable. */
  href?: string;
  /** Qué se va a ver al otro lado: «Ver guías», «Ver recaudo»… */
  accion?: string;
}) {
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        {/* `min-w-0` + tamaño menor en teléfono: un recaudo como $12.345.678 a
            32 px no cabe al lado del icono y se salía de la tarjeta. */}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">{label}</p>
          <p className="mt-2 text-[26px] sm:text-[32px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none tabular-nums break-words">
            {value}
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[#ff812c]/10 dark:bg-[#ff812c]/20 flex items-center justify-center shrink-0 transition-colors group-hover:bg-[#ff812c]/20 dark:group-hover:bg-[#ff812c]/30">
          <Icon className="w-6 h-6 text-[#ff812c]" />
        </div>
      </div>

      {(hint || href) && (
        <div className="mt-4 flex items-end justify-between gap-3">
          {hint ? (
            <p className="text-[13px] text-slate-500 dark:text-slate-500 font-medium leading-snug">{hint}</p>
          ) : (
            <span />
          )}
          {href && (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[13px] font-semibold text-slate-400 dark:text-slate-500 transition-colors group-hover:text-[#ff812c]">
              {accion ?? "Ver"}
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      )}
    </>
  );

  /* El borde transparente va también en la tarjeta quieta: si apareciera solo
     al pasar el cursor, la tarjeta crecería un píxel y el tablero entero
     temblaría. Del mismo modo, el efecto se hace con color de fondo, color de
     borde y sombra —tres propiedades de toda la vida— y no con `ring` ni
     `translate`: en Tailwind 4 esos dos se apoyan en propiedades registradas
     (@property) que aquí no llegan a computarse. */
  const base =
    "bg-[#FFFFFF] dark:bg-[#2C2C2E] border border-transparent rounded-3xl p-5 sm:p-6 shadow-sm transition-all duration-200 flex flex-col justify-between h-full";

  if (!href) return <div className={base}>{cuerpo}</div>;

  return (
    <Link
      href={href}
      className={cn(
        base,
        "group cursor-pointer",
        "hover:bg-[#ff812c]/10 dark:hover:bg-[#ff812c]/15 hover:border-[#ff812c]/50 hover:shadow-lg",
        "active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff812c]"
      )}
    >
      {cuerpo}
    </Link>
  );
}

export default function DashboardPage() {
  const profile = useProfile();
  // El cliente ve solo lo suyo: sin métricas internas de tesorería ni de flota.
  const esCliente = ROLES_DEL_COMERCIO.includes(profile.role);
  const puede = (destino: keyof typeof ALCANCE) => ALCANCE[destino].includes(profile.role);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("at_dashboard_kpis").then(({ data }) => {
      if (data) setKpis(data as DashboardKpis);
    });
  }, []);

  const subtitulo = esCliente
    ? "Métricas de tus envíos: recogida, última milla y recaudo"
    : "Métricas clave del flujograma: recogida, CEDI, última milla y recaudo";

  if (!kpis) {
    return (
      <div className="pb-10 space-y-6 font-sans">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Mi panel</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">{subtitulo}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[15px]">Cargando métricas…</p>
        </div>
      </div>
    );
  }

  const total = ORDER.reduce((acc, s) => acc + (kpis.by_status[s] ?? 0), 0);
  const max = Math.max(1, ...ORDER.map((s) => kpis.by_status[s] ?? 0));
  const verGuias = puede("guias");

  return (
    <div className="pb-10 space-y-8 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Mi panel</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">{subtitulo}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icon={PackagePlus}
          label="Pedidos creados hoy"
          value={String(kpis.guides_today)}
          href={verGuias ? "/pedidos?creadas=hoy" : undefined}
          accion="Ver guías"
        />
        <Kpi
          icon={PackageCheck}
          label="Entregadas hoy"
          value={String(kpis.delivered_today)}
          href={verGuias ? "/pedidos?estado=entregada&entregadas=hoy" : undefined}
          accion="Ver guías"
        />
        <Kpi
          icon={Clock}
          label="Lead Time de Recogida (LTR)"
          value={kpis.ltr_hours != null ? `${kpis.ltr_hours} h` : "—"}
          hint="Promedio solicitud → digitalización (30 días)"
          href={puede("recogidas") ? "/recogidas?estado=completada" : undefined}
          accion="Ver recogidas"
        />
        <Kpi
          icon={RotateCcw}
          label="Tasa de Logística Inversa (TLI)"
          value={kpis.tli_pct != null ? `${kpis.tli_pct}%` : "—"}
          hint="% de guías finalizadas en devolución (30 días)"
          href={verGuias ? "/pedidos?estado=devuelta" : undefined}
          accion="Ver devueltas"
        />
        <Kpi
          icon={Banknote}
          label={esCliente ? "Recaudo contraentrega pendiente" : "Recaudo por consignar"}
          value={formatCOP(kpis.cod_pending)}
          hint={esCliente ? "De tus guías entregadas, aún sin liquidar" : `${kpis.settlements_pending} cierre(s) de caja en proceso`}
          /* El comercio no entra a tesorería: su plata pendiente son sus propias
             guías entregadas sin liquidar, y eso lo ve en su listado de guías. */
          href={
            esCliente
              ? "/pedidos?estado=entregada&cod=pendiente"
              : puede("recaudo")
                ? "/recaudo?filtro=sin-consignar"
                : undefined
          }
          accion={esCliente ? "Ver guías" : "Ver recaudo"}
        />
        {!esCliente && (
          <Kpi
            icon={Bike}
            label="Mensajeros con carga activa"
            value={String(kpis.active_couriers)}
            href={puede("mapa") ? "/mapa?flota=activa" : undefined}
            accion="Ver flota"
          />
        )}
      </div>

      {/* Translúcida y con blur (patrón probado en vivo). Es la tarjeta
          principal de lectura del panel; las tarjetas KPI de arriba se
          quedan opacas por ser tiles repetidos, no la tarjeta única. */}
      <div className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-sm transition-colors duration-300">
        <h2 className="text-[20px] font-bold text-slate-900 dark:text-white">Pedidos por estado</h2>
        <p className="mt-1 mb-8 text-[15px] text-slate-500 dark:text-slate-400 font-medium">
          {total} guías en total
          {verGuias && " · toca un estado para ver esas guías"}
        </p>

        <div className="space-y-2">
          {ORDER.map((s) => {
            const n = kpis.by_status[s] ?? 0;
            if (n === 0) return null;

            /* La etiqueta se estrecha en teléfono: con 128 px fijos la barra
               se quedaba en un muñón de 40 px y el gráfico no decía nada. */
            const fila = (
              <>
                <span className="w-20 sm:w-32 shrink-0 truncate text-[13px] sm:text-[14px] font-semibold text-slate-600 dark:text-slate-400 transition-colors group-hover:text-[#ff812c]">
                  {GUIDE_STATUS_LABELS[s]}
                </span>
                <div className="h-7 min-w-0 flex-1 overflow-hidden rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] transition-colors group-hover:bg-[#ff812c]/10">
                  <div
                    className={`h-full rounded-xl transition-all duration-500 ease-out group-hover:brightness-110 ${BAR_COLORS[s]}`}
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 sm:w-10 shrink-0 text-right text-[15px] font-bold tabular-nums text-slate-900 dark:text-white transition-colors group-hover:text-[#ff812c]">
                  {n}
                </span>
              </>
            );

            if (!verGuias) {
              return (
                <div key={s} className="flex items-center gap-3 sm:gap-4 px-2 py-1.5">
                  {fila}
                </div>
              );
            }

            return (
              <Link
                key={s}
                href={`/pedidos?estado=${s}`}
                title={`Ver las guías en estado ${GUIDE_STATUS_LABELS[s]}`}
                className="group -mx-2 flex items-center gap-3 sm:gap-4 rounded-2xl px-2 py-1.5 cursor-pointer transition-colors hover:bg-[#ff812c]/10 dark:hover:bg-[#ff812c]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff812c]"
              >
                {fila}
                <ChevronRight className="hidden sm:block w-4 h-4 shrink-0 text-[#ff812c] opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
