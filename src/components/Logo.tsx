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
    <div className={cn("flex items-center gap-2", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-brand-500 text-white shadow-sm">
        <Truck className="size-5" />
      </span>
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          dark ? "text-white" : "text-navy-900"
        )}
      >
        A&nbsp;Tiempo
        <span className="text-brand-500"> Logística</span>
      </span>
    </div>
  );
}
