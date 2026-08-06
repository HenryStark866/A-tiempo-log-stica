"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScanBarcode, Undo2, Loader2, Package, SearchX, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useOffline } from "@/components/OfflineContext";
import { CediDestino } from "@/components/CediDestino";
import { StatusBadge } from "@/components/StatusBadge";
import { EscanerQR } from "@/components/EscanerQR";
import { MARCA } from "@/lib/marca";
import { esFalloDeRed } from "@/lib/offline/queue";
import * as cache from "@/lib/offline/cache";
import { formatDateTime } from "@/lib/utils";
import type { Guide } from "@/lib/types";

const ROLES_CEDI = ["admin", "coordinador", "operario"];

/**
 * Saca el código del lote de lo que sea que haya entrado por el campo.
 *
 * Vale tanto la URL completa del QR —lo que teclea una pistola de código de
 * barras al leerlo— como el token pelado, que es lo que va impreso debajo del
 * QR para cuando el papel está mojado y toca escribirlo a mano.
 *
 * Devuelve null si es otra cosa (un número de guía), y ahí la pantalla sigue
 * por el camino de siempre.
 */
function tokenDeRecogida(texto: string): string | null {
  const t = texto.trim();
  const enUrl = t.match(/[?&]recogida=([0-9a-f]{24})\b/i);
  if (enUrl) return enUrl[1].toLowerCase();
  return /^[0-9a-f]{24}$/i.test(t) ? t.toLowerCase() : null;
}

