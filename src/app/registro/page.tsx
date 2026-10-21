"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  UserPlus,
  Store,
  Bike,
  IdCard,
  Warehouse,
  Headset,
  Search,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { CATEGORIAS_COMERCIO } from "@/lib/constants";
import { CIUDADES_OPERADAS } from "@/lib/zones";
import { marcaDeAceptacion } from "@/lib/legal";
import { FondoRegistro } from "@/components/fondos/FondoRegistro";
import { FEATURES } from "@/lib/features";

/**
 * Roles soportados a nivel de backend y base de datos.
 * PRESERVADOS AL 100% PARA REACTIVACIÓN FUTURA DE FLOTA Y LOGÍSTICA.
 */
export type RequestedRole =
  | "comprador"
  | "cliente"
  | "mensajero"
  | "operario"
  | "admin_cedi"
  | "asesor";

/** Un comercio devuelto por at_comercios_para_registro (preservado para asesores). */
interface ComercioOpcion {
  id: string;
  business_name: string;
}

export default function RegisterPage() {
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("comprador");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);

  // Datos del negocio (solo para comercio / tienda)
  const [categoria, setCategoria] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [businessNit, setBusinessNit] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessCity, setBusinessCity] = useState("");

  // Datos de logística y flota (PRESERVADOS: CEDI afiliado y Asesores comerciales)
  const [proposedCity, setProposedCity] = useState("");
  const [buscaComercio, setBuscaComercio] = useState("");
  const [comercios, setComercios] = useState<ComercioOpcion[]>([]);
  const [comercioElegido, setComercioElegido] = useState<ComercioOpcion | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Consentimiento de datos personales y términos
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const isComprador = requestedRole === "comprador";
  const isClient = requestedRole === "cliente";
  const isCedi = requestedRole === "admin_cedi";
  const isAsesor = requestedRole === "asesor";
  const isOperario = requestedRole === "operario";
  const isMensajero = requestedRole === "mensajero";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isClient && !categoria) {
      setError("Selecciona una categoría para tu negocio.");
      return;
    }
    if (isClient && !businessCity) {
      setError("Dinos desde qué municipio despachas: de ahí sale el precio de tus domicilios.");
      return;
    }
    if (isCedi && (!businessName.trim() || !proposedCity.trim() || !businessAddress.trim())) {
      setError("El nombre del CEDI, la ciudad y la dirección del local son obligatorios.");
      return;
    }
    if (isAsesor && !comercioElegido) {
      setError("Busca y elige el comercio para el que trabajas.");
      return;
    }
    if (!aceptaPoliticas) {
      setError("Para crear la cuenta tienes que aceptar los términos y la política de datos.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    
    // Mapeo compatible con base de datos: 'comprador' y 'comercio' usan el rol base 'cliente'
    const roleForBackend = isComprador ? "cliente" : requestedRole;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirmar?next=/inicio`,
        data: {
          full_name: fullName,
          phone: phone || null,
          requested_role: roleForBackend,
          account_type: isComprador ? "comprador" : isClient ? "comercio" : requestedRole,
          tipo_registro: requestedRole,
          ...marcaDeAceptacion(),
          ...(isClient
            ? {
                business_type: categoria,
                categoria: categoria,
                category: categoria,
                business_name: businessName || fullName,
                business_nit: businessNit || null,
                business_address: businessAddress || null,
                business_city: businessCity,
              }
            : {}),
          ...(isCedi
            ? {
                business_name: businessName,
                business_address: businessAddress,
                proposed_city: proposedCity,
              }
            : {}),
          ...(isAsesor && comercioElegido
            ? { requested_client_id: comercioElegido.id }
            : {}),
        },
      },
    });

    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setDone(true);
  }

  const fieldRow =
    "flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors";
  const fieldInput =
    "flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white";
  const fieldLabel = "w-[110px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0";

  // Catálogo completo de opciones con visibilidad gobernada para interfaz pública
  const opcionesSelector: {
    value: RequestedRole;
    label: string;
    hint: string;
    icon: typeof Store;
    visible: boolean;
  }[] = [
    {
      value: "comprador",
      label: "Comprador",
      hint: "Consultar compras y pedidos",
      icon: ShoppingBag,
      visible: true,
    },
    {
      value: "cliente",
      label: "Comercio / Tienda",
      hint: "Publicar y vender productos",
      icon: Store,
      visible: true,
    },
    {
      value: "operario",
      label: "Personal ATL",
      hint: "Acceso operativo y equipo",
      icon: IdCard,
      visible: true,
    },
    // Opciones logísticas preservadas al 100% para reactivación futura
    {
      value: "mensajero",
      label: "Mensajero",
      hint: "Domicilios y flota",
      icon: Bike,
      visible: FEATURES.MOSTRAR_MENSAJERIA_PUBLICO,
    },
    {
      value: "asesor",
      label: "Asesor comercial",
      hint: "Equipo de ventas de una tienda",
      icon: Headset,
      visible: FEATURES.MOSTRAR_ROLES_LOGISTICOS_REGISTRO,
    },
    {
      value: "admin_cedi",
      label: "CEDI afiliado",
      hint: "Punto logístico afiliado",
      icon: Warehouse,
      visible: FEATURES.MOSTRAR_ROLES_LOGISTICOS_REGISTRO,
    },
  ];

  const opcionesVisibles = opcionesSelector.filter((opt) => opt.visible);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 py-10 transition-colors duration-300">
      <FondoRegistro />
      <div className="w-full max-w-md">
        
        {/* Cabecera / Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <Logo />
            </Link>
          </div>
          {done ? (
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
              Revisa tu correo
            </h1>
          ) : (
            <>
              <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
                Crear cuenta
              </h1>
              <p className="mt-2 text-[15px] sm:text-[16px] text-slate-500 dark:text-slate-400 leading-snug">
                {isOperario
                  ? "Administración verificará tus datos y activará tu acceso operativo"
                  : isCedi
                  ? "Sube los documentos de tu solicitud y espera la aprobación"
                  : isClient
                  ? "Registra tu tienda para vender en la vitrina regional"
                  : "Crea tu cuenta para comprar y consultar tus pedidos"}
              </p>
            </>
          )}
        </div>

        <div className="mt-8">
          {done ? (
            <div className="text-center space-y-8">
              <p className="text-[16px] leading-relaxed text-slate-500 dark:text-slate-400">
                Te enviamos un correo a{" "}
                <strong className="text-slate-700 dark:text-slate-300">{email}</strong>.
                Abre el enlace para confirmar tu cuenta
                {isOperario ? (
                  <>
                    . Como te registraste como personal de A Tiempo, un
                    administrador revisará tus datos y activará tu acceso.
                  </>
                ) : isCedi ? (
                  <>
                    . Ahí mismo entras a subir los documentos de tu solicitud —cédula y
                    los del local—, y un administrador nacional la revisa y la aprueba.
                  </>
                ) : isClient ? (
                  <>
                    {" "}y empieza a publicar tus productos y administrar despachos en YAM.
                  </>
                ) : (
                  <>
                    {" "}para consultar tus compras y hacer seguimiento a tus pedidos.
                  </>
                )}
              </p>
              <p className="text-[14px] text-slate-400 dark:text-slate-500">
                ¿No te llegó? Revisa la carpeta de spam o correo no deseado.
              </p>
              <Link
                href="/login"
                className="w-full flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px]"
              >
                <span>Ir a iniciar sesión</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Selector de rol solicitado (Filtrado visualmente para la interfaz pública) */}
              <div>
                <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                  ¿Cómo te vas a registrar?
                </p>
                <div
                  className={`grid gap-2.5 ${
                    opcionesVisibles.length <= 2
                      ? "grid-cols-2"
                      : "grid-cols-1 sm:grid-cols-3"
                  }`}
                >
                  {opcionesVisibles.map((opt) => {
                    const selected = requestedRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRequestedRole(opt.value)}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 sm:p-4 border transition-all active:scale-[0.98] ${
                          selected
                            ? "border-[#ff812c] bg-[#ff812c]/10 text-[#ff812c] shadow-sm ring-1 ring-[#ff812c]"
                            : "border-slate-200/80 dark:border-white/10 atl-superficie text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 shadow-sm"
                        }`}
                      >
                        <opt.icon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                        <span className="text-[13px] sm:text-[14px] font-bold leading-tight text-center">
                          {opt.label}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-none hidden sm:block">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Datos personales (Siempre visibles para todos los perfiles) */}
              <div className="atl-superficie rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
                <div className={fieldRow}>
                  <label className={fieldLabel}>Nombre</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={fieldInput}
                    placeholder="Nombre y apellido"
                  />
                </div>
                <div className={fieldRow}>
                  <label className={fieldLabel}>WhatsApp</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldInput}
                    placeholder="300 123 4567"
                  />
                </div>
                <div className={fieldRow}>
                  <label className={fieldLabel}>Correo</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldInput}
                    placeholder="tu@correo.com"
                  />
                </div>
                <div className={`${fieldRow} border-b-0`}>
                  <label className={fieldLabel}>Contraseña</label>
                  <input
                    type={verPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldInput}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    className="shrink-0 -mr-1 w-10 h-10 inline-flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:opacity-70 transition-colors"
                  >
                    {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Sección exclusiva: Datos del Negocio (Solo visible para Comercio / Tienda) */}
              {isClient && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                  {/* Tarjeta de Respaldo Contable y Financiero SolV */}
                  <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm text-emerald-900 dark:text-emerald-300 flex items-start gap-3 shadow-sm">
                    <span className="text-xl shrink-0">💼</span>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900 dark:text-white">
                        Vende sin estrés contable ni cuadres manuales
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                        Conciliación contable automática de cada venta, conexión con Shopify y transferencias de tus recaudos a tu cuenta bancaria en menos de 24 horas garantizadas.
                      </p>
                      <div className="pt-1">
                        <Link
                          href="/portal-comercios"
                          className="font-bold text-[#ff812c] hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          <span>Conocer a fondo los beneficios en el Portal Comercios</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                      Datos de tu negocio
                    </p>
                    <div className="atl-superficie rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
                      <div className={fieldRow}>
                        <label className={fieldLabel}>Categoría *</label>
                        <select
                          required
                          value={categoria}
                          onChange={(e) => setCategoria(e.target.value)}
                          className={`${fieldInput} appearance-none cursor-pointer ${
                            categoria ? "" : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          <option value="">Selecciona una categoría…</option>
                          {CATEGORIAS_COMERCIO.map((c) => (
                            <option key={c} value={c} className="text-slate-900">
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={fieldRow}>
                        <label className={fieldLabel}>Marca</label>
                        <input
                          required
                          value={businessName}
                          onChange={(e) => setBusinessName(e.target.value)}
                          className={fieldInput}
                          placeholder="Nombre comercial de la tienda"
                        />
                      </div>
                      <div className={fieldRow}>
                        <label className={fieldLabel}>NIT / CC</label>
                        <input
                          value={businessNit}
                          onChange={(e) => setBusinessNit(e.target.value)}
                          className={fieldInput}
                          placeholder="Opcional"
                        />
                      </div>
                      <div className={fieldRow}>
                        <label className={fieldLabel}>Dirección</label>
                        <input
                          value={businessAddress}
                          onChange={(e) => setBusinessAddress(e.target.value)}
                          className={fieldInput}
                          placeholder="Dirección de bodega o despacho (opcional)"
                        />
                      </div>
                      <div className={`${fieldRow} border-b-0`}>
                        <label className={fieldLabel}>Municipio</label>
                        <select
                          required
                          value={businessCity}
                          onChange={(e) => setBusinessCity(e.target.value)}
                          className={`${fieldInput} appearance-none cursor-pointer`}
                        >
                          <option value="">¿Desde dónde despachas?</option>
                          {CIUDADES_OPERADAS.map((c) => (
                            <option key={c} value={c} className="text-slate-900">
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lógica y formulario de Asesor Comercial (PRESERVADO AL 100%) */}
              {isAsesor && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                    ¿Para qué comercio trabajas?
                  </p>
                  <div className="atl-superficie rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
                    {comercioElegido ? (
                      <div className="flex items-center gap-3 px-4 py-4">
                        <Store className="w-5 h-5 shrink-0 text-[#ff812c]" />
                        <p className="flex-1 text-[16px] font-semibold text-slate-900 dark:text-white">
                          {comercioElegido.business_name}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setComercioElegido(null);
                            setBuscaComercio("");
                            setComercios([]);
                          }}
                          className="text-[14px] font-semibold text-[#ff812c] active:opacity-70"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08]">
                          <Search className="w-5 h-5 shrink-0 text-slate-400 mr-2" />
                          <input
                            value={buscaComercio}
                            onChange={async (e) => {
                              const q = e.target.value;
                              setBuscaComercio(q);
                              if (q.trim().length < 3) {
                                setComercios([]);
                                return;
                              }
                              setBuscando(true);
                              const supabase = createClient();
                              const { data } = await supabase.rpc("at_comercios_para_registro", {
                                p_busca: q,
                              });
                              setBuscando(false);
                              setComercios((data as ComercioOpcion[]) ?? []);
                            }}
                            placeholder="Escribe el nombre del comercio"
                            className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                          />
                          {buscando && (
                            <LoaderCircle className="w-4 h-4 shrink-0 animate-spin text-slate-400" />
                          )}
                        </div>

                        {buscaComercio.trim().length > 0 && buscaComercio.trim().length < 3 && (
                          <p className="px-4 py-3 text-[14px] text-slate-400">
                            Escribe al menos tres letras.
                          </p>
                        )}

                        {comercios.length > 0 && (
                          <ul className="max-h-56 overflow-y-auto divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
                            {comercios.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => setComercioElegido(c)}
                                  className="w-full px-4 py-3 text-left text-[16px] text-slate-900 dark:text-white active:bg-[#F2F2F7] dark:active:bg-[#1C1C1E]"
                                >
                                  {c.business_name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {buscaComercio.trim().length >= 3 && !buscando && comercios.length === 0 && (
                          <p className="px-4 py-3 text-[14px] leading-snug text-slate-400">
                            No encontramos ningún comercio con ese nombre. Pregúntale a tu
                            jefe con qué nombre está registrado.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <p className="mt-2 ml-1 text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                    Tu jefe recibirá tu solicitud y tendrá que confirmar que trabajas allí
                    antes de que puedas entrar.
                  </p>
                </div>
              )}

              {/* Lógica y formulario de CEDI Afiliado (PRESERVADO AL 100%) */}
              {isCedi && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                    Datos del CEDI
                  </p>
                  <div className="atl-superficie rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
                    <div className={fieldRow}>
                      <label className={fieldLabel}>Nombre</label>
                      <input
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className={fieldInput}
                        placeholder="CEDI Cali Norte"
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={fieldLabel}>Ciudad</label>
                      <input
                        required
                        value={proposedCity}
                        onChange={(e) => setProposedCity(e.target.value)}
                        className={fieldInput}
                        placeholder="Cali"
                      />
                    </div>
                    <div className={`${fieldRow} border-b-0`}>
                      <label className={fieldLabel}>Local</label>
                      <input
                        required
                        value={businessAddress}
                        onChange={(e) => setBusinessAddress(e.target.value)}
                        className={fieldInput}
                        placeholder="Dirección de la bodega o local"
                      />
                    </div>
                  </div>
                  <p className="mt-2 ml-1 text-[13px] text-slate-500 dark:text-slate-400">
                    Al confirmar el correo entras a subir tu cédula y los papeles del local.
                    Nada de esto opera hasta que A Tiempo lo apruebe.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
                  <p className="text-[14px] text-rose-600 dark:text-rose-400 text-center font-medium">
                    {error}
                  </p>
                </div>
              )}

              {/* Autorización de datos personales y términos legales */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/60 p-4 dark:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={aceptaPoliticas}
                  onChange={(e) => setAceptaPoliticas(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[#ff812c]"
                />
                <span className="text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                  Acepto los{" "}
                  <Link
                    href="/legal/terminos"
                    target="_blank"
                    className="font-semibold text-[#ff812c] underline"
                  >
                    términos y condiciones
                  </Link>{" "}
                  y autorizo el tratamiento de mis datos personales conforme a la{" "}
                  <Link
                    href="/legal/privacidad"
                    target="_blank"
                    className="font-semibold text-[#ff812c] underline"
                  >
                    política de tratamiento de datos
                  </Link>
                  .
                </span>
              </label>

              {/* Botón de envío dinámico */}
              <button
                type="submit"
                disabled={loading || !aceptaPoliticas}
                className="w-full flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] disabled:opacity-60 shadow-sm"
              >
                {loading ? (
                  <LoaderCircle className="w-5 h-5 animate-spin text-[#1C1C1E]" />
                ) : (
                  <UserPlus className="w-5 h-5 text-[#1C1C1E]" />
                )}
                <span>
                  {isComprador
                    ? "Crear cuenta de comprador"
                    : isClient
                    ? "Registrar comercio"
                    : "Enviar solicitud"}
                </span>
              </button>

              <p className="text-center text-[15px] text-slate-500 dark:text-slate-400">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#ff812c] hover:underline active:opacity-70 transition-opacity"
                >
                  Ingresa
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
