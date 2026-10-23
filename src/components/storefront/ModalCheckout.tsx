"use client";

import { useState } from "react";
import {
  X,
  CheckCircle2,
  Lock,
  MessageCircle,
  CreditCard,
  Building2,
  UserCheck,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Landmark,
} from "lucide-react";
import { formatCOP } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { MockProduct } from "@/data/mockProducts";
import { leerInventarioOferta, liquidarVenta, textoBajoPedido } from "@/lib/inventario";

export interface ModalCheckoutProps {
  product: MockProduct | null;
  onClose: () => void;
  initialQuantity?: number;
}

const MUNICIPIOS = [
  "Medellín",
  "Envigado",
  "Itagüí",
  "Sabaneta",
  "Bello",
  "La Estrella",
  "Caldas",
  "Rionegro",
  "Copacabana",
  "Girardota",
  "Otro municipio (coordinar con la tienda)",
];

type MetodoPago = "interledger" | "pse_tarjetas" | "puntored" | "acordado_tienda";

export function ModalCheckout({ product, onClose, initialQuantity = 1 }: ModalCheckoutProps) {
  const cantidad = initialQuantity > 0 ? initialQuantity : 1;
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [municipio, setMunicipio] = useState(MUNICIPIOS[0]);
  const [direccion, setDireccion] = useState("");
  const [complemento, setComplemento] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("interledger");

  // Casilla de registro opcional
  const [crearCuenta, setCrearCuenta] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Estados de proceso
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ordenCompletada, setOrdenCompletada] = useState<{
    codigo: string;
    cuentaCreada: boolean;
  } | null>(null);

  if (!product) return null;

  async function handleConfirmarOrden(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setErrorMsg(null);

    if (!nombre.trim()) {
      setErrorMsg("Por favor ingresa tu nombre completo.");
      return;
    }
    if (!telefono.trim() || telefono.length < 7) {
      setErrorMsg("Por favor ingresa un número de teléfono o WhatsApp válido.");
      return;
    }
    if (!direccion.trim()) {
      setErrorMsg("Por favor ingresa la dirección de entrega o punto de encuentro.");
      return;
    }
    if (crearCuenta) {
      if (!email.trim() || !email.includes("@")) {
        setErrorMsg("Ingresa un correo electrónico válido para crear tu cuenta.");
        return;
      }
      if (!password || password.length < 6) {
        setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
    }

    setLoading(true);

    try {
      let cuentaCreadaExitosa = false;

      // Si el comprador desea crear una cuenta con estos datos
      if (crearCuenta) {
        try {
          const supabase = createClient();
          const { error: signUpError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
              data: {
                full_name: nombre.trim(),
                phone: telefono.trim(),
                role: "comprador",
              },
            },
          });
          if (signUpError) {
            // Si el correo ya existe, avisar amablemente pero permitir continuar el pedido
            if (signUpError.message.toLowerCase().includes("already registered")) {
              console.warn("El usuario ya existe en Supabase Auth.");
            } else {
              console.warn("Aviso al registrar cuenta:", signUpError.message);
            }
          } else {
            cuentaCreadaExitosa = true;
          }
        } catch (err) {
          console.warn("Fallo no bloqueante al aprovisionar cuenta:", err);
        }
      }

      // Generar código único de orden
      const timestamp = Date.now().toString().slice(-4);
      const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
      const codigoOrden = `PED-${timestamp}-${randomHex}`;

      // Inventario y liquidación contable de la orden
      const infoProd = leerInventarioOferta(product.extra, product.price);
      const liq = liquidarVenta(product.price, cantidad, infoProd.precioOriginal);

      // Simular guardado de la intención de compra (Guest o registrado)
      const ordenPayload = {
        codigo: codigoOrden,
        producto_id: product.id,
        producto_nombre: product.name,
        cantidad,
        precio_unitario: product.price, // Precio final neto cobrado
        precio_unitario_original: infoProd.precioOriginal,
        total_neto: liq.total,
        comision_yam_7pct: liq.comisionYam, // Liquidada sobre el valor neto final cobrado
        neto_comercio: liq.netoComercio,
        es_bajo_pedido: infoProd.modo === "pedido",
        dias_elaboracion: infoProd.diasElaboracion,
        en_oferta: infoProd.enOferta,
        comercio: product.store_name,
        comprador: {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          municipio,
          direccion: direccion.trim(),
          complemento: complemento.trim(),
          email: crearCuenta ? email.trim() : null,
          es_invitado: !crearCuenta,
        },
        metodo_pago: metodoPago,
        fecha: new Date().toISOString(),
      };

      // Guardar en sessionStorage para historial local del comprador
      try {
        const prev = JSON.parse(localStorage.getItem("yam_pedidos_invitado") || "[]");
        localStorage.setItem("yam_pedidos_invitado", JSON.stringify([ordenPayload, ...prev]));
      } catch {
        // En caso de modo privado
      }

      setOrdenCompletada({
        codigo: codigoOrden,
        cuentaCreada: cuentaCreadaExitosa,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al procesar tu solicitud. Intenta nuevamente."
      );
    } finally {
      setLoading(false);
    }
  }

  // Inventario y valores calculados para la vista
  const info = product ? leerInventarioOferta(product.extra, product.price) : null;
  const liq = product ? liquidarVenta(product.price, cantidad, info?.precioOriginal ?? product.price) : { total: 0, comisionYam: 0, netoComercio: 0, ahorro: 0 };
  const totalCOP = liq.total;

  // Enlace para WhatsApp con mensaje pre-armado
  const mensajeWa = product
    ? encodeURIComponent(
        `¡Hola ${product.store_name}! 👋 Acabo de generar la orden *${ordenCompletada?.codigo || ""}* en la vitrina YAM.\n\n` +
          `📦 *Producto:* ${product.name}${cantidad > 1 ? ` (x${cantidad})` : ""}\n` +
          (info?.modo === "pedido" ? `🕒 *Tipo:* ${textoBajoPedido(info.diasElaboracion)}\n` : "") +
          `💰 *Total Neto:* ${formatCOP(totalCOP)}${info?.enOferta ? ` (Oferta especial con ahorro de ${formatCOP(liq.ahorro)})` : ""}\n` +
          `💳 *Método de pago:* ${
            metodoPago === "interledger"
              ? "Pago digital (Billeteras digitales como Nequi o Daviplata)"
              : metodoPago === "pse_tarjetas"
              ? "PSE y Tarjetas (Cuentas de ahorro y crédito)"
              : "Punto físico Puntored (Corresponsal / Efectivo)"
          }\n` +
          `📍 *Entrega:* ${direccion}, ${municipio} (${complemento || "Sin complemento"})\n` +
          `👤 *Comprador:* ${nombre} - Tel: ${telefono}\n\n` +
          `Quedo atento(a) para coordinar el despacho/retiro. ¡Muchas gracias!`
      )
    : "";

  const linkWhatsApp = product
    ? `https://wa.me/${product.store_phone.replace(/[^0-9]/g, "")}?text=${mensajeWa}`
    : "#";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 dark:bg-black/75 backdrop-blur-md transition-opacity">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#1C1C1E] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden my-8">
        
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ff812c]/10 text-[#ff812c]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {ordenCompletada ? "¡Pedido Confirmado!" : "Compra Rápida"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ordenCompletada
                  ? "Coordinación directa con el comercio"
                  : "Sin registro obligatorio — Modo Invitado"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen del producto en cabecera */}
        <div className="px-6 py-3.5 bg-amber-500/10 dark:bg-[#ff812c]/10 border-b border-amber-500/15 dark:border-[#ff812c]/20 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-[#ff812c] uppercase tracking-wider">
                {product.store_name}
              </p>
              {info?.modo === "pedido" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-700 dark:text-sky-300">
                  Bajo pedido ({info.diasElaboracion}d)
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {product.name}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Entrega o retiro coordinado directamente con {product.store_name}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              {cantidad > 1 ? `${cantidad} un. × ${formatCOP(product.price)}` : "Total"}
              {info?.enOferta && (
                <s className="ml-1 text-[11px] text-slate-400">
                  {formatCOP(info.precioOriginal * cantidad)}
                </s>
              )}
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white">
              {formatCOP(totalCOP)}
            </span>
          </div>
        </div>

        {/* CONTENIDO: Pantalla de Éxito o Formulario */}
        {ordenCompletada ? (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-500 dark:bg-emerald-500/20 mb-2">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 mb-2">
                Referencia: {ordenCompletada.codigo}
              </span>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                ¡Tu orden ha sido registrada!
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-md mx-auto">
                La entrega o retiro será coordinado directamente con{" "}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {product.store_name}
                </span>
                .
              </p>
            </div>

            {ordenCompletada.cuentaCreada && (
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-2xl text-xs text-blue-800 dark:text-blue-300 text-left flex items-start gap-2.5">
                <UserCheck className="w-5 h-5 shrink-0 text-blue-500" />
                <div>
                  <p className="font-bold">Cuenta de comprador creada exitosamente</p>
                  <p>
                    Podrás iniciar sesión con <b>{email}</b> para ver tus pedidos futuros.
                  </p>
                </div>
              </div>
            )}

            {/* Cuadro de resumen del pago elegido */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Método de pago:</span>
                <span className="font-bold text-slate-800 dark:text-white">
                  {metodoPago === "interledger"
                    ? "Pago digital (En línea e inmediato)"
                    : metodoPago === "pse_tarjetas"
                    ? "PSE y Tarjetas (Bancos y tarjetas)"
                    : "Punto físico Puntored / Corresponsal"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Dirección solicitada:</span>
                <span className="font-medium text-slate-800 dark:text-white">
                  {direccion}, {municipio}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-2 font-bold text-sm">
                <span className="text-slate-700 dark:text-slate-300">Total a pagar:</span>
                <span className="text-[#ff812c]">{formatCOP(totalCOP)}</span>
              </div>
            </div>

            {/* Acción de Contacto por WhatsApp con la Tienda */}
            <div className="pt-2 space-y-3">
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-bold rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                <span>Contactar a {product.store_name} por WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              >
                Volver a la vitrina
              </button>
            </div>
          </div>
        ) : (
          /* FORMULARIO DE COMPRA COMO INVITADO */
          <form onSubmit={handleConfirmarOrden} className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Datos Personales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tu Nombre Completo <span className="text-[#ff812c]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Camila Morales"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp o Teléfono <span className="text-[#ff812c]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 300 123 4567"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
                />
              </div>
            </div>

            {/* Ubicación y Entrega */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Municipio <span className="text-[#ff812c]">*</span>
                </label>
                <select
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#252528] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
                >
                  {MUNICIPIOS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Dirección o Punto de Entrega <span className="text-[#ff812c]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. Cra. 43A # 18 Sur - 45"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Complemento o especificaciones (Opcional)
              </label>
              <input
                type="text"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Apto, torre, indicaciones para la tienda o solicitud de retiro"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff812c]/50"
              />
            </div>

            {/* Selector de Método de Pago */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Método de Pago <span className="text-[#ff812c]">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* 1. Pago digital (Billeteras / Nequi / Daviplata) */}
                <button
                  type="button"
                  onClick={() => setMetodoPago("interledger")}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    metodoPago === "interledger"
                      ? "border-[#ff812c] bg-[#ff812c]/10 text-slate-900 dark:text-white shadow-sm ring-1 ring-[#ff812c]"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <CreditCard className="w-4 h-4 text-[#ff812c]" />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ff812c]/20 text-[#ff812c]">
                      En línea e inmediato
                    </span>
                  </div>
                  <span className="text-xs font-bold block">Pago digital</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Billeteras digitales como Nequi o Daviplata
                  </span>
                </button>

                {/* 2. PSE y Tarjetas (Bancos / Tarjetas) */}
                <button
                  type="button"
                  onClick={() => setMetodoPago("pse_tarjetas")}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    metodoPago === "pse_tarjetas"
                      ? "border-[#ff812c] bg-[#ff812c]/10 text-slate-900 dark:text-white shadow-sm ring-1 ring-[#ff812c]"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Landmark className="w-4 h-4 text-sky-500" />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400">
                      Bancos / PSE
                    </span>
                  </div>
                  <span className="text-xs font-bold block">PSE y Tarjetas</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Cuentas de ahorro vía PSE, crédito y débito
                  </span>
                </button>

                {/* 3. Punto Puntored (Efectivo / Corresponsal) */}
                <button
                  type="button"
                  onClick={() => setMetodoPago("puntored")}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    metodoPago === "puntored"
                      ? "border-[#ff812c] bg-[#ff812c]/10 text-slate-900 dark:text-white shadow-sm ring-1 ring-[#ff812c]"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Building2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                      Físico
                    </span>
                  </div>
                  <span className="text-xs font-bold block">Punto Puntored</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Corresponsal / Efectivo local
                  </span>
                </button>
              </div>
            </div>

            {/* CASILLA OPCIONAL: Registro de cuenta para historial */}
            <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crearCuenta}
                  onChange={(e) => setCrearCuenta(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#ff812c] focus:ring-[#ff812c]"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Deseo crear una cuenta con estos datos para guardar mi historial de compras
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Opcional. Te permitirá consultar tus compras anteriores y agilizar futuros pedidos.
                  </span>
                </div>
              </label>

              {/* Campos desplegables si activa la casilla */}
              {crearCuenta && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Correo Electrónico <span className="text-[#ff812c]">*</span>
                    </label>
                    <input
                      type="email"
                      required={crearCuenta}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#ff812c]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Crea tu Contraseña <span className="text-[#ff812c]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        required={crearCuenta}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#ff812c]"
                      />
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Aviso de coordinación directa */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-white/[0.02] p-2.5 rounded-xl">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>
                La coordinación de entrega o retiro se realiza directamente con{" "}
                <b className="text-slate-700 dark:text-slate-200">{product.store_name}</b>.
              </span>
            </div>

            {/* Botón de Confirmación */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#ff812c] text-[#1C1C1E] text-sm font-bold shadow-md hover:bg-[#ff812c]/90 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando orden...</span>
                </>
              ) : (
                <>
                  <span>Confirmar Pedido — {formatCOP(product.price)}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