export default function CediPage() {
  const profile = useProfile();
  const offline = useOffline();
  const [incoming, setIncoming] = useState<Guide[] | null>(null);
  const [returns, setReturns] = useState<Guide[] | null>(null);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [escaneando, setEscaneando] = useState(false);

  const load = useCallback(async () => {
    if (!ROLES_CEDI.includes(profile.role)) return;
    try {
      const supabase = createClient();
      const [{ data: inc, error: e1 }, { data: ret, error: e2 }] = await Promise.all([
        supabase
          .from("at_guides")
          .select("*, at_clients(business_name)")
          .eq("status", "recogida")
          .order("picked_up_at"),
        supabase
          .from("at_guides")
          .select("*, at_clients(business_name)")
          .eq("status", "novedad")
          .order("updated_at"),
      ]);
      if (e1 || e2) throw e1 ?? e2;
      const inLista = (inc as Guide[]) ?? [];
      const retLista = (ret as Guide[]) ?? [];
      setIncoming(inLista);
      setReturns(retLista);
      cache.guardar("cedi-incoming", inLista);
      cache.guardar("cedi-returns", retLista);
    } catch (err) {
      if (esFalloDeRed(err)) {
        const inGuardada = cache.leer<Guide[]>("cedi-incoming");
        const retGuardada = cache.leer<Guide[]>("cedi-returns");
        if (inGuardada) setIncoming(inGuardada);
        if (retGuardada) setReturns(retGuardada);
      }
    }
  }, [profile.role]);

  useEffect(() => {
    load();
  }, [load]);

  async function receive(guideId: string, guideNumber: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: guideId,
      p_new_status: "en_cedi",
      p_note: "Escaneo de recepción en bodega",
    });
    setBusy(false);

    if (error && esFalloDeRed(error)) {
      await offline.encolar("recibir_guia", { guideId, guideNumber });
      // Sale de "pendientes de ingreso" en pantalla: el operario sigue
      // escaneando la fila sin que la misma guía le vuelva a aparecer.
      setIncoming((prev) => (prev ?? []).filter((g) => g.id !== guideId));
      setMsg({
        ok: true,
        text: `${guideNumber} en cola, sin señal — se recibe sola al volver la conexión`,
      });
      return;
    }

    setMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: `${guideNumber} recibida en CEDI ✓` }
    );
    load();
  }

  /**
   * Ingresa de una todas las guías de un lote.
   *
   * Es el atajo del muelle: el mensajero llega con veinte cajas del mismo
   * comercio y el operario escanea un código en vez de veinte. Solo mueve lo
   * que el mensajero ya verificó en el local; lo que nunca salió de allá se
   * reporta y se queda quieto, porque darlo por recibido sería inventar un
   * movimiento que nadie vio.
   */
  const recibirLote = useCallback(
    async (token: string) => {
      setBusy(true);
      setMsg(null);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("at_receive_pickup", { p_token: token });
      setBusy(false);

      if (error) {
        if (esFalloDeRed(error)) {
          // Aquí no se puede aplicar el mismo truco optimista que con una
          // guía suelta: cuántas trae el lote y cuáles ya estaban solo lo
          // sabe el servidor. Se encola tal cual y el operario se entera del
          // detalle real cuando vuelva la señal y la cola procese sola.
          await offline.encolar("recibir_lote", { token });
          setMsg({
            ok: true,
            text: "Lote en cola, sin señal — se recibe solo al volver la conexión",
          });
          return;
        }
        setMsg({ ok: false, text: error.message });
        return;
      }

      const r = data as {
        recibidas: number;
        ya_estaban: number;
        sin_salir: number;
        comercio: string | null;
      };
      const comercio = r.comercio ?? "el comercio";

      if (r.recibidas === 0 && r.ya_estaban > 0) {
        setMsg({
          ok: true,
          text: `Este lote de ${comercio} ya estaba ingresado (${r.ya_estaban} guía(s)). No se repitió nada.`,
        });
      } else if (r.recibidas === 0) {
        setMsg({
          ok: false,
          text: `El lote de ${comercio} no tiene guías recogidas. El mensajero todavía no ha confirmado la recogida en el local.`,
        });
      } else {
        setMsg({
          ok: true,
          text:
            `${r.recibidas} guía(s) de ${comercio} ingresaron al CEDI ✓` +
            (r.sin_salir > 0
              ? ` · Ojo: ${r.sin_salir} nunca salieron del comercio y quedaron por fuera.`
              : ""),
        });
      }
      load();
    },
    [load, offline]
  );

  /**
   * Llegada por cámara del teléfono.
   *
   * El QR del lote abre esta pantalla con `?recogida=<token>`, así que quien lo
   * apuntó con la cámara ya dijo lo que quería: se recibe sin pedirle que además
   * le dé a un botón, con las manos ocupadas sosteniendo cajas.
   *
   * Se lee de `window.location` y no con `useSearchParams` para no arrastrar una
   * frontera de Suspense a una pantalla que no la necesita. Y se limpia la URL
   * al terminar: sin eso, recargar la página volvería a disparar el ingreso.
   */
  const yaProcesado = useRef(false);
  useEffect(() => {
    if (yaProcesado.current || !ROLES_CEDI.includes(profile.role)) return;
    const token = tokenDeRecogida(window.location.search);
    if (!token) return;
    yaProcesado.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    recibirLote(token);
  }, [profile.role, recibirLote]);

  /**
   * Un solo camino para las tres formas de meter el código: la pistola de
   * código de barras, tecleado a mano y ahora la cámara. El operario no va a
   * elegir modo antes de cada disparo: entra el texto y la pantalla decide.
   * El QR del lote lleva una URL con `?recogida=<token>` y el token es
   * hexadecimal de 24; un número de guía es ATL-100008. No se pisan, así que
   * distinguirlos es seguro.
   */
  const procesarTexto = useCallback(
    async (texto: string) => {
      const t = texto.trim();
      if (!t) return;

      const token = tokenDeRecogida(t);
      if (token) {
        await recibirLote(token);
        return;
      }

      const num = t.toUpperCase();
      const g = (incoming ?? []).find((x) => x.guide_number.toUpperCase() === num);
      if (!g) {
        setMsg({ ok: false, text: `La guía ${num} no está en estado "recogida"` });
        return;
      }
      await receive(g.id, g.guide_number);
    },
    [incoming, recibirLote, receive]
  );

  async function receiveByScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scan.trim()) return;
    const texto = scan;
    setScan("");
    await procesarTexto(texto);
  }

  function alLeerCamara(texto: string) {
    setEscaneando(false);
    procesarTexto(texto);
  }

  async function processReturn(guideId: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_process_return", {
      p_guide_id: guideId,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      const g = data as Guide;
      setMsg({
        ok: true,
        text:
          g.status === "en_devolucion"
            ? `${g.guide_number}: 2do fallo → logística inversa`
            : `${g.guide_number}: reprogramada para nuevo despacho`,
      });
    }
    load();
  }

  // El CEDI es la bodega: recibir y despachar es del personal de operaciones.
  // Sin este corte, un comercio que escribiera la URL veía la pantalla (con
  // sus propias guías, por RLS), que no significa nada para él y confunde.
  if (!ROLES_CEDI.includes(profile.role)) {
    return (
      <div className="pb-10 font-sans">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          CEDI
        </h1>
        <p className="mt-6 text-[15px] text-slate-500 dark:text-slate-400">
          Esta sección es del personal del centro de distribución.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">CEDI — Centro de Distribución</h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Validación de entrada a bodega y retorno de novedades
        </p>
        <div className="mt-2">
          <CediDestino compacto />
        </div>
      </div>

      {msg && (
        <div className={`rounded-2xl p-4 ${msg.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"}`}>
          <p className={`text-[14px] font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            {msg.text}
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Reception Card */}
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
            <div className="bg-[#ff812c]/10 dark:bg-[#ff812c]/20 p-2 rounded-xl text-[#ff812c]">
              <ScanBarcode className="w-5 h-5" />
            </div>
            Recepción en bodega
          </h2>
          <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400 pl-11">
            Escanea el QR de la recogida y entra el lote completo, o una guía suelta
          </p>

          <form onSubmit={receiveByScan} className="mb-5 flex flex-col sm:flex-row gap-3">
            <div className="flex flex-1 gap-2">
              <input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                autoFocus
                placeholder={`QR del lote o guía (${MARCA.prefijoGuia}-…)`}
                className="flex-1 min-h-[48px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent focus:border-[#ff812c] focus:ring-1 focus:ring-[#ff812c] rounded-xl px-4 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all"
              />
              {/* Antes solo se podía teclear o disparar con pistola de código
                  de barras; esto abre la cámara del teléfono y decodifica el
                  QR ahí mismo, sin salir de la pantalla. */}
              <button
                type="button"
                onClick={() => setEscaneando(true)}
                aria-label="Escanear con la cámara"
                title="Escanear con la cámara"
                className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] px-6 rounded-xl font-bold bg-[#ff812c] hover:bg-[#ff812c]/90 text-[#1C1C1E] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center shrink-0"
            >
              {busy && scan ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Recibir
            </button>
          </form>

          {escaneando && (
            <EscanerQR onScan={alLeerCamara} onClose={() => setEscaneando(false)} />
          )}

          {incoming === null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px]">Cargando pendientes…</p>
            </div>
          ) : incoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">No hay guías pendientes de ingreso</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {incoming.map((g) => (
                <li key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-2">
                  <div>
                    <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
                      {g.guide_number}
                    </Link>
                    <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">
                      {g.at_clients?.business_name} · recogida {formatDateTime(g.picked_up_at)}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => receive(g.id, g.guide_number)}
                    className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all self-start sm:self-auto shrink-0"
                  >
                    Recibir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Returns / Novedades Card */}
        <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-5 sm:p-6 shadow-sm transition-colors duration-300">
          <h2 className="mb-1 flex items-center gap-2 text-[19px] font-bold text-slate-900 dark:text-white">
            <div className="bg-amber-50 dark:bg-amber-500/10 p-2 rounded-xl text-amber-500">
              <Undo2 className="w-5 h-5" />
            </div>
            Retorno de novedades
          </h2>
          <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400 pl-11">
            El sistema evalúa reintentos: 1er fallo reprograma, 2do fallo pasa a logística inversa
          </p>

          {returns === null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 dark:text-slate-400">
              <div className="w-7 h-7 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
              <p className="text-[14px]">Cargando novedades…</p>
            </div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <SearchX className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-[15px] text-slate-500 dark:text-slate-400">No hay novedades por procesar</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 -mx-2">
              {returns.map((g) => (
                <li key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 px-2">
                  <div className="flex flex-col gap-1.5">
                    <Link href={`/guias/${g.id}`} className="text-[16px] font-bold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
                      {g.guide_number}
                    </Link>
                    <p className="text-[14px] text-slate-600 dark:text-slate-400">
                      {g.at_clients?.business_name} · intento {g.delivery_attempts}/2
                    </p>
                    <div className="self-start mt-1">
                      <StatusBadge status={g.status} />
                    </div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => processReturn(g.id)}
                    className="min-h-[44px] px-4 rounded-xl font-semibold bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 active:scale-95 transition-all self-start sm:self-auto shrink-0"
                  >
                    Procesar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
