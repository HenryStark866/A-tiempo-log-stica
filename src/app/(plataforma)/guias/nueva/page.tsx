"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  PackagePlus,
  ChevronLeft,
  MapPin,
  Phone,
  User,
  Store,
  Banknote,
  FileText,
  Contact,
  Search,
  X,
  Upload,
  Tag,
  Plus,
  Minus,
  Boxes,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { useMyClient } from "@/components/useMyClient";
import { useOffline } from "@/components/OfflineContext";
import { PriceList } from "@/components/PriceList";
import { PACKAGE_SIZES, PACKAGE_TYPES } from "@/lib/constants";
import { esFalloDeRed } from "@/lib/offline/queue";
import { formatCOP, cn, normalizarBusqueda } from "@/lib/utils";
import { zoneForText } from "@/lib/zones";
import type {
  Client,
  Zone,
  Recipient,
  Product,
  GuideItem,
  PackageSize,
  PackageType,
} from "@/lib/types";

/**
 * ¿Son el mismo dato escrito por dos manos distintas?
 *
 * Se usa para no llenar la libreta del comercio de duplicados: «Cra 43 #1-50»
 * un día y «cra  43 #1-50» al siguiente son la misma casa. No pretende ser una
 * normalización de direcciones —eso no se resuelve con una función— sino evitar
 * el duplicado obvio de mayúsculas y espacios de más.
 */
function igual(a: string, b: string) {
  const limpio = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return limpio(a) === limpio(b) && limpio(a).length > 0;
}

