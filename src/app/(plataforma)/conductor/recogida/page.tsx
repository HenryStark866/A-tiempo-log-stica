"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Warehouse,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Navigation2,
  Package,
  PackageCheck,
  Phone,
  Play,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { CediDestino } from "@/components/CediDestino";
import { RecogidaQR } from "@/components/RecogidaQR";
import { PositionReporter, activarUbicacion } from "@/components/PositionReporter";
import {
  buildNavUrl,
  getNavProvider,
  saveNavProvider,
  NAV_PROVIDER_LABELS,
  type NavProvider,
} from "@/lib/nav";
import { formatCOP } from "@/lib/utils";

interface PickupGuide {
  id: string;
  guide_number: string;
  recipient_name: string;
  recipient_city: string;
  is_cod: boolean;
  cod_amount: number;
}

/**
 * Una guía recién recogida, con la recomendación al lado
 * (at_guias_entrega_directa).
 *
 * `misma_zona` es una sugerencia, no un filtro: viene marcada la que va a la
 * zona del comercio, pero el mensajero puede llevarse cualquiera. Él es el que
 * está ahí y sabe cómo está el tráfico y qué le cabe en la moto.
 */
interface GuiaRecogida {
  id: string;
  guide_number: string;
  recipient_name: string;
  recipient_address: string;
  zone_name: string | null;
  is_cod: boolean;
  cod_amount: number;
  misma_zona: boolean;
}

interface Pickup {
  pickup_id: string;
  /** El código que el operario escanea en el muelle para ingresar el lote. */
  pickup_token: string;
  status: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  started_at: string | null;
  notes: string | null;
  business_name: string;
  business_phone: string | null;
  business_address: string | null;
  guias: PickupGuide[];
}

