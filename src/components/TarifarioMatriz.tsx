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
 * El precio como se escribe en Colombia, pero apretado.
 *
 * `formatCOP` es el formateador de plata de toda la app y devuelve «$ 11.500»,
 * con un espacio duro detrás del signo. En una matriz de diez columnas ese
 * espacio son diez columnas de ancho regalado, así que aquí —y solo aquí— se
 * quita. Los separadores de miles siguen saliendo del mismo `Intl`, de modo que
 * la cifra se escribe igual que en Facturación o Recaudo.
 */
function pesos(valor: number): string {
  return formatCOP(valor).replace(/\s/g, "");
}

/**
 * El fondo de las celdas fijas.
 *
 * Una celda `sticky` tiene que tapar lo que le pasa por debajo, asi que no
 * puede ser translucida. `--atl-cristal-relleno` es el mismo token que usa
 * `.atl-relleno`; la diferencia es que aqui va a opacidad 1. Al venir del tema,
 * el gris del claro y el navy del oscuro y el multicolor salen solos.
 */
const fondoFijo = { backgroundColor: "rgb(var(--atl-cristal-relleno))" };

/**
 * De «$12.500» de vuelta a «12500».
 *
 * Hace falta porque la celda dejó de ser `type="number"`: con el punto de los
 * miles, `Number("11.500")` da 11,5 —el punto es decimal para JavaScript— y se
 * habría guardado once pesos con cincuenta en lugar de once mil quinientos.
 * Quedarse solo con los dígitos evita esa lectura y de paso acepta que alguien
 * teclee el «$» o los puntos a mano.
 */
function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * Una celda de la matriz.
 *
 * Mientras no se está escribiendo muestra el precio formateado; al entrar al
 * campo enseña el número pelado, que es lo que se puede corregir a mano. El
 * estado local es solo eso —el texto que se está tecleando—: quién guarda y
 * cuándo sigue siendo cosa de `guardar()`, que no cambió.
 */
