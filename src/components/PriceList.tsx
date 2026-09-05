"use client";

import { Tag } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import type { Zone } from "@/lib/types";

/**
 * Tarifario por zona visible para el cliente.
 * Solo muestra delivery_rate (lo que se le cobra). El pago al domiciliario vive
 * en at_zone_costs, con RLS de solo-staff, para no exponer el margen.
 *
 * `tarifas` es el precio REAL de este comercio hacia cada zona, el que devuelve
 * at_mi_tarifario. Sin él, esta lista mostraba `at_zones.delivery_rate` —la
 * tarifa saliendo del CEDI— mientras el resumen del pedido, dos bloques más
 * arriba en la misma pantalla, mostraba el de la matriz origen×destino. Dos
 * cifras distintas para el mismo envío, a la vista al mismo tiempo.
 */
export function PriceList({
  zones,
  activeZoneId,
  tarifas,
}: {
  zones: Zone[];
  activeZoneId?: string | null;
  /** zona → lo que le cuesta a ESTE comercio llegar allá (at_mi_tarifario). */
  tarifas?: Record<string, number>;
}) {
  if (zones.length === 0) return null;

  return (
    <section>
      <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
        Precios por zona
      </h3>
      {/* Translucida y con blur (patron probado en vivo). Es solo lectura del tarifario, sin campos ni modal debajo. */}
      <div className="atl-superficie   rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
        <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
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
                  {/* El código no se le muestra al comercio: a él le sirve el
                      nombre y la lista de barrios. «MED-SO» es vocabulario del
                      CEDI y aquí solo sería ruido. */}
                  {z.coverage && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{z.coverage}</p>
                  )}
                </div>
                <p className="text-[16px] font-bold text-slate-900 dark:text-white shrink-0">
                  {formatCOP(tarifas?.[z.id] ?? z.delivery_rate)}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-2.5 text-[12px] text-slate-400 dark:text-slate-500 atl-relleno ">
          Tarifa por paquete entregado. Fuera de estas zonas el CEDI confirma cobertura.
        </p>
      </div>
    </section>
  );
}
