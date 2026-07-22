import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2 bg-slate-800/80 border border-slate-700/50 px-3 py-1.5 rounded-full", className)}>
      <span className="grid size-8 place-items-center rounded-full bg-[#ff812c] text-[#1C1C1E] shadow-sm">
        <Truck className="size-4" />
      </span>
      <span className="text-lg tracking-tight">
        <span className="text-white font-semibold">A&nbsp;Tiempo</span>
        <span className="text-[#ff812c] font-bold"> Logística</span>
      </span>
    </div>
  );
}
