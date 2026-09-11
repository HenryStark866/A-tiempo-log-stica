"use client";

import { useMemo, useState } from "react";
import { Check, MapPin, MapPinOff, Tag } from "lucide-react";
import { formatCOP, normalizarBusqueda } from "@/lib/utils";
import type { Zone } from "@/lib/types";

/** Cuántos barrios se ven antes de tener que pedir el resto. */
const BARRIOS_VISIBLES = 5;

/**
 * Los barrios de una zona, como lista.
 *
 * `coverage` llega de la base como una cadena separada por comas. Se partía
 * nunca: se pintaba entera en un `<p class="truncate">`, así que de «Provenza,
 * Laureles, Estadio, Bolivariana…» se leía hasta donde alcanzara el ancho de la
 * tarjeta y el resto no existía para el comercio.
 */
function barriosDe(coverage: string | null): string[] {
  if (!coverage) return [];
  return coverage
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Una zona con su precio y sus barrios.
 *
 * `abierta` es estado de esta tarjeta y de ninguna otra: expandir «Sur» no
 * tiene por qué expandir las nueve restantes.
 */
function TarjetaZona({
  zona,
  precio,
  activa,
  busca,
}: {
  zona: Zone;
  precio: number;
  activa: boolean;
  busca: string;
}) {
  const [abierta, setAbierta] = useState(false);

  const barrios = useMemo(() => barriosDe(zona.coverage), [zona.coverage]);

  // Con búsqueda puesta, los barrios que coinciden se van al frente. Así el que
  // se buscaba entra siempre en los cinco visibles y no hay que expandir la
  // tarjeta para comprobar que sí está cubierto — que era justo la pregunta.
  const ordenados = useMemo(() => {
    const q = normalizarBusqueda(busca.trim());
    if (!q) return barrios;
    const coincide = (b: string) => normalizarBusqueda(b).includes(q);
    return [...barrios.filter(coincide), ...barrios.filter((b) => !coincide(b))];
  }, [barrios, busca]);

  const q = normalizarBusqueda(busca.trim());
  const visibles = abierta ? ordenados : ordenados.slice(0, BARRIOS_VISIBLES);
  const ocultos = ordenados.length - visibles.length;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-4 shadow-sm transition-colors ${
        activa
          ? "bg-[#ff812c]/10 ring-1 ring-inset ring-[#ff812c]/30"
          : "atl-superficie ring-1 ring-inset ring-slate-900/[0.06] dark:ring-white/[0.08]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Tag
            className={`size-4 shrink-0 ${
              activa ? "text-[#ff812c]" : "text-slate-300 dark:text-slate-600"
            }`}
          />
          {/* El código no se le muestra al comercio: a él le sirve el nombre y
              la lista de barrios. «MED-SO» es vocabulario del CEDI y aquí solo
              sería ruido. */}
          <p
            className={`truncate text-[15px] font-semibold ${
              activa ? "text-[#ff812c]" : "text-slate-900 dark:text-white"
            }`}
          >
            {zona.name}
          </p>
        </div>
        {/* El precio es lo que se viene a mirar: se queda grande, en negrita y
            con números tabulares para que las tarjetas alineen sus cifras. */}
        <p className="shrink-0 text-[18px] font-bold tabular-nums text-slate-900 dark:text-white">
          {formatCOP(precio)}
        </p>
      </div>

      {ordenados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibles.map((barrio, i) => {
            const resaltado = q !== "" && normalizarBusqueda(barrio).includes(q);
            return (
              <span
                // El nombre más la posición: si la cobertura trae un barrio
                // repetido, la clave sigue siendo única y React no protesta.
                key={`${barrio}-${i}`}
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset transition-colors ${
                  resaltado
                    ? "bg-[#ff812c]/15 text-[#ff812c] ring-[#ff812c]/30"
                    : "atl-relleno text-slate-600 ring-slate-900/[0.06] dark:text-slate-300 dark:ring-white/[0.08]"
                }`}
              >
                {barrio}
              </span>
            );
          })}
          {ocultos > 0 && (
            <button
              type="button"
              onClick={() => setAbierta(true)}
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold text-slate-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-[#ff812c] dark:text-slate-400"
            >
              +{ocultos} más
            </button>
          )}
          {abierta && ordenados.length > BARRIOS_VISIBLES && (
            <button
              type="button"
              onClick={() => setAbierta(false)}
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold text-slate-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-[#ff812c] dark:text-slate-400"
            >
              Ver menos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  barrioManual = "",
  onBarrioManual,
}: {
  zones: Zone[];
  activeZoneId?: string | null;
  /** zona → lo que le cuesta a ESTE comercio llegar allá (at_mi_tarifario). */
  tarifas?: Record<string, number>;
  /**
   * El barrio que el comercio escribió cuando su destino no cayó en ninguna
   * zona. Lo guarda el formulario del pedido, no este componente: aquí solo se
   * muestra y se avisa de los cambios.
   */
  barrioManual?: string;
  onBarrioManual?: (barrio: string) => void;
}) {
  const [busca, setBusca] = useState("");

  // La zona entra si coincide su nombre o cualquiera de sus barrios: el comercio
  // busca «Provenza», no «Sur». `normalizarBusqueda` quita tildes y mayúsculas,
  // así que «bello» encuentra «Bello» y «sabaneta» encuentra «Sabanetá» si a
  // alguien se le fue el acento al cargar la cobertura.
  const filtradas = useMemo(() => {
    const q = normalizarBusqueda(busca.trim());
    if (!q) return zones;
    return zones.filter((z) => {
      if (normalizarBusqueda(z.name).includes(q)) return true;
      return barriosDe(z.coverage).some((b) => normalizarBusqueda(b).includes(q));
    });
  }, [zones, busca]);

  // «Envíos desde X»: la tarifa más barata que tiene ESTE comercio, no una cifra
  // escrita a mano. Un número fijo en el texto envejece en cuanto alguien toca
  // la matriz, y el comercio lo leería como una promesa. Sale de la misma
  // fuente que las tarjetas, así que las dos cosas no se pueden contradecir.
  const desde = useMemo(
    () => Math.min(...zones.map((z) => tarifas?.[z.id] ?? z.delivery_rate)),
    [zones, tarifas]
  );

  // Con una sola letra medio barrio de Medellín coincide y el grid parpadea
  // entero en cada tecla. A partir de dos, la búsqueda ya dice algo.
  const buscando = busca.trim().length >= 2;

  if (zones.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Precios por zona
      </h3>

      <div className="relative mb-3">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar barrio o municipio (ej. Provenza, Laureles, Envigado)…"
          aria-label="Buscar barrio o municipio"
          // Más grande que antes: ya no acompaña a la lista, es la interacción
          // principal de la sección. El placeholder se recorta en pantallas
          // estrechas, así que el ejemplo largo vive en el `title`.
          title="Buscar barrio o municipio (ej. Provenza, Laureles, Envigado)"
          className="atl-superficie w-full rounded-2xl py-3 pl-11 pr-4 text-[16px] text-slate-900 shadow-sm ring-1 ring-inset ring-slate-900/[0.06] transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c] dark:text-white dark:ring-white/[0.08] dark:placeholder:text-slate-500"
        />
      </div>

      {!buscando ? (
        // Divulgación progresiva: sin búsqueda no se pintan las diez zonas con
        // sus barrios, se pregunta a dónde va el paquete. La pregunta es la
        // misma que trae el comercio, así que la pantalla la hace primero.
        <div className="atl-superficie flex flex-col items-center gap-2 rounded-2xl px-4 py-12 text-center shadow-sm">
          <MapPin className="size-9 text-slate-300 dark:text-slate-600" />
          <p className="text-[17px] font-bold text-slate-900 dark:text-white">
            ¿A dónde envías?
          </p>
          <p className="max-w-[44ch] text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            Ingresa un barrio o municipio para conocer la tarifa exacta. Envíos desde{" "}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">
              {formatCOP(desde)}
            </strong>
            .
          </p>
        </div>
      ) : filtradas.length === 0 ? (
        // ── La tarjeta comodín ──────────────────────────────────────────────
        //
        // Cero coincidencias no es un error: es un barrio que existe y que no
        // tenemos zonificado. Antes aquí solo decía «sin resultados» y el
        // comercio seguía adelante escribiendo el pedido igual, así que el
        // nombre del sector se perdía y en el CEDI nadie se enteraba de que ese
        // destino existía. Ahora se pregunta y se guarda con el pedido.
        //
        // Lo que NO hace, a propósito: crear una zona. El texto viaja en la
        // guía —columna `recipient_neighborhood`, migración 0121— y muere ahí.
        // `at_zones` no se toca desde esta pantalla.
        <div className="rounded-2xl border border-[#ff812c]/30 bg-[#ff812c]/[0.06] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <MapPinOff className="mt-0.5 size-5 shrink-0 text-[#c2560a] dark:text-[#ffa869]" />
            <div className="min-w-0">
              <h4 className="text-[16px] font-semibold text-[#c2560a] dark:text-[#ffa869]">
                ¿No encuentras tu barrio?
              </h4>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                «{busca.trim()}» no está en ninguna de nuestras zonas. Escríbelo abajo
                y viaja con el pedido: el CEDI confirma la tarifa antes de despachar.
              </p>
            </div>
          </div>

          <label htmlFor="barrio-manual" className="sr-only">
            Nombre del barrio o sector
          </label>
          <input
            id="barrio-manual"
            type="text"
            value={barrioManual}
            onChange={(e) => onBarrioManual?.(e.target.value)}
            // El mismo tope que la base (migración 0121): un barrio es un
            // nombre corto, no un segundo campo de notas.
            maxLength={80}
            placeholder="Escribe el nombre de tu barrio o sector (ej. Zúñiga Alto)…"
            className="atl-relleno mt-4 w-full rounded-xl px-3.5 py-3 text-[15px] text-slate-900 outline-none ring-1 ring-inset ring-slate-900/[0.10] transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#ff812c] dark:text-white dark:ring-white/[0.12] dark:placeholder:text-slate-500"
          />

          {barrioManual.trim().length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#c2560a] dark:text-[#ffa869]">
              <Check className="size-3.5 shrink-0" />
              Anotado. Va con este pedido y nada más.
            </p>
          )}
        </div>
      ) : (
        // Dos columnas desde `md`: son diez zonas con sus barrios, y en una sola
        // columna la lista pedía el doble de scroll del que necesita.
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtradas.map((z) => (
            <TarjetaZona
              key={z.id}
              zona={z}
              precio={tarifas?.[z.id] ?? z.delivery_rate}
              activa={z.id === activeZoneId}
              busca={busca}
            />
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] text-slate-400 dark:text-slate-500">
        Tarifa por paquete entregado. Fuera de estas zonas el CEDI confirma cobertura.
      </p>
    </section>
  );
}
