"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCOP } from "@/lib/utils";

interface ZonaSimple {
  id: string;
  /** Código corto de la sub-zona. Null en las zonas anteriores a la 0089. */
  code: string | null;
  name: string;
  sort_order: number;
}
interface TarifaPar {
  origin_zone_id: string;
  dest_zone_id: string;
  delivery_rate: number;
}

/**
 * La matriz de precios: cuánto cuesta llevar un paquete DE una zona A otra.
 *
 * Se lee por filas: la fila es de dónde sale (la zona del comercio) y la
 * columna a dónde llega. La diagonal —mismo origen y destino— es el viaje
 * corto, y es lo que arregla cobrarle "Norte Extendido" a un comercio que ya
 * está en el norte.
 *
 * Cada celda se guarda sola al salir del campo: obligar a un botón de "guardar
 * todo" invita a perder el trabajo a medio camino. Con las 10 sub-zonas de la
 * migración 0089 son 100 celdas, así que eso importa más que cuando eran 25.
 */
export function TarifarioMatriz({ facilityId }: { facilityId?: string }) {
  const [zonas, setZonas] = useState<ZonaSimple[]>([]);
  const [tarifas, setTarifas] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clave = (o: string, d: string) => `${o}|${d}`;

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_tarifario_matriz", {
      p_facility_id: facilityId ?? null,
    });
    if (error) setError(error.message);
    const r = data as { zonas: ZonaSimple[]; tarifas: TarifaPar[] } | null;
    setZonas(r?.zonas ?? []);
    setTarifas(
      Object.fromEntries(
        (r?.tarifas ?? []).map((t) => [
          clave(t.origin_zone_id, t.dest_zone_id),
          Number(t.delivery_rate),
        ])
      )
    );
    setCargando(false);
  }, [facilityId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(origen: string, destino: string, valor: string) {
    const monto = Number(valor);
    if (!Number.isFinite(monto) || monto < 0) return;
    const k = clave(origen, destino);
    if (tarifas[k] === monto) return;

    setGuardando(k);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_set_tarifa_par", {
      p_origin_zone_id: origen,
      p_dest_zone_id: destino,
      p_delivery_rate: monto,
    });
    setGuardando(null);
    if (error) {
      setError(error.message);
      cargar();
      return;
    }
    setTarifas((t) => ({ ...t, [k]: monto }));
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-[#ff812c]" />
      </div>
    );
  }

  if (zonas.length === 0) {
    return (
      // Translucida y con blur (patron probado en produccion: /90 sin blur no se
      // notaba). Es el estado vacío, hace las veces de tarjeta principal aquí.
      <p className="rounded-2xl bg-[#FFFFFF]/75 p-5 text-center text-sm text-slate-500 dark:text-slate-400 backdrop-blur-xl dark:bg-[#2C2C2E]/75">
        Este CEDI todavía no tiene zonas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Cada fila es <strong className="text-slate-700 dark:text-slate-300">desde dónde sale</strong> el
        paquete y cada columna <strong className="text-slate-700 dark:text-slate-300">a dónde llega</strong>.
        La diagonal resaltada es el envío dentro de la misma zona. Cada celda se guarda sola.
      </p>

      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
          <p className="text-center text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {/* Translucida y con blur (patron probado en produccion). La cabecera y la
          columna sticky de la tabla se quedan opacas: son tabla anidada, no tarjeta. */}
      <div className="overflow-x-auto rounded-2xl bg-[#FFFFFF]/75 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-900/[0.06] dark:border-white/[0.08]">
              <th className="sticky left-0 z-10 bg-[#FFFFFF] px-4 py-3 text-left text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:bg-[#2C2C2E] dark:text-slate-400">
                Desde ↓ / Hacia →
              </th>
              {zonas.map((z) => (
                <th
                  key={z.id}
                  className="px-3 py-3 text-center text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {/* El código es justo lo que hace falta en una cabecera de 10
                      columnas. Si la zona no tiene —las de antes de la 0089—,
                      se cae al recorte del nombre de siempre. */}
                  {z.code ?? z.name.replace(/^Zona\s*/i, "Z").split("·")[0].trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zonas.map((o) => (
              <tr key={o.id} className="border-b border-slate-900/[0.04] last:border-0 dark:border-white/[0.04]">
                <td className="sticky left-0 z-10 max-w-[180px] truncate bg-[#FFFFFF] px-4 py-2 text-[14px] font-semibold text-slate-900 dark:bg-[#2C2C2E] dark:text-white">
                  {o.name}
                </td>
                {zonas.map((d) => {
                  const k = clave(o.id, d.id);
                  const mismaZona = o.id === d.id;
                  return (
                    <td key={d.id} className="px-1.5 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        defaultValue={tarifas[k] ?? 0}
                        onBlur={(e) => guardar(o.id, d.id, e.target.value)}
                        aria-label={`Tarifa de ${o.name} a ${d.name}`}
                        title={`${o.name} → ${d.name} · ${formatCOP(tarifas[k] ?? 0)}`}
                        className={`w-[92px] rounded-lg border px-2 py-2 text-center text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#ff812c] ${
                          mismaZona
                            ? "border-[#ff812c]/40 bg-[#ff812c]/10 font-bold text-[#ff812c]"
                            : "border-slate-200 bg-transparent text-slate-900 dark:border-slate-700 dark:text-white"
                        } ${guardando === k ? "opacity-50" : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
