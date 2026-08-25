"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Package,
  Phone,
  RefreshCcw,
  TruckIcon,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatCOP } from "@/lib/utils";
import type { Guide, GuideEvent, GuideStatus } from "@/lib/types";
import { useProfile } from "@/components/ProfileContext";

// ── Tipos de razón de novedad ─────────────────────────────────────────────────
const NOVEDAD_REASONS = [
  "Destinatario ausente",
  "Dirección incorrecta",
  "Destinatario no recibe",
  "Zona de orden público",
  "Paquete sin abrir / rechazado",
  "Negocio cerrado",
  "Sin acceso al lugar",
  "Otro",
] as const;
type NovedadReason = (typeof NOVEDAD_REASONS)[number];

// ── Helper: badge de estado ────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  novedad: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  reprogramada: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  en_devolucion: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  devuelta: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  en_ruta: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  entregada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function StatusBadge({ status }: { status: GuideStatus }) {
  const cls = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {GUIDE_STATUS_LABELS[status]}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "amber",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: "amber" | "rose" | "emerald" | "blue";
}) {
  const iconBg: Record<string, string> = {
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
    emerald: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="bg-white dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between gap-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <p className="mt-1 text-[26px] sm:text-[28px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none tabular-nums break-words">
            {value}
          </p>
        </div>
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBg[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {sub && <p className="text-[12px] text-slate-500 dark:text-slate-500 font-medium">{sub}</p>}
    </div>
  );
}

// ── Timeline de eventos ────────────────────────────────────────────────────────
function EventTimeline({ events }: { events: GuideEvent[] }) {
  return (
    <ol className="relative border-l-2 border-amber-200 dark:border-amber-800 ml-3 space-y-4 py-2">
      {events.map((ev, i) => (
        <li key={ev.id} className="ml-5">
          <span
            className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white dark:border-[#2C2C2E] ${
              i === 0 ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
            }`}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
              {GUIDE_STATUS_LABELS[ev.status]}
              {ev.actor && (
                <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
                  — {ev.actor.full_name}
                </span>
              )}
            </span>
            {ev.note && (
              <span className="text-[12px] text-slate-500 dark:text-slate-400 italic">
                &quot;{ev.note}&quot;
              </span>
            )}
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {new Date(ev.created_at).toLocaleString("es-CO", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Tarjeta de guía en novedad ─────────────────────────────────────────────────
function GuideNovedadCard({
  guide,
  onAction,
  canAct,
}: {
  guide: Guide & { events?: GuideEvent[] };
  onAction: (guide: Guide, action: "reprogramar" | "devolucion") => void;
  canAct: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-[#2C2C2E] rounded-3xl shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-4 p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[13px] font-bold font-mono text-slate-600 dark:text-slate-300">
              #{guide.guide_number}
            </span>
            <StatusBadge status={guide.status} />
            {guide.delivery_attempts > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">
                <RefreshCcw className="w-3 h-3" />
                {guide.delivery_attempts} intento{guide.delivery_attempts > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
            {guide.recipient_name}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
            <span className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400">
              <MapPin className="w-3.5 h-3.5" />
              {guide.recipient_address}, {guide.recipient_city}
            </span>
            {guide.recipient_phone && (
              <span className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400">
                <Phone className="w-3.5 h-3.5" />
                {guide.recipient_phone}
              </span>
            )}
          </div>
          {guide.at_clients && (
            <p className="mt-1 text-[12px] text-[#ff812c] font-semibold">
              📦 {guide.at_clients.business_name}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {guide.is_cod && (
            <div className="text-right">
              <p className="text-[11px] text-slate-400 font-medium">COD</p>
              <p className="text-[14px] font-bold text-slate-900 dark:text-white">
                {formatCOP(guide.cod_amount)}
              </p>
            </div>
          )}
          <div className="text-slate-400 mt-auto">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="border-t border-slate-900/[0.06] dark:border-white/[0.08] px-5 pb-5 pt-4 space-y-5 animate-in slide-in-from-top-2 duration-200">
          {/* Notes */}
          {guide.notes && (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-800 dark:text-amber-300">{guide.notes}</p>
            </div>
          )}

          {/* Event timeline */}
          {guide.events && guide.events.length > 0 && (
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Historial
              </h4>
              <EventTimeline events={guide.events} />
            </div>
          )}

          {/* Action buttons */}
          {canAct && guide.status === "novedad" && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => onAction(guide, "reprogramar")}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-[13px] font-bold py-3 px-4 transition-all"
              >
                <CalendarClock className="w-4 h-4" />
                Reprogramar
              </button>
              <button
                onClick={() => onAction(guide, "devolucion")}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-[13px] font-bold py-3 px-4 transition-all"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Enviar devolución
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal de acción ────────────────────────────────────────────────────────────
function ActionModal({
  guide,
  action,
  onClose,
  onConfirm,
}: {
  guide: Guide;
  action: "reprogramar" | "devolucion";
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<NovedadReason | "">("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isReprogramar = action === "reprogramar";
  const note = reason ? (extra ? `${reason}: ${extra}` : reason) : extra;

  async function handleConfirm() {
    if (!note.trim()) {
      setError("Debes seleccionar o escribir una razón.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onConfirm(note);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al procesar la acción");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-[#2C2C2E] rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 text-[12px] font-bold ${
              isReprogramar
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
            }`}>
              {isReprogramar ? <CalendarClock className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
              {isReprogramar ? "Reprogramar entrega" : "Iniciar devolución"}
            </div>
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">
              Guía #{guide.guide_number}
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
              {guide.recipient_name} — {guide.recipient_city}
            </p>
            {guide.delivery_attempts >= 2 && !isReprogramar && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-rose-600 dark:text-rose-400 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                2do intento fallido — pasará a logística inversa definitiva
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reason selector */}
        <div>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Razón de la novedad
          </label>
          <div className="flex flex-wrap gap-2">
            {NOVEDAD_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(reason === r ? "" : r)}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-all ${
                  reason === r
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "border-slate-900/[0.06] dark:border-white/[0.10] text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Extra note */}
        <div>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Observación adicional
          </label>
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={2}
            placeholder={isReprogramar ? "Ej: Cliente disponible a partir de las 3pm..." : "Ej: Paquete en buen estado, sin abrir..."}
            className="w-full text-[13px] px-4 py-3 rounded-xl border border-slate-900/[0.06] dark:border-white/[0.10] atl-relleno  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
        </div>

        {error && (
          <p className="text-[13px] text-rose-600 dark:text-rose-400 font-medium">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-900/[0.06] dark:border-white/[0.10] text-[14px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 py-3 rounded-xl text-[14px] font-bold text-white transition-all active:scale-95 disabled:opacity-60 ${
              isReprogramar
                ? "bg-orange-500 hover:bg-orange-600"
                : "bg-rose-500 hover:bg-rose-600"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando…
              </span>
            ) : isReprogramar ? (
              "Confirmar reprogramación"
            ) : (
              "Confirmar devolución"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────────
const FILTER_STATUSES: { value: GuideStatus | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "novedad", label: "Novedad" },
  { value: "reprogramada", label: "Reprogramada" },
  { value: "en_devolucion", label: "En devolución" },
  { value: "devuelta", label: "Devuelta" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NovedadesPage() {
  const profile = useProfile();
  const canAct = ["admin", "coordinador", "operario", "admin_cedi"].includes(profile.role);

  const [guides, setGuides] = useState<(Guide & { events?: GuideEvent[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<GuideStatus | "all">("novedad");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ guide: Guide; action: "reprogramar" | "devolucion" } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const incidentStatuses: GuideStatus[] = ["novedad", "reprogramada", "en_devolucion", "devuelta"];
    const { data } = await supabase
      .from("at_guides")
      .select(`
        *,
        at_clients(business_name),
        at_zones(name),
        courier:at_profiles!at_guides_courier_id_fkey(full_name),
        events:at_guide_events(*, actor:at_profiles!at_guide_events_actor_id_fkey(full_name))
      `)
      .in("status", incidentStatuses)
      .order("updated_at", { ascending: false });
    if (data) setGuides(data as (Guide & { events?: GuideEvent[] })[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── KPI calculations ─────────────────────────────────────────────────────────
  const novedad = guides.filter((g) => g.status === "novedad").length;
  const reprogramada = guides.filter((g) => g.status === "reprogramada").length;
  const enDevolucion = guides.filter((g) => g.status === "en_devolucion").length;
  const multipleAttempts = guides.filter((g) => g.delivery_attempts >= 2).length;
  const codAtRisk = guides
    .filter((g) => g.is_cod && ["novedad", "reprogramada", "en_devolucion"].includes(g.status))
    .reduce((sum, g) => sum + g.cod_amount, 0);

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = guides.filter((g) => {
    const matchStatus = filterStatus === "all" || g.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      g.guide_number.toLowerCase().includes(q) ||
      g.recipient_name.toLowerCase().includes(q) ||
      g.recipient_address.toLowerCase().includes(q) ||
      g.recipient_city.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ── Action handler ────────────────────────────────────────────────────────────
  async function handleConfirmAction(note: string) {
    if (!modal) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("at_process_return", {
      p_guide_id: modal.guide.id,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    showToast(
      modal.action === "reprogramar"
        ? "✅ Guía reprogramada correctamente"
        : "✅ Guía enviada a devolución",
      "success"
    );
    setModal(null);
    await load();
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-[12px] font-bold mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Gestión de incidencias
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Dashboard de Novedades
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Guías con incidencia: reprograma o envía a logística inversa desde aquí.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-[#2C2C2E] border border-slate-900/[0.06] dark:border-white/[0.10] hover:border-[#ff812c] hover:text-[#ff812c] rounded-2xl px-4 py-2.5 transition-all active:scale-95 self-start sm:self-end"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={AlertTriangle}
          label="En novedad ahora"
          value={String(novedad)}
          sub="Requieren acción inmediata"
          color="amber"
        />
        <KpiCard
          icon={CalendarClock}
          label="Reprogramadas"
          value={String(reprogramada)}
          sub="Pendientes de despacho"
          color="blue"
        />
        <KpiCard
          icon={TruckIcon}
          label="En devolución"
          value={String(enDevolucion)}
          sub="Logística inversa activa"
          color="rose"
        />
        <KpiCard
          icon={Package}
          label="COD en riesgo"
          value={formatCOP(codAtRisk)}
          sub={`${multipleAttempts} guías con ≥2 intentos`}
          color="rose"
        />
      </div>

      {/* Alert banner: multiple attempts */}
      {multipleAttempts > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-bold text-rose-800 dark:text-rose-300">
              {multipleAttempts} guía{multipleAttempts > 1 ? "s" : ""} con 2 o más intentos fallidos
            </p>
            <p className="text-[13px] text-rose-600 dark:text-rose-400 mt-0.5">
              Al procesar estas novedades, el sistema las enviará directamente a devolución según la regla de 2 intentos máximos.
            </p>
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Status pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1 min-w-0 sm:flex-1">
          {FILTER_STATUSES.map((f) => {
            const count = f.value === "all"
              ? guides.length
              : guides.filter((g) => g.status === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={`flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold px-3.5 py-2 rounded-full border transition-all ${
                  filterStatus === f.value
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "border-slate-900/[0.06] dark:border-white/[0.10] text-slate-500 dark:text-slate-400 hover:border-amber-400 bg-white dark:bg-[#2C2C2E]"
                }`}
              >
                {f.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterStatus === f.value
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar guía, destinatario, dirección…"
          className="w-full sm:w-72 sm:shrink-0 text-[13px] px-4 py-2.5 rounded-2xl border border-slate-900/[0.06] dark:border-white/[0.10] bg-white dark:bg-[#2C2C2E] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
        />
      </div>

      {/* Guides list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[15px]">Cargando novedades…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 dark:text-slate-500">
          <CheckCircle2 className="w-12 h-12 text-emerald-400" />
          <p className="text-[16px] font-semibold text-slate-600 dark:text-slate-300">
            {search || filterStatus !== "all" ? "Sin resultados para este filtro" : "¡Sin novedades activas!"}
          </p>
          <p className="text-[13px]">
            {!search && filterStatus === "all" && "Todas las guías están en estado normal."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium">
            Mostrando {filtered.length} guía{filtered.length !== 1 ? "s" : ""}
          </p>
          {filtered.map((g) => (
            <GuideNovedadCard
              key={g.id}
              guide={g}
              onAction={(guide, action) => setModal({ guide, action })}
              canAct={canAct}
            />
          ))}
        </div>
      )}

      {/* Action modal */}
      {modal && (
        <ActionModal
          guide={modal.guide}
          action={modal.action}
          onClose={() => setModal(null)}
          onConfirm={handleConfirmAction}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white text-[14px] font-semibold shadow-2xl animate-in slide-in-from-bottom-4 ${
            toast.type === "success" ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