export default function CourierPickupPage() {
  const profile = useProfile();
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<string, Set<string>>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Lo que acaba de recoger, para que elija qué hace con ello: entregar algo
  // directo o arrancar para el CEDI. Guarda el id de la recogida porque la
  // segunda opción también es una acción de verdad, no un "cerrar ventana".
  const [directa, setDirecta] = useState<
    { pickupId: string; comercio: string; guias: GuiaRecogida[] } | null
  >(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [navProvider, setNavProvider] = useState<NavProvider | null>(null);
  // Cuando aún no eligió app de navegación, se pregunta antes de abrir nada.
  const [eligiendo, setEligiendo] = useState<{ direccion: string; ciudad?: string } | null>(null);

  useEffect(() => {
    setNavProvider(getNavProvider());
  }, []);

  /**
   * Abre Waze o Google Maps con la ruta ya trazada.
   *
   * Se abre en pestaña nueva y no en la misma para que el mensajero pueda
   * volver a la app con el botón de atrás sin perder dónde iba.
   */
  function navegarA(direccion: string, ciudad?: string) {
    const p = navProvider ?? getNavProvider();
    if (!p) {
      setEligiendo({ direccion, ciudad });
      return;
    }
    window.open(buildNavUrl(p, direccion, ciudad), "_blank", "noopener,noreferrer");
  }

  /**
   * Abre la pestaña de navegación EN BLANCO, dentro del mismo gesto de clic
   * que arranca la recogida — antes de cualquier await. La activación
   * transitoria que autoriza a `window.open` expira en pocos segundos,
   * y esperar al RPC de `at_start_pickup` ya se la come; en 3G eso es lo
   * normal, no la excepción. Mismo patrón que ya resolvió esto en /entregas
   * (ver openNavWindow).
   *
   * Si todavía no hay proveedor de navegación guardado no se abre nada: se le
   * va a preguntar primero (ver `iniciar`), y una pestaña en blanco esperando
   * esa respuesta confundiría más de lo que ayuda.
   */
  function abrirVentanaNav(): Window | null {
    if (!(navProvider ?? getNavProvider())) return null;
    return window.open("", "_blank");
  }

  function elegirYNavegar(p: NavProvider) {
    saveNavProvider(p);
    setNavProvider(p);
    const pendiente = eligiendo;
    setEligiendo(null);
    if (pendiente) {
      window.open(buildNavUrl(p, pendiente.direccion, pendiente.ciudad), "_blank", "noopener,noreferrer");
    }
  }

  /**
   * Arranca la recogida: la marca en curso, enciende el rastreo y abre la
   * navegación hacia el comercio. Las tres cosas son el mismo gesto para el
   * mensajero, así que van en un solo botón.
   *
   * El orden importa, y aquí es donde se perdía la primera posición del
   * turno: antes se encendía el rastreo y se navegaba a Waze en el mismo
   * instante, pero el watch de PositionReporter se registra en un efecto de
   * React que corre DESPUÉS de ese repintado — y el salto a la app de
   * navegación podía dejar la pestaña en segundo plano antes de que ese
   * efecto alcanzara a montarse. El CEDI no veía salir a nadie hasta que el
   * mensajero volvía a la app, que podía ser al llegar al comercio.
   *
   * Ahora: la pestaña de navegación se abre en blanco DENTRO del gesto de
   * clic (antes del await, para no perder la activación transitoria), se
   * espera a que `activarUbicacion` mande el primer punto de una vez, y solo
   * entonces se le pone destino a esa pestaña.
   */
  async function iniciar(p: Pickup) {
    setBusy(p.pickup_id);
    setMsg(null);
    const ventanaNav = abrirVentanaNav();
    const supabase = createClient();
    const { error } = await supabase.rpc("at_start_pickup", { p_pickup_id: p.pickup_id });
    setBusy(null);
    if (error) {
      ventanaNav?.close();
      setMsg({ ok: false, text: error.message });
      return;
    }
    await activarUbicacion();
    if (ventanaNav) {
      const prov = navProvider ?? getNavProvider();
      if (prov) ventanaNav.location.href = buildNavUrl(prov, p.address);
      else ventanaNav.close();
    } else {
      navegarA(p.address);
    }
    load();
  }

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_my_pickups");
    if (error) setMsg({ ok: false, text: error.message });
    setPickups((data as Pickup[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function alternar(pickupId: string, guideId: string) {
    setMarcadas((m) => {
      const set = new Set(m[pickupId] ?? []);
      if (set.has(guideId)) set.delete(guideId);
      else set.add(guideId);
      return { ...m, [pickupId]: set };
    });
  }

  function marcarTodas(p: Pickup) {
    setMarcadas((m) => {
      const actual = m[p.pickup_id] ?? new Set<string>();
      const todas = actual.size === p.guias.length;
      return {
        ...m,
        [p.pickup_id]: todas ? new Set() : new Set(p.guias.map((g) => g.id)),
      };
    });
  }

  async function confirmar(p: Pickup) {
    const ids = Array.from(marcadas[p.pickup_id] ?? []);
    if (ids.length === 0) return;
    setBusy(p.pickup_id);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_confirm_pickup", {
      p_pickup_id: p.pickup_id,
      p_guide_ids: ids,
      p_note: nota[p.pickup_id] || null,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      const r = data as { recogidas: number; faltantes: number; comercio: string };
      setMsg({
        ok: true,
        text:
          `${r.recogidas} paquete(s) recogidos en ${r.comercio}.` +
          (r.faltantes > 0
            ? ` ${r.faltantes} quedaron sin recoger y el comercio puede volver a pedirlos.`
            : ""),
      });

      // Recogido el lote, la decisión es suya y se le pregunta SIEMPRE, haya o
      // no algo cerca. Antes solo se le ofrecía cuando la app creía que valía
      // la pena, y si pensaba distinto no tenía dónde decirlo.
      const { data: recogidas } = await supabase.rpc("at_guias_entrega_directa", {
        p_pickup_id: p.pickup_id,
      });
      const lista = (recogidas as GuiaRecogida[]) ?? [];
      if (lista.length > 0) {
        setDirecta({ pickupId: p.pickup_id, comercio: r.comercio, guias: lista });
        // Vienen marcadas solo las que van a esta zona: es la recomendación.
        // Las demás las marca él si quiere.
        setElegidas(new Set(lista.filter((g) => g.misma_zona).map((g) => g.id)));
      }
    }
    load();
  }

  /** Se queda las guías y sale a entregarlas sin pasar por el CEDI. */
  async function entregarDirecto() {
    if (!directa) return;
    const ids = Array.from(elegidas);
    if (ids.length === 0) {
      setDirecta(null);
      return;
    }
    setBusy("directa");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_entrega_directa", { p_guide_ids: ids });

    // Las que NO marcó siguen en «recogida», o sea que van al CEDI. Se registra
    // aquí mismo para que no queden en el limbo esperando otro botón: con un
    // solo toque resuelve el lote entero. at_iniciar_traslado solo toca las que
    // siguen en «recogida», así que las que acaba de tomar no las alcanza.
    const resto = directa.guias.length - ids.length;
    if (!error && resto > 0) {
      await supabase.rpc("at_iniciar_traslado", { p_pickup_id: directa.pickupId });
    }
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      const r = data as { en_ruta: number; fuera_de_zona: number };
      setMsg({
        ok: true,
        text:
          `${r.en_ruta} paquete(s) quedaron en tu ruta. Ábrelos en «Mi ruta» para entregarlos.` +
          (resto > 0 ? ` Los otros ${resto} van al CEDI.` : "") +
          // Se le dice, sin regañarlo: es su decisión y ya la tomó. Pero que
          // sepa que quedó anotada, porque después alguien va a preguntar por
          // qué ese paquete no pasó por el CEDI.
          (r.fuera_de_zona > 0
            ? ` ${r.fuera_de_zona} van fuera de la zona de la recogida y quedó anotado en su historial.`
            : ""),
      });
    }
    setDirecta(null);
    setElegidas(new Set());
    load();
  }

  /** La otra opción: arranca para el CEDI con todo lo que recogió. */
  async function llevarAlCedi() {
    if (!directa) return;
    setBusy("traslado");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_iniciar_traslado", {
      p_pickup_id: directa.pickupId,
    });
    setBusy(null);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      const r = data as { en_traslado: number };
      setMsg({
        ok: true,
        text: `Vas al CEDI con ${r.en_traslado} paquete(s). Allá los reciben con tu código de lote.`,
      });
    }
    setDirecta(null);
    setElegidas(new Set());
    load();
  }

  // Cuántas de las recién recogidas van a la zona del comercio: es lo que
  // decide qué le decimos en la cabecera del diálogo.
  const cercanas = directa?.guias.filter((g) => g.misma_zona).length ?? 0;

  if (!["mensajero", "admin", "coordinador", "operario"].includes(profile.role)) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white">Recogidas</h1>
        <p className="mt-6 text-slate-500">Esta sección es para mensajeros.</p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Mis recogidas
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Marca cada paquete que recibas. Lo que no marques queda libre para que el comercio
          vuelva a pedirlo.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-2xl p-4 ${
            msg.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"
          }`}
        >
          <p
            className={`text-[14px] font-medium ${
              msg.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {msg.text}
          </p>
        </div>
      )}

      {/* El destino de la jornada, siempre a la vista: al terminar la recogida
          el mensajero arranca para acá, con el mismo navegador que usó para ir
          al comercio. */}
      <CediDestino onNavegar={(dir, ciudad) => navegarA(dir, ciudad)} />

      {/* Visible a propósito: se está rastreando a una persona, y tiene que
          poder verlo y apagarlo aunque la recogida lo haya encendido. */}
      {profile.role === "mensajero" && <PositionReporter />}

      {pickups === null ? (
        // Translucida y con blur (patron probado en vivo: /90 sin blur no se notaba).
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF]/75 py-16 text-slate-500 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75 dark:text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin text-[#ff812c]" />
          <p className="text-[15px]">Cargando tus recogidas…</p>
        </div>
      ) : pickups.length === 0 ? (
        // Translucida y con blur, mismo motivo que arriba.
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#FFFFFF]/75 py-16 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75">
          <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-[16px] text-slate-500 dark:text-slate-400">
            No tienes recogidas asignadas ahora mismo
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pickups.map((p) => {
            const set = marcadas[p.pickup_id] ?? new Set<string>();
            const completo = p.guias.length > 0 && set.size === p.guias.length;
            const faltan = p.guias.length - set.size;
            const arrancada = p.status === "en_curso";

            return (
              // Translucida y con blur (probado en vivo: /90 sin blur no se notaba).
              // Los modales de mas abajo (elegir app de navegacion, que hacer con lo
              // recogido) se quedan opacos a proposito.
              <section
                key={p.pickup_id}
                className="overflow-hidden rounded-3xl bg-[#FFFFFF]/75 shadow-sm backdrop-blur-xl dark:bg-[#2C2C2E]/75"
              >
                <div className="border-b border-gray-100 p-5 dark:border-gray-800">
                  <p className="text-[19px] font-bold text-slate-900 dark:text-white">
                    {p.business_name}
                  </p>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      p.address
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-start gap-2 text-[15px] text-[#ff812c] active:opacity-70"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="underline-offset-2 hover:underline">{p.address}</span>
                  </a>

                  {(p.contact_phone || p.business_phone) && (
                    <a
                      href={`tel:${p.contact_phone ?? p.business_phone}`}
                      className="mt-1.5 flex items-center gap-2 text-[15px] text-slate-600 dark:text-slate-300"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                      {p.contact_name ? `${p.contact_name} · ` : ""}
                      {p.contact_phone ?? p.business_phone}
                    </a>
                  )}

                  {p.scheduled_time && (
                    <p className="mt-1.5 text-[14px] text-slate-500 dark:text-slate-400">
                      Programada para las {p.scheduled_time.slice(0, 5)}
                    </p>
                  )}
                  {p.notes && (
                    <p className="mt-2 rounded-xl bg-[#F2F2F7] px-3 py-2 text-[14px] text-slate-600 dark:bg-[#1C1C1E] dark:text-slate-300">
                      {p.notes}
                    </p>
                  )}

                  {/* Mientras no arranque, lo único que hay que hacer es salir.
                      El chequeo de paquetes aparece después, cuando ya está en
                      el comercio y tiene las cajas delante. */}
                  {!arrancada ? (
                    <button
                      onClick={() => iniciar(p)}
                      disabled={busy === p.pickup_id}
                      className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
                    >
                      {busy === p.pickup_id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                      Iniciar recogida
                    </button>
                  ) : (
                    <button
                      onClick={() => navegarA(p.address)}
                      className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#ff812c]/40 bg-[#ff812c]/10 font-semibold text-[#ff812c] transition-transform active:scale-[0.98]"
                    >
                      <Navigation2 className="h-5 w-5" /> Volver a abrir la ruta
                    </button>
                  )}

                  {!arrancada && (
                    <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400">
                      Se abre tu navegador y empiezas a compartir tu ubicación con el CEDI.
                    </p>
                  )}
                </div>

                <div
                  className={`flex items-center justify-between px-5 py-3 ${
                    arrancada ? "" : "hidden"
                  }`}
                >
                  <p className="text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {set.size} de {p.guias.length} verificados
                  </p>
                  {p.guias.length > 0 && (
                    <button
                      onClick={() => marcarTodas(p)}
                      className="text-[14px] font-semibold text-[#ff812c] active:opacity-70"
                    >
                      {completo ? "Desmarcar todo" : "Marcar todo"}
                    </button>
                  )}
                </div>

                {!arrancada ? null : p.guias.length === 0 ? (
                  <p className="px-5 pb-5 text-[15px] text-slate-500 dark:text-slate-400">
                    Esta recogida no tiene guías cargadas. Pídele al comercio que las cree antes
                    de entregarte los paquetes.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                    {p.guias.map((g) => {
                      const ok = set.has(g.id);
                      return (
                        <li key={g.id}>
                          <button
                            onClick={() => alternar(p.pickup_id, g.id)}
                            className={`flex w-full items-center gap-3 px-5 py-4 text-left transition-colors ${
                              ok ? "bg-emerald-50/60 dark:bg-emerald-500/10" : ""
                            }`}
                          >
                            {ok ? (
                              <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
                            ) : (
                              <Circle className="h-7 w-7 shrink-0 text-slate-300 dark:text-slate-600" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[16px] font-bold text-slate-900 dark:text-white">
                                {g.guide_number}
                              </p>
                              <p className="truncate text-[14px] text-slate-500 dark:text-slate-400">
                                {g.recipient_name} · {g.recipient_city}
                              </p>
                            </div>
                            {g.is_cod && (
                              <span className="shrink-0 text-[14px] font-bold text-slate-900 dark:text-white">
                                {formatCOP(g.cod_amount)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div
                  className={`space-y-3 border-t border-gray-100 p-5 dark:border-gray-800 ${
                    arrancada ? "" : "hidden"
                  }`}
                >
                  {faltan > 0 && set.size > 0 && (
                    <p className="flex items-start gap-2 text-[14px] font-medium text-amber-600 dark:text-amber-400">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Vas a confirmar {set.size} y dejar {faltan} sin recoger. Esos vuelven a
                      quedar disponibles para el comercio.
                    </p>
                  )}

                  <input
                    value={nota[p.pickup_id] ?? ""}
                    onChange={(e) => setNota((n) => ({ ...n, [p.pickup_id]: e.target.value }))}
                    placeholder="Observación (opcional): caja mojada, faltó una…"
                    className="w-full min-h-[48px] rounded-xl border border-transparent bg-[#F2F2F7] px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#ff812c] focus:outline-none focus:ring-1 focus:ring-[#ff812c] dark:border-slate-700 dark:bg-[#1C1C1E] dark:text-white"
                  />

                  <button
                    onClick={() => confirmar(p)}
                    disabled={set.size === 0 || busy === p.pickup_id}
                    className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                  >
                    {busy === p.pickup_id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <PackageCheck className="h-5 w-5" />
                    )}
                    {set.size === 0
                      ? "Marca los paquetes que recibiste"
                      : `Confirmar recogida de ${set.size} paquete(s)`}
                  </button>

                  <p className="text-center text-[13px] text-slate-400 dark:text-slate-500">
                    Al confirmar, el CEDI recibe el aviso de que vas en camino.
                  </p>
                </div>

                {/* El QR del lote, en la pantalla del mensajero.
                    El comercio lo imprime y lo pega en la estiba, pero el papel
                    se moja, se despega y se pierde en el camión. Llevarlo
                    también aquí significa que en el muelle siempre hay algo que
                    escanear. Aparece cuando ya arrancó: antes no hay lote. */}
                {arrancada && (
                  <div className="border-t border-gray-100 p-5 dark:border-gray-800">
                    <p className="mb-4 text-center text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Muéstralo al llegar al CEDI
                    </p>
                    <RecogidaQR
                      compacto
                      token={p.pickup_token}
                      comercio={p.business_name}
                      paquetes={p.guias.length}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[14px] text-slate-500 dark:text-slate-400">
        ¿Ya estás en ruta de entrega?{" "}
        <Link href="/entregas" className="font-semibold text-[#ff812c] hover:underline">
          Ver mi ruta
        </Link>
      </p>

      {eligiendo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-[#FFFFFF] p-6 shadow-2xl dark:bg-[#2C2C2E]">
            <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
              ¿Con qué app navegas?
            </h3>
            <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
              Se queda guardado en este teléfono. Puedes cambiarlo cuando quieras desde tu ruta.
            </p>
            <div className="mt-5 space-y-2">
              {(["waze", "gmaps"] as NavProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => elegirYNavegar(p)}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98]"
                >
                  <Navigation2 className="h-5 w-5" /> {NAV_PROVIDER_LABELS[p]}
                </button>
              ))}
              <button
                onClick={() => setEligiendo(null)}
                className="min-h-[48px] w-full rounded-xl bg-[#F2F2F7] font-semibold text-slate-700 dark:bg-[#1C1C1E] dark:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Qué hace con lo que acaba de recoger ──
          Aparece SIEMPRE, con las dos salidas al mismo nivel: entregar algo
          directo, o arrancar para el CEDI. La app marca lo que va a esta misma
          zona como recomendación, pero no filtra ni obliga — el que está ahí
          con los paquetes en la mano es él, y sabe cómo está el tráfico y qué
          le cabe en la moto. */}
      {directa && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-2xl dark:bg-[#2C2C2E]">
            <div className="shrink-0 border-b border-gray-100 px-6 pt-6 pb-4 dark:border-gray-800">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff812c]/10">
                <Navigation2 className="h-5 w-5 text-[#ff812c]" />
              </div>
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white">
                ¿Qué haces con {directa.guias.length === 1 ? "este paquete" : `estos ${directa.guias.length} paquetes`}?
              </h3>
              <p className="mt-1 text-[14px] leading-snug text-slate-500 dark:text-slate-400">
                {cercanas > 0 ? (
                  <>
                    Marcamos {cercanas === 1 ? "el que va" : `los ${cercanas} que van`} a la zona de{" "}
                    {directa.comercio}: entregarlos ya te ahorra el viaje. Puedes marcar otros o
                    quitar los que no te queden de camino.
                  </>
                ) : (
                  <>
                    Ninguno va a la zona de {directa.comercio}, así que lo normal es llevarlos al
                    CEDI. Aun así, si alguno te queda de camino, márcalo.
                  </>
                )}
              </p>
            </div>

            <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {directa.guias.map((g) => {
                const marcada = elegidas.has(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setElegidas((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        })
                      }
                      className="flex w-full items-start gap-3 px-6 py-4 text-left active:bg-[#F2F2F7] dark:active:bg-[#1C1C1E]"
                    >
                      {marcada ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#ff812c]" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                          {g.recipient_name}
                        </p>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">
                          {g.recipient_address}
                        </p>
                        {/* El aviso va con la zona, no solo con un color: en la
                            calle, con sol y con prisa, un matiz de color no se
                            ve. Tiene que poder leerse de un vistazo. */}
                        {g.misma_zona ? (
                          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Aquí mismo
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                            {g.zone_name ? `Lejos · ${g.zone_name}` : "Zona sin definir"}
                          </span>
                        )}
                        <p className="mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
                          {g.guide_number}
                          {g.is_cod ? ` · recaudar ${formatCOP(g.cod_amount)}` : ""}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="shrink-0 space-y-2 border-t border-gray-100 p-5 dark:border-gray-800">
              <button
                onClick={entregarDirecto}
                disabled={busy !== null || elegidas.size === 0}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {busy === "directa" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Navigation2 className="h-5 w-5" />
                )}
                {elegidas.size === 0
                  ? "Entregar directo (marca cuáles)"
                  : `Entregar ${elegidas.size} sin pasar por el CEDI`}
              </button>
              {/* No es "cancelar": es la otra mitad de la decisión, y ahora
                  queda registrada la hora a la que arrancó. */}
              <button
                onClick={llevarAlCedi}
                disabled={busy !== null}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#F2F2F7] font-bold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-[#1C1C1E] dark:text-slate-300"
              >
                {busy === "traslado" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Warehouse className="h-5 w-5" />
                )}
                Llevarlos todos al CEDI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
