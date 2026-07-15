import { GUIDE_STATUS_COLORS, GUIDE_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { GuideStatus } from "@/lib/types";

export function StatusBadge({
  status,
  large = false,
}: {
  status: GuideStatus;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        GUIDE_STATUS_COLORS[status],
        large ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"
      )}
    >
      {GUIDE_STATUS_LABELS[status]}
    </span>
  );
}

export function Pill({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tones[tone]
      )}
    >
      {label}
    </span>
  );
}
