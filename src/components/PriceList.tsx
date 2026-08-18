"use client";

import { Tag } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import type { Zone } from "@/lib/types";

/**
 * Tarifario por zona visible para el cliente.
 * Solo muestra delivery_rate (lo que se le cobra). El pago al domiciliario vive
 * en at_zone_costs, con RLS de solo-staff, para no exponer el margen.
 */
export function PriceList({ zones, activeZoneId }: { zones: Zone[]; activeZoneId?: string | null }) {
  if (zones.length === 0) return null;

  return (
    <section>
      <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
        Precios por zona
      </h3>
      {/* Translucida y con blur (patron probado en vivo). Es solo lectura del tarifario, sin campos ni modal debajo. */}
      <div className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {zones.map((z) => {
            const activa = z.id === activeZoneId;
            return (
              <li
                key={z.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  activa ? "bg-[#ff812c]/10" : ""
                }`}
              >
                <Tag className={`w-4 h-4 shrink-0 ${activa ? "text-[#ff812c]" : "text-slate-300 dark:text-slate-600"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold truncate ${activa ? "text-[#ff812c]" : "text-slate-900 dark:text-white"}`}>
                    {z.name}
                  </p>
                  {z.coverage && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{z.coverage}</p>
                  )}
                </div>
                <p className="text-[16px] font-bold text-slate-900 dark:text-white shrink-0">
                  {formatCOP(z.delivery_rate)}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-2.5 text-[12px] text-slate-400 dark:text-slate-500 bg-[#F2F2F7] dark:bg-[#1C1C1E]">
          Tarifa por paquete entregado. Fuera de estas zonas el CEDI confirma cobertura.
        </p>
      </div>
    </section>
  );
}