function CeldaTarifa({
  valor,
  mismaZona,
  ocupada,
  etiqueta,
  titulo,
  onGuardar,
}: {
  valor: number;
  mismaZona: boolean;
  ocupada: boolean;
  etiqueta: string;
  titulo: string;
  onGuardar: (valor: string) => void;
}) {
  // `null` = nadie está escribiendo, así que manda el valor de la base.
  const [texto, setTexto] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={texto ?? pesos(valor)}
      onFocus={() => setTexto(String(valor))}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={(e) => {
        setTexto(null);
        onGuardar(soloDigitos(e.target.value));
      }}
      aria-label={etiqueta}
      title={titulo}
      className={`w-[104px] rounded-lg border px-2 py-2 text-center text-[14px] tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-[#ff812c] ${
        mismaZona
          ? "border-[#ff812c]/40 bg-[#ff812c]/10 font-bold text-[#ff812c]"
          : "border-slate-200 bg-transparent text-slate-900 dark:border-slate-700 dark:text-white"
      } ${ocupada ? "opacity-50" : ""}`}
    />
  );
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
  // La celda que tiene el cursor encima, para iluminar su fila y su columna.
  const [cruz, setCruz] = useState<{ o: string; d: string } | null>(null);

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
      <p className="rounded-2xl atl-superficie p-5 text-center text-sm text-slate-500 dark:text-slate-400">
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

      {/* Translucida y con blur la tarjeta; la cabecera y la primera columna
          van OPACAS, que es lo que decía este comentario desde el principio
          aunque el código usara `atl-superficie` (translúcida) y dejara ver las
          filas pasando por debajo al hacer scroll.

          El fondo opaco sale igualmente del tema: `--atl-cristal-relleno` es el
          token de relleno que globals.css redefine en claro, oscuro y
          multicolor; aquí se usa a opacidad 1. Va en `style` y no en una clase
          arbitraria porque es la única forma de garantizar que el valor llegue
          al CSS sin depender de cómo Tailwind resuelva `var()` anidada dentro
          de un `rgb()`: si esa clase no se generara, las celdas fijas se
          volverían transparentes y el sticky no serviría de nada.

          `max-h`+`overflow-auto`: el sticky vertical necesita que el que
          desplaza sea este contenedor. Con solo `overflow-x-auto` la tabla no
          tenía scroll propio hacia abajo y `top-0` no se activaba nunca. */}
      <div className="max-h-[70vh] overflow-auto rounded-2xl atl-superficie shadow-sm">
        {/* `border-separate`: con `border-collapse` los bordes de las celdas
            fijas se quedan atrás al desplazar —el borde pertenece a la tabla, no
            a la celda— y la cabecera aparece sin línea inferior. Por eso los
            bordes de fila se mudan de `<tr>` a cada celda. */}
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {/* La esquina: fija en los dos ejes, y por encima de las dos
                  bandas que se cruzan por debajo de ella. */}
              <th
                style={fondoFijo}
                className="sticky left-0 top-0 z-30 border-b border-slate-900/[0.06] px-4 py-3 text-left text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:border-white/[0.08] dark:text-slate-400"
              >
                Desde ↓ / Hacia →
              </th>
              {zonas.map((z) => (
                <th
                  key={z.id}
                  style={fondoFijo}
                  // El nombre completo de la zona al pasar el cursor: la
                  // cabecera solo tiene sitio para el código, y «MED-SL» no le
                  // dice nada a quien no se sabe la tabla de memoria.
                  title={z.name}
                  className={`sticky top-0 z-20 border-b border-slate-900/[0.06] px-3 py-3 text-center text-[12px] font-medium uppercase tracking-wide transition-colors dark:border-white/[0.08] ${
                    cruz?.d === z.id
                      ? "text-[#ff812c]"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {/* El código es justo lo que hace falta en una cabecera de 10
                      columnas. Si la zona no tiene —las de antes de la 0089—,
                      se cae al recorte del nombre de siempre. */}
                  {z.code ?? z.name.replace(/^Zona\s*/i, "Z").split("·")[0].trim()}
                </th>
              ))}
            </tr>
          </thead>
          {/* Soltar el cursor apaga la cruz. Va en el `<tbody>` y no celda a
              celda: así no parpadea al pasar de una celda a la de al lado. */}
          <tbody onMouseLeave={() => setCruz(null)}>
            {zonas.map((o) => (
              <tr key={o.id}>
                <td
                  style={fondoFijo}
                  title={o.name}
                  className={`sticky left-0 z-10 max-w-[180px] truncate border-b border-slate-900/[0.04] px-4 py-2 text-[14px] font-semibold transition-colors dark:border-white/[0.04] ${
                    cruz?.o === o.id ? "text-[#ff812c]" : "text-slate-900 dark:text-white"
                  }`}
                >
                  {o.name}
                </td>
                {zonas.map((d) => {
                  const k = clave(o.id, d.id);
                  const mismaZona = o.id === d.id;
                  // La cruz: se ilumina toda la fila y toda la columna de la
                  // celda señalada, que es cómo se lee una matriz de 10×10 sin
                  // ir contando con el dedo.
                  const enLaCruz = cruz !== null && (cruz.o === o.id || cruz.d === d.id);
                  return (
                    <td
                      key={d.id}
                      onMouseEnter={() => setCruz({ o: o.id, d: d.id })}
                      className={`border-b border-slate-900/[0.04] px-1.5 py-1.5 transition-colors dark:border-white/[0.04] ${
                        enLaCruz ? "bg-[#ff812c]/[0.07]" : ""
                      }`}
                    >
                      <CeldaTarifa
                        valor={tarifas[k] ?? 0}
                        mismaZona={mismaZona}
                        ocupada={guardando === k}
                        etiqueta={`Tarifa de ${o.name} a ${d.name}`}
                        titulo={`${o.name} → ${d.name} · ${formatCOP(tarifas[k] ?? 0)}`}
                        onGuardar={(valor) => guardar(o.id, d.id, valor)}
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
