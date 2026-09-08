"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  Store,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MARCA } from "@/lib/marca";
import { formatDateTime } from "@/lib/utils";

interface ShopifyStatus {
  shop_domain: string;
  active: boolean;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  imported_total: number;
}

interface SyncResult {
  creadas: number;
  repetidas: number;
  incompletos: string[];
  revisados: number;
}

export function ShopifyConnect() {
  const [estado, setEstado] = useState<ShopifyStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ dominio: "", token: "" });
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<SyncResult | null>(null);
  const [ocupado, setOcupado] = useState<"conectar" | "sync" | "desconectar" | null>(null);
  const [comoSacarlo, setComoSacarlo] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("at_shopify_status");
    setEstado((data as ShopifyStatus) ?? null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado("conectar");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_connect_shopify", {
      p_shop_domain: form.dominio,
      p_access_token: form.token,
    });
    setOcupado(null);
    if (error) {
      setError(error.message);
      return;
    }
    // El token no se guarda en memoria del navegador más de lo necesario.
    setForm({ dominio: "", token: "" });
    cargar();
  }

  async function sincronizar() {
    setOcupado("sync");
    setError(null);
    setResultado(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("shopify-sync");
    setOcupado(null);
    if (error) {
      // El cuerpo de la respuesta trae el motivo real; el error de red a secas
      // no le dice nada al comercio.
      let detalle = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          if (body?.error) detalle = body.error;
        } catch {
          /* se queda con el mensaje genérico */
        }
      }
      setError(detalle);
      cargar();
      return;
    }
    setResultado(data as SyncResult);
    cargar();
  }

  async function desconectar() {
    setOcupado("desconectar");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_disconnect_shopify");
    setOcupado(null);
    if (error) setError(error.message);
    else {
      setEstado(null);
      setResultado(null);
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-[#ff812c]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 dark:bg-rose-500/10">
          <p className="text-[14px] font-medium text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}

      {estado ? (
        <>
          {/* Translucida y con blur (patron probado en vivo). El formulario de
              conexion, mas abajo en el otro estado, se queda opaco a proposito. */}
          <div className="rounded-2xl atl-superficie p-5 shadow-sm  ">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10">
                <CircleCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold text-slate-900 dark:text-white">
                  {estado.shop_domain}
                </p>
                <p className="mt-0.5 text-[14px] text-slate-500 dark:text-slate-400">
                  Conectada el {formatDateTime(estado.connected_at)} ·{" "}
                  {estado.imported_total} guía(s) importada(s)
                </p>
                <p className="mt-0.5 text-[14px] text-slate-500 dark:text-slate-400">
                  {estado.last_sync_at
                    ? `Última sincronización: ${formatDateTime(estado.last_sync_at)}`
                    : "Todavía no has traído pedidos"}
                </p>
              </div>
            </div>

            {estado.last_sync_error && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[14px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {estado.last_sync_error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={sincronizar}
                disabled={ocupado !== null}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#ff812c] px-5 font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {ocupado === "sync" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <RefreshCw className="h-5 w-5" />
                )}
                Traer pedidos
              </button>
              <button
                onClick={desconectar}
                disabled={ocupado !== null}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 font-semibold text-slate-700 transition-transform active:scale-[0.98] disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
              >
                <Unplug className="h-4 w-4" /> Desconectar
              </button>
            </div>
          </div>

          {resultado && (
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
              <p className="text-[14px] font-medium text-emerald-800 dark:text-emerald-400">
                {resultado.creadas === 0 && resultado.repetidas > 0
                  ? `Sin pedidos nuevos: los ${resultado.repetidas} que hay ya estaban importados.`
                  : `${resultado.creadas} guía(s) creada(s)` +
                    (resultado.repetidas > 0
                      ? ` · ${resultado.repetidas} ya estaban importadas`
                      : "")}
              </p>
              {resultado.incompletos.length > 0 && (
                <p className="mt-1 text-[13px] text-emerald-700 dark:text-emerald-500">
                  Sin dirección de envío, no se pudieron importar:{" "}
                  {resultado.incompletos.join(", ")}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={conectar} className="rounded-2xl atl-superficie p-5 shadow-sm ">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#ff812c]/10 p-2 text-[#ff812c]">
              <Store className="h-5 w-5" />
            </div>
            <p className="text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
              Conecta tu tienda una vez y tus pedidos entran solos como guías, con
              destinatario, dirección y valor a recaudar ya cargados. No tendrás que subir
              más archivos.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-[14px] font-semibold text-slate-900 dark:text-white">
                Dominio de tu tienda
              </label>
              <input
                required
                value={form.dominio}
                onChange={(e) => setForm((f) => ({ ...f, dominio: e.target.value }))}
                placeholder="tu-tienda.myshopify.com"
                autoComplete="off"
                className="w-full min-h-[48px] rounded-xl border border-transparent atl-relleno px-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#ff812c] focus:outline-none focus:ring-1 focus:ring-[#ff812c] dark:border-slate-700  dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-[14px] font-semibold text-slate-900 dark:text-white">
                Token de acceso
              </label>
              <input
                required
                type="password"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="shpat_…"
                autoComplete="off"
                spellCheck={false}
                className="w-full min-h-[48px] rounded-xl border border-transparent atl-relleno px-4 font-mono text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#ff812c] focus:outline-none focus:ring-1 focus:ring-[#ff812c] dark:border-slate-700  dark:text-white"
              />
              <button
                type="button"
                onClick={() => setComoSacarlo((v) => !v)}
                className="mt-2 text-[14px] font-semibold text-[#ff812c] active:opacity-70"
              >
                {comoSacarlo ? "Ocultar instrucciones" : "¿Cómo saco ese token?"}
              </button>
            </div>

            {comoSacarlo && (
              <ol className="list-decimal space-y-1.5 rounded-xl atl-relleno py-4 pl-8 pr-4 text-[14px] leading-relaxed text-slate-600  dark:text-slate-400">
                <li>
                  En tu panel de Shopify entra a <strong>Configuración → Aplicaciones y
                  canales de venta</strong>.
                </li>
                <li>
                  Pulsa <strong>Desarrollar aplicaciones</strong> y luego{" "}
                  <strong>Crear una aplicación</strong>. Ponle el nombre que quieras, por
                  ejemplo &ldquo;{MARCA.app}&rdquo;.
                </li>
                <li>
                  En <strong>Configurar los alcances de la API de Admin</strong>, marca{" "}
                  <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">
                    read_orders
                  </code>{" "}
                  y{" "}
                  <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">
                    read_customers
                  </code>
                  . No hace falta ninguno más: solo leemos, nunca modificamos tu tienda.
                </li>
                <li>
                  Guarda, pulsa <strong>Instalar aplicación</strong> y copia el{" "}
                  <strong>token de acceso de la API de Admin</strong>. Empieza por{" "}
                  <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">shpat_</code>.
                </li>
                <li>Pégalo arriba. Shopify solo te lo muestra una vez.</li>
              </ol>
            )}

            <button
              type="submit"
              disabled={ocupado !== null}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff812c] font-bold text-[#1C1C1E] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {ocupado === "conectar" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Plug className="h-5 w-5" />
              )}
              Conectar tienda
            </button>

            <p className="text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
              Tu token se guarda cifrado en el servidor y no vuelve a salir de ahí: ni
              siquiera esta pantalla puede leerlo después. Solo lo usa el proceso que trae
              tus pedidos.
            </p>

            <a
              href="https://help.shopify.com/es/manual/apps/app-types/custom-apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] text-slate-500 hover:underline dark:text-slate-400"
            >
              Ayuda de Shopify sobre apps personalizadas <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </form>
      )}
    </div>
  );
}