export default function NewGuidePage() {
  const router = useRouter();
  const profile = useProfile();
  const esCliente = profile.role === "cliente";
  // Autoaprovisiona el comercio: una cuenta cliente nunca queda bloqueada.
  const { client: miComercio, clientId, loading: cargandoComercio, error: errorComercio } = useMyClient();
  const offline = useOffline();

  const [clients, setClients] = useState<Client[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [buscador, setBuscador] = useState("");
  // Lo que va dentro de la caja. Antes esto era un único producto seleccionado
  // que se escribía como texto dentro de las notas: no se podían mandar dos
  // cosas, el segundo reemplazaba el valor del primero y no había forma de
  // quitar uno agregado por error.
  const [items, setItems] = useState<GuideItem[]>([]);
  const [buscadorProducto, setBuscadorProducto] = useState("");
  // Mientras nadie toque el monto a mano, manda la suma del contenido. En
  // cuanto alguien lo edita, deja de pisarse solo: puede haber un descuento,
  // un domicilio incluido o un abono ya hecho.
  const [codManual, setCodManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zonaManual, setZonaManual] = useState(false);
  // Encendido por defecto: quien escribe un comprador a mano casi siempre va a
  // volver a despacharle. Apagarlo es la excepción (una venta de una sola vez,
  // un regalo a una dirección ajena), no lo normal.
  const [guardarComprador, setGuardarComprador] = useState(true);

  const [form, setForm] = useState({
    client_id: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_address: "",
    recipient_city: "Medellín",
    zone_id: "",
    is_cod: false,
    cod_amount: "",
    notes: "",
    content_description: "",
    package_type: "" as PackageType | "",
    package_size: "" as PackageSize | "",
    package_weight_kg: "",
    is_fragile: false,
  });

  // Zonas y tarifas: el cliente ve el listado de precios completo.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("at_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
  }, []);

  // Comercios: el cliente no elige, se le carga el suyo automáticamente.
  useEffect(() => {
    if (esCliente) {
      if (clientId) setForm((f) => ({ ...f, client_id: clientId }));
      return;
    }
    const supabase = createClient();
    supabase
      .from("at_clients")
      .select("*")
      .eq("active", true)
      .order("business_name")
      .then(({ data }) => {
        const list = (data as Client[]) ?? [];
        setClients(list);
        if (list.length) setForm((f) => ({ ...f, client_id: f.client_id || list[0].id }));
      });
  }, [esCliente, clientId]);

  // Clientes guardados del comercio (si ya sincronizó su base).
  useEffect(() => {
    if (!clientId) return;
    const supabase = createClient();
    supabase
      .from("at_recipients")
      .select("*, at_zones(name)")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("times_used", { ascending: false })
      .order("full_name")
      .limit(1000)
      .then(({ data }) => setRecipients((data as Recipient[]) ?? []));
  }, [clientId]);

  // Catálogo de productos del comercio
  useEffect(() => {
    const cid = esCliente ? clientId : form.client_id;
    if (!cid) return;
    const supabase = createClient();
    supabase
      .from("at_products")
      .select("*")
      .eq("client_id", cid)
      .eq("active", true)
      .order("name")
      .limit(500)
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, [esCliente, clientId, form.client_id]);

  // Sugerencia de zona por dirección/ciudad mientras no la fijen a mano.
  useEffect(() => {
    if (zonaManual || zones.length === 0) return;
    const z = zoneForText(zones, `${form.recipient_city} ${form.recipient_address}`);
    setForm((f) => (f.zone_id === (z?.id ?? "") ? f : { ...f, zone_id: z?.id ?? "" }));
  }, [form.recipient_city, form.recipient_address, zones, zonaManual]);

  const zonaElegida = zones.find((z) => z.id === form.zone_id) ?? null;

  const nombreComercio = esCliente
    ? miComercio?.business_name ?? ""
    : clients?.find((c) => c.id === form.client_id)?.business_name ?? "";

  const coincidencias = useMemo(() => {
    const s = buscador.trim().toLowerCase();
    if (!s) return [];
    return recipients
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(s) ||
          r.address.toLowerCase().includes(s) ||
          (r.phone ?? "").includes(s)
      )
      .slice(0, 6);
  }, [buscador, recipients]);

  function usarDestinatario(r: Recipient) {
    setRecipientId(r.id);
    setBuscador("");
    setZonaManual(true);
    setForm((f) => ({
      ...f,
      recipient_name: r.full_name,
      recipient_phone: r.phone ?? "",
      recipient_address: r.address,
      recipient_city: r.city,
      zone_id: r.zone_id ?? "",
    }));
  }

  // ── Contenido del paquete ───────────────────────────────────────────────

  const totalContenido = useMemo(
    () => items.reduce((suma, i) => suma + i.unit_price * i.qty, 0),
    [items]
  );
  const unidades = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items]);

  const catalogoFiltrado = useMemo(() => {
    const s = normalizarBusqueda(buscadorProducto.trim());
    if (!s) return products;
    return products.filter(
      (p) =>
        normalizarBusqueda(p.name).includes(s) ||
        normalizarBusqueda(p.sku ?? "").includes(s) ||
        normalizarBusqueda(p.description ?? "").includes(s)
    );
  }, [products, buscadorProducto]);

  /**
   * Sube o baja la cantidad de un producto del catálogo, lo agregue o lo
   * quite de la lista según haga falta. El control de cantidad vive en la
   * misma tarjeta donde se elige el producto, no en una lista aparte más
   * abajo a la que había que bajar la vista cada vez: elegir y ajustar
   * cantidad eran dos pasos en dos sitios, ahora es uno solo.
   */
  function cambiarCantidadProducto(p: Product, delta: number) {
    setItems((lista) => {
      const i = lista.findIndex((x) => x.product_id === p.id);
      if (i === -1) {
        if (delta <= 0) return lista;
        return [
          ...lista,
          { product_id: p.id, name: p.name, sku: p.sku, qty: 1, unit_price: Number(p.price) || 0 },
        ];
      }
      const nuevaQty = lista[i].qty + delta;
      if (nuevaQty <= 0) return lista.filter((_, idx) => idx !== i);
      const copia = [...lista];
      copia[i] = { ...copia[i], qty: nuevaQty };
      return copia;
    });
  }

  // El valor a recaudar sigue al contenido mientras nadie lo escriba a mano.
  useEffect(() => {
    if (items.length === 0 || codManual) return;
    setForm((f) =>
      f.is_cod && f.cod_amount === String(totalContenido)
        ? f
        : { ...f, is_cod: true, cod_amount: String(totalContenido) }
    );
  }, [items.length, totalContenido, codManual]);

  function limpiarDestinatario() {
    setRecipientId(null);
    setZonaManual(false);
    setForm((f) => ({
      ...f,
      recipient_name: "",
      recipient_phone: "",
      recipient_address: "",
      recipient_city: "Medellín",
      zone_id: "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.client_id) {
      setError("Todavía estamos preparando tu comercio. Espera un segundo y vuelve a intentar.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const fila = {
      client_id: form.client_id,
      recipient_name: form.recipient_name,
      recipient_phone: form.recipient_phone || null,
      recipient_address: form.recipient_address,
      recipient_city: form.recipient_city,
      zone_id: form.zone_id || null,
      is_cod: form.is_cod,
      cod_amount: form.is_cod ? Number(form.cod_amount) || 0 : 0,
      // Lo que vale la mercancía, se cobre o no contraentrega: es el dato
      // que importa en un reclamo por pérdida o avería.
      declared_value: totalContenido,
      items,
      content_description: form.content_description.trim() || null,
      package_type: form.package_type || null,
      package_size: form.package_size || null,
      // Un "0" escrito en el campo es una cadena con valor, pero la base
      // exige peso > 0: se guarda como «no lo sé», que es lo que significa.
      package_weight_kg:
        Number(form.package_weight_kg) > 0 ? Number(form.package_weight_kg) : null,
      is_fragile: form.is_fragile,
      notes: form.notes || null,
      created_by: profile.id,
    };
    const { data, error } = await supabase.from("at_guides").insert(fila).select("id").single();

    if (error && esFalloDeRed(error)) {
      // Sin señal: la guía queda en cola y sube sola. No hay `id` que dar
      // hasta que el servidor la cree, así que no hay detalle al que ir —
      // se vuelve al listado, que es donde aparecerá cuando se sincronice.
      await offline.encolar("crear_guia", { fila });
      setSaving(false);
      router.push("/guias?creada=en-cola");
      return;
    }

    if (error || !data) {
      setError(error?.message ?? "No se pudo crear la guía");
      setSaving(false);
      return;
    }

    // La libreta de compradores del comercio. O se actualiza el que se usó, o
    // se guarda el que se acaba de escribir: sin esto, despacharle por segunda
    // vez al mismo comprador obligaba a irse a «Clientes» y teclear otra vez
    // nombre, teléfono y dirección, y en la práctica nadie lo hacía.
    //
    // Nada de esto puede tumbar la guía, que ya está creada y es lo que
    // importa: una libreta se vuelve a llenar, un envío perdido no.
    if (clientId) {
      const yaEnLaBase = recipientId
        ? recipients.find((r) => r.id === recipientId)
        : recipients.find(
            (r) =>
              igual(r.full_name, form.recipient_name) &&
              igual(r.address, form.recipient_address)
          );

      if (yaEnLaBase) {
        // Sube en la lista: el buscador ordena por los más despachados.
        await supabase
          .from("at_recipients")
          .update({
            times_used: (yaEnLaBase.times_used ?? 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", yaEnLaBase.id);
      } else if (guardarComprador) {
        await supabase.from("at_recipients").insert({
          client_id: clientId,
          full_name: form.recipient_name.trim(),
          phone: form.recipient_phone.trim() || null,
          address: form.recipient_address.trim(),
          city: form.recipient_city.trim(),
          zone_id: form.zone_id || null,
          times_used: 1,
          last_used_at: new Date().toISOString(),
        });
      }
    }

    router.push(`/guias/${data.id}`);
  }

  const set =
    (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  if (esCliente && cargandoComercio) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500 dark:text-slate-400 font-sans">
        <div className="w-8 h-8 border-2 border-[#ff812c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[15px]">Preparando tu comercio…</p>
      </div>
    );
  }

  // Admin/Staff no crean guías directamente, las gestionan.
  if (!esCliente) {
    return (
      <div className="pb-10 max-w-2xl mx-auto w-full font-sans px-4">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] py-4">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-10 text-center shadow-sm border border-slate-200 dark:border-slate-800">
          <PackagePlus className="mx-auto mb-4 size-10 text-slate-400" />
          <h2 className="text-[19px] font-bold text-slate-900 dark:text-white">Creación de guías reservada a comercios</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Los administradores de A Tiempo Logística gestionan el flujo operativo, pero no crean guías directamente. Cada guía es registrada por el comercio correspondiente.
          </p>
          <Link
            href="/guias"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ff812c] px-6 min-h-[48px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
          >
            Ver guías existentes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 max-w-2xl mx-auto w-full font-sans">
      <div className="relative flex items-center justify-between px-4 py-4 mb-2">
        <button onClick={() => router.back()} className="flex items-center text-[#ff812c] active:opacity-70 transition-opacity">
          <ChevronLeft className="w-6 h-6 -ml-2" />
          <span className="text-[17px]">Atrás</span>
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight absolute left-1/2 -translate-x-1/2 text-slate-900 dark:text-white">Nueva Guía</h1>
        <div className="w-[70px]"></div>
      </div>

      <div className="px-4 space-y-6">
        <div className="mb-2">
          <h2 className="text-[34px] font-bold tracking-tight text-slate-900 dark:text-white">Nueva guía</h2>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">Registra un envío para última milla</p>
        </div>

        {errorComercio && (
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
            <p className="text-[14px] font-medium text-rose-600 dark:text-rose-400">{errorComercio}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/*
            Contenido del paquete.

            Antes esto eran dos listas: arriba el catálogo con un botón
            «Agregar», abajo una lista aparte donde recién se podía subir o
            bajar la cantidad. Elegir y ajustar cantidad eran dos pasos en dos
            sitios distintos de la pantalla. Ahora cada tarjeta del catálogo
            ES el control de cantidad: sin nada elegido muestra «Agregar»: un
            toque y ya, y en cuanto tiene una unidad se convierte en el
            contador -/+ ahí mismo, sin bajar la vista a buscarlo en otra
            lista.
          */}
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2 flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-[#ff812c]" />
              Contenido del paquete
            </h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">

              {products.length > 0 ? (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                    <Tag className="w-3.5 h-3.5 text-[#ff812c] shrink-0" />
                    <span>
                      Tu catálogo ({products.length}). Ajusta la cantidad directo en cada producto.
                    </span>
                  </div>

                  {/* Con más de media docena, buscar es más rápido que barrer
                      una lista con el dedo. */}
                  {products.length > 6 && (
                    <div className="flex items-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-3 min-h-[44px]">
                      <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                      <input
                        value={buscadorProducto}
                        onChange={(e) => setBuscadorProducto(e.target.value)}
                        placeholder="Buscar por nombre o SKU…"
                        className="flex-1 min-w-0 bg-transparent text-[15px] py-2 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                      {buscadorProducto && (
                        <button
                          type="button"
                          onClick={() => setBuscadorProducto("")}
                          className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500"
                          aria-label="Limpiar búsqueda"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {catalogoFiltrado.length === 0 ? (
                    <p className="py-4 text-center text-[14px] text-slate-500 dark:text-slate-400">
                      Ningún producto coincide con «{buscadorProducto}».
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 max-h-80 overflow-y-auto pr-1">
                      {catalogoFiltrado.map((p) => {
                        const it = items.find((i) => i.product_id === p.id);
                        const qty = it?.qty ?? 0;
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "flex flex-col rounded-xl border p-3 transition-colors",
                              qty > 0
                                ? "border-[#ff812c] bg-[#ff812c]/5"
                                : "border-slate-200 dark:border-slate-700 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-[14px] text-slate-900 dark:text-white line-clamp-2">
                                {p.name}
                              </p>
                              <span className="font-bold text-[14px] text-[#ff812c] shrink-0">
                                {formatCOP(p.price)}
                              </span>
                            </div>
                            {p.sku && (
                              <p className="mt-0.5 text-[12px] font-mono text-slate-500 dark:text-slate-400">
                                SKU {p.sku}
                              </p>
                            )}
                            {p.description && (
                              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                {p.description}
                              </p>
                            )}

                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => cambiarCantidadProducto(p, 1)}
                                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#ff812c] min-h-[38px] text-[13px] font-bold text-[#1C1C1E] active:scale-[0.98] transition-transform"
                              >
                                <Plus className="w-4 h-4" />
                                Agregar
                              </button>
                            ) : (
                              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[#F2F2F7] dark:bg-[#1C1C1E] p-1">
                                <button
                                  type="button"
                                  onClick={() => cambiarCantidadProducto(p, -1)}
                                  aria-label={`Una ${p.name} menos`}
                                  className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="flex-1 text-center text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => cambiarCantidadProducto(p, 1)}
                                  aria-label={`Una ${p.name} más`}
                                  className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 py-4 space-y-3">
                  <p className="text-[14px] text-slate-500 dark:text-slate-400">
                    Todavía no tienes catálogo. Puedes describir el contenido a mano más
                    abajo, o cargarlo una vez y elegirlo con un toque en cada guía.
                  </p>
                  <Link
                    href="/productos"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 min-h-[44px] text-[15px] font-semibold text-[#ff812c] active:scale-[0.98] transition-transform"
                  >
                    <Tag className="w-4 h-4" /> Cargar mis productos
                  </Link>
                </div>
              )}

              {/* Resumen del pedido. Ya no hay una segunda lista que repita lo
                  que la cuadrícula de arriba muestra: solo el total, que es lo
                  único que no se ve de un vistazo ahí arriba. */}
              {items.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 py-3">
                  <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400">
                    {unidades} artículo{unidades === 1 ? "" : "s"} · valor declarado
                  </p>
                  <p className="text-[18px] font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatCOP(totalContenido)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Tipificación: lo que el CEDI necesita para saber quién puede
              cargarlo y cómo se manipula. Todo opcional a propósito — obligar
              a tipificar un sobre de documentos solo agrega fricción. */}
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2 flex items-center gap-1.5">
              <PackagePlus className="w-3.5 h-3.5 text-[#ff812c]" />
              Cómo viene el paquete
            </h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">

              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <label className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
                  Empaque
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PACKAGE_TYPES.map((t) => {
                    const activo = form.package_type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        title={t.hint}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            package_type: activo ? "" : t.value,
                          }))
                        }
                        className={cn(
                          "rounded-xl px-4 min-h-[42px] text-[14px] font-semibold transition-colors",
                          activo
                            ? "bg-[#ff812c] text-[#1C1C1E]"
                            : "bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-600 dark:text-slate-300"
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {form.package_type && (
                  <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                    {PACKAGE_TYPES.find((t) => t.value === form.package_type)?.hint}
                  </p>
                )}
              </div>

              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <label className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
                  Tamaño
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PACKAGE_SIZES.map((t) => {
                    const activo = form.package_size === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            package_size: activo ? "" : t.value,
                          }))
                        }
                        className={cn(
                          "rounded-xl px-2 py-2 min-h-[56px] text-[14px] font-semibold leading-tight transition-colors",
                          activo
                            ? "bg-[#ff812c] text-[#1C1C1E]"
                            : "bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-600 dark:text-slate-300"
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {form.package_size && (
                  <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
                    {PACKAGE_SIZES.find((t) => t.value === form.package_size)?.hint}
                  </p>
                )}
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Scale className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={form.package_weight_kg}
                  onChange={set("package_weight_kg")}
                  placeholder="Peso aproximado"
                  className="flex-1 min-w-0 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
                <span className="ml-2 text-[15px] text-slate-400 dark:text-slate-500 shrink-0">kg</span>
              </div>

              <div
                className="flex items-center gap-3 px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors"
                onClick={() => setForm((f) => ({ ...f, is_fragile: !f.is_fragile }))}
              >
                <TriangleAlert
                  className={cn(
                    "w-5 h-5 shrink-0",
                    form.is_fragile ? "text-[#ff812c]" : "text-slate-400 dark:text-slate-500"
                  )}
                />
                <div className="flex-1 min-w-0 py-2">
                  <label className="block text-[16px] font-medium text-slate-900 dark:text-white cursor-pointer">
                    Frágil
                  </label>
                  <p className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                    Vidrio, cerámica, pantallas: el CEDI lo separa del resto
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.is_fragile}
                  readOnly
                  aria-label="Marcar el paquete como frágil"
                  className="w-14 h-8 shrink-0 rounded-full appearance-none bg-gray-300 dark:bg-gray-600 checked:bg-[#ff812c] transition-colors relative cursor-pointer
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-7 after:h-7 after:bg-white after:rounded-full after:shadow-sm after:transition-transform checked:after:translate-x-6"
                />
              </div>

              <div className="flex items-start px-4 py-2 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Boxes className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0 mt-2.5" />
                <textarea
                  value={form.content_description}
                  onChange={set("content_description")}
                  rows={2}
                  placeholder={
                    items.length > 0
                      ? "Algo más que vaya adentro y no esté en la lista (opcional)"
                      : "Qué va adentro: 2 camisas talla M y un cinturón"
                  }
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white resize-none"
                />
              </div>

            </div>
          </section>

          {/* Clientes guardados, o invitación a sincronizar si no hay */}
          {esCliente && (
            <section>
              <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">
                Mis clientes
              </h3>
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
                {recipients.length === 0 ? (
                  <div className="px-4 py-4 space-y-3">
                    <p className="text-[14px] text-slate-500 dark:text-slate-400">
                      Puedes escribir los datos a mano abajo, o subir tu base de compradores una
                      sola vez para que se autocompleten.
                    </p>
                    <Link
                      href="/destinatarios"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F2F2F7] dark:bg-[#1C1C1E] px-4 min-h-[44px] text-[15px] font-semibold text-[#ff812c] active:scale-[0.98] transition-transform"
                    >
                      <Upload className="w-4 h-4" /> Subir mi base de clientes
                    </Link>
                  </div>
                ) : recipientId ? (
                  <div className="flex items-center gap-3 px-4 min-h-[56px]">
                    <Contact className="w-5 h-5 text-[#ff812c] shrink-0" />
                    <p className="flex-1 text-[15px] text-slate-900 dark:text-white truncate">
                      Datos cargados desde tu base
                    </p>
                    <button
                      type="button"
                      onClick={limpiarDestinatario}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400"
                      title="Escribir los datos a mano"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center px-4 min-h-[56px]">
                      <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                      <input
                        value={buscador}
                        onChange={(e) => setBuscador(e.target.value)}
                        placeholder={`Buscar entre ${recipients.length} cliente(s)…`}
                        className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    {coincidencias.length > 0 && (
                      <ul className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        {coincidencias.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => usarDestinatario(r)}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                              <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{r.full_name}</p>
                              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                                {r.address} · {r.city}
                                {r.phone && ` · ${r.phone}`}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Información de Envío</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">

              {/* El comercio que crea la guía se carga solo; el cliente no lo elige. */}
              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800">
                <Store className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                {esCliente ? (
                  <div className="flex-1 min-w-0 py-3">
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 leading-none">Comercio remitente</p>
                    <p className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white truncate">
                      {nombreComercio || "…"}
                    </p>
                  </div>
                ) : (
                  <select
                    required
                    value={form.client_id}
                    onChange={set("client_id")}
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                  >
                    <option value="" disabled>Cliente e-commerce...</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.business_name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <User className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  required
                  value={form.recipient_name}
                  onChange={set("recipient_name")}
                  placeholder="Nombre del destinatario"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Phone className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  value={form.recipient_phone}
                  onChange={set("recipient_phone")}
                  placeholder="Teléfono"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  required
                  value={form.recipient_address}
                  onChange={set("recipient_address")}
                  placeholder="Dirección (Cl 10 #43E-31, apto 201)"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Ciudad</label>
                <input
                  required
                  value={form.recipient_city}
                  onChange={set("recipient_city")}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[80px] text-[16px] text-slate-500 dark:text-slate-400 shrink-0">Zona</label>
                <select
                  value={form.zone_id}
                  onChange={(e) => {
                    setZonaManual(true);
                    set("zone_id")(e);
                  }}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none text-slate-900 dark:text-white appearance-none"
                >
                  <option value="">(Se define en el CEDI)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                      {z.coverage ? ` — ${z.coverage}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Guardar al comprador desde aquí mismo. Solo aparece cuando los
                  datos se escribieron a mano: si vienen de la libreta ya está
                  guardado y ofrecerlo otra vez confunde. */}
              {!recipientId && (
                <div
                  className="flex items-center gap-3 px-4 min-h-[52px] cursor-pointer transition-colors"
                  onClick={() => setGuardarComprador((v) => !v)}
                >
                  <Contact className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <div className="flex-1 min-w-0 py-2">
                    <label className="block text-[16px] font-medium text-slate-900 dark:text-white cursor-pointer">
                      Guardar en mis clientes
                    </label>
                    <p className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                      La próxima vez lo buscas por el nombre y se llena solo
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={guardarComprador}
                    readOnly
                    aria-label="Guardar este comprador en mis clientes"
                    className="w-14 h-8 shrink-0 rounded-full appearance-none bg-gray-300 dark:bg-gray-600 checked:bg-[#ff812c] transition-colors relative cursor-pointer
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-7 after:h-7 after:bg-white after:rounded-full after:shadow-sm after:transition-transform checked:after:translate-x-6"
                  />
                </div>
              )}

            </div>

            {zonaElegida ? (
              <div className="mt-2 mx-1 flex items-center justify-between gap-3 rounded-2xl bg-[#ff812c]/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#ff812c] truncate">{zonaElegida.name}</p>
                  {zonaElegida.coverage && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{zonaElegida.coverage}</p>
                  )}
                </div>
                <p className="text-[17px] font-bold text-slate-900 dark:text-white shrink-0">
                  {formatCOP(zonaElegida.delivery_rate)}
                </p>
              </div>
            ) : (
              form.recipient_address.trim().length > 3 && (
                <p className="mt-2 mx-1 rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-[13px] text-slate-500 dark:text-slate-400">
                  No reconocimos la zona por la dirección. El CEDI la asignará al recibir el paquete.
                </p>
              )
            )}
          </section>

          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Recaudo e instrucciones</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">

              <div className="flex items-center justify-between px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 transition-colors cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_cod: !f.is_cod }))}>
                <label className="text-[16px] text-slate-900 dark:text-white font-medium flex-1 cursor-pointer">Pago Contraentrega (COD)</label>
                <input
                  type="checkbox"
                  checked={form.is_cod}
                  readOnly
                  className="w-14 h-8 shrink-0 rounded-full appearance-none bg-gray-300 dark:bg-gray-600 checked:bg-[#ff812c] transition-colors relative cursor-pointer
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-7 after:h-7 after:bg-white after:rounded-full after:shadow-sm after:transition-transform checked:after:translate-x-6"
                />
              </div>

              {form.is_cod && (
                <>
                  <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors bg-gray-50 dark:bg-[#1C1C1E]">
                    <Banknote className="w-5 h-5 text-[#ff812c] mr-4 shrink-0" />
                    <span className="text-slate-400 dark:text-slate-500 mr-2">$</span>
                    <input
                      type="number"
                      min="0"
                      required
                      value={form.cod_amount}
                      onChange={(e) => {
                        // A partir de aquí manda lo que escriba la persona: la
                        // suma del contenido deja de pisar el monto.
                        setCodManual(true);
                        set("cod_amount")(e);
                      }}
                      placeholder="Valor a recaudar"
                      className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white font-semibold"
                    />
                  </div>

                  {/* Que el monto no cuadre con el contenido es legítimo —un
                      descuento, un abono, el domicilio incluido—, pero también
                      es como se cobra de menos por equivocación. Se avisa sin
                      bloquear, y se ofrece cuadrarlo de un toque. */}
                  {items.length > 0 && Number(form.cod_amount || 0) !== totalContenido && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
                      <p className="text-[13px] text-amber-700 dark:text-amber-400">
                        El contenido suma {formatCOP(totalContenido)}.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCodManual(false);
                          setForm((f) => ({ ...f, cod_amount: String(totalContenido) }));
                        }}
                        className="text-[13px] font-bold text-[#ff812c] active:opacity-70"
                      >
                        Cobrar ese valor
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-start px-4 py-2 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0 mt-2.5" />
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  // El contenido ya no vive aquí: esto es para quien entrega.
                  placeholder="Instrucciones para la entrega: timbre dañado, dejar en portería…"
                  rows={2}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white resize-none"
                />
              </div>

            </div>
          </section>

          <PriceList zones={zones} activeZoneId={form.zone_id || null} />

          {error && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
              <p className="text-[14px] text-rose-600 dark:text-rose-400 text-center font-medium">
                {error}
              </p>
            </div>
          )}

          {/* En el teléfono se apoya encima de la barra de pestañas, no en el
              borde de la pantalla: con `bottom-0` el botón «Crear guía» caía
              dentro de los 68 px de las pestañas y quedaba tapado a medias. */}
          <div className="fixed bottom-nav left-0 right-0 p-4 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 z-20 md:static md:bg-transparent md:border-0 md:p-0 md:backdrop-blur-none transition-colors duration-300">
            <div className="flex gap-3 max-w-2xl mx-auto">
              <button
                type="button"
                onClick={() => router.back()}
                disabled={saving}
                className="flex-1 flex items-center justify-center bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-900 dark:text-white font-semibold rounded-xl min-h-[52px] shadow-sm active:scale-[0.98] transition-transform"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] shadow-sm disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="w-5 h-5 animate-spin text-[#1C1C1E]" /> : <PackagePlus className="w-5 h-5 text-[#1C1C1E]" />}
                <span>Crear guía</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
