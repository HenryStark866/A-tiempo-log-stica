"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, UserPlus, Store, Bike, IdCard, Warehouse, Headset, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { BUSINESS_TYPES } from "@/lib/constants";
import { CIUDADES_OPERADAS } from "@/lib/zones";

import { FondoRegistro } from "@/components/fondos/FondoRegistro";
type RequestedRole = "cliente" | "mensajero" | "operario" | "admin_cedi" | "asesor";

/** Un comercio devuelto por at_comercios_para_registro. */
interface ComercioOpcion {
  id: string;
  business_name: string;
}

export default function RegisterPage() {
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("cliente");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  // Datos del negocio (solo cliente e-commerce)
  const [businessType, setBusinessType] = useState<string>("");
  const [businessName, setBusinessName] = useState("");
  const [businessNit, setBusinessNit] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessCity, setBusinessCity] = useState("");
  // Datos del local (solo CEDI afiliado): reutiliza businessName/businessAddress
  // con otro rótulo — es el mismo dato, "nombre y dirección de la operación".
  const [proposedCity, setProposedCity] = useState("");
  // Asesor comercial: a qué comercio dice pertenecer. Se busca por nombre en
  // vez de listar todos, porque la lista completa de comercios es información
  // comercial de A Tiempo y no tiene por qué estar al alcance de cualquiera
  // que abra el registro.
  const [buscaComercio, setBuscaComercio] = useState("");
  const [comercios, setComercios] = useState<ComercioOpcion[]>([]);
  const [comercioElegido, setComercioElegido] = useState<ComercioOpcion | null>(null);
  const [buscando, setBuscando] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const isClient = requestedRole === "cliente";
  const isCedi = requestedRole === "admin_cedi";
  const isAsesor = requestedRole === "asesor";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isClient && !businessType) {
      setError("Selecciona el tipo de negocio.");
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

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Al confirmar, Supabase manda aquí; la ruta canjea el token y lleva
        // a la bienvenida con la sesión ya iniciada.
        emailRedirectTo: `${window.location.origin}/auth/confirmar?next=/bienvenido`,
        data: {
          full_name: fullName,
          phone: phone || null,
          requested_role: requestedRole,
          ...(isClient
            ? {
                business_type: businessType,
                business_name: businessName,
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
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  const fieldRow =
    "flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors";
  const fieldInput =
    "flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white";
  const fieldLabel = "w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 py-10 transition-colors duration-300">
      <FondoRegistro />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
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
              <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
                {requestedRole === "operario"
                  ? "Administración verificará tus datos y aprobará tu acceso"
                  : isCedi
                    ? "Sube los documentos de tu solicitud y espera la aprobación"
                    : "Confirma tu correo y entras de una vez"}
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
                {requestedRole === "operario" ? (
                  <>
                    . Como te registraste como personal de A Tiempo, un
                    administrador revisará tus datos y activará tu acceso.
                  </>
                ) : isCedi ? (
                  <>
                    . Ahí mismo entras a subir los documentos de tu solicitud —cédula y
                    los del local—, y un administrador nacional la revisa y la aprueba.
                  </>
                ) : (
                  <>
                    {" "}
                    y entra de inmediato como{" "}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {isClient ? "Cliente e-commerce" : "Mensajero"}
                    </strong>
                    .
                  </>
                )}
              </p>
              <p className="text-[14px] text-slate-400 dark:text-slate-500">
                ¿No te llegó? Revisa la carpeta de spam.
              </p>
              <Link
                href="/login"
                className="w-full flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px]"
              >
                <span>Ir a ingresar</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Selector de rol solicitado */}
              <div>
                <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                  ¿Cómo te vas a registrar?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { value: "cliente", label: "Cliente e-commerce", icon: Store },
                      { value: "mensajero", label: "Mensajero", icon: Bike },
                      { value: "operario", label: "Personal ATL", icon: IdCard },
                      { value: "asesor", label: "Asesor comercial", icon: Headset },
                      { value: "admin_cedi", label: "CEDI afiliado", icon: Warehouse },
                    ] as { value: RequestedRole; label: string; icon: typeof Store }[]
                  ).map((opt) => {
                    const selected = requestedRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRequestedRole(opt.value)}
                        className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 border transition-all active:scale-[0.98] ${
                          selected
                            ? "border-[#ff812c] bg-[#ff812c]/10 text-[#ff812c]"
                            : "border-transparent bg-[#FFFFFF] dark:bg-[#2C2C2E] text-slate-600 dark:text-slate-300 shadow-sm"
                        }`}
                      >
                        <opt.icon className="w-6 h-6" />
                        <span className="text-[14px] font-semibold leading-tight text-center">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Datos de la persona */}
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
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
                  <label className={fieldLabel}>Teléfono</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldInput}
                    placeholder="3001234567"
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
                    placeholder="tu@empresa.co"
                  />
                </div>
                <div className={`${fieldRow} border-b-0`}>
                  <label className={fieldLabel}>Contraseña</label>
                  <input
                    type={verPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldInput}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    aria-pressed={verPassword}
                    className="shrink-0 -mr-1 w-10 h-10 inline-flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:opacity-70 transition-colors"
                  >
                    {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Datos del negocio (solo cliente e-commerce) */}
              {isClient && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                    Datos de tu negocio
                  </p>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
                    <div className={fieldRow}>
                      <label className={fieldLabel}>Tipo</label>
                      <select
                        required
                        value={businessType}
                        onChange={(e) => setBusinessType(e.target.value)}
                        className={`${fieldInput} appearance-none cursor-pointer ${
                          businessType ? "" : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {/* Corto a propósito: al lado ya está la etiqueta
                            «Tipo», y el texto largo no cabía en el desplegable
                            de un teléfono angosto. */}
                        <option value="">Selecciona…</option>
                        {BUSINESS_TYPES.map((t) => (
                          <option key={t} value={t} className="text-slate-900">
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={fieldRow}>
                      <label className={fieldLabel}>Comercio</label>
                      <input
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className={fieldInput}
                        placeholder="Razón social o marca"
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={fieldLabel}>NIT</label>
                      <input
                        value={businessNit}
                        onChange={(e) => setBusinessNit(e.target.value)}
                        className={fieldInput}
                        placeholder="123456789-0 (opcional)"
                      />
                    </div>
                    <div className={fieldRow}>
                      <label className={fieldLabel}>Dirección</label>
                      <input
                        value={businessAddress}
                        onChange={(e) => setBusinessAddress(e.target.value)}
                        className={fieldInput}
                        placeholder="Dirección del comercio (opcional)"
                      />
                    </div>
                    {/* Obligatorio aunque la dirección no lo sea: de aquí sale la
                        zona del comercio, y de la zona el precio de sus domicilios.
                        Preguntarlo ahora evita tener que perseguirlo después, con
                        guías ya cobradas a la tarifa que no era. */}
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
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Asesor comercial: para quién trabaja.
                  Se busca por nombre y no se listan todos: la lista completa de
                  comercios es información comercial de A Tiempo, y un desplegable
                  la regalaría a cualquiera que abra el registro. La búsqueda pide
                  tres letras y va con freno de solicitudes del lado del servidor. */}
              {isAsesor && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                    ¿Para qué comercio trabajas?
                  </p>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden shadow-sm transition-colors duration-300">
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
                        <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800">
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
                          <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
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

              {/* Datos del CEDI que se quiere afiliar */}
              {isCedi && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2">
                    Datos del CEDI
                  </p>
                  <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-transform text-[#1C1C1E] font-bold rounded-xl min-h-[52px] disabled:opacity-60"
              >
                {loading ? (
                  <LoaderCircle className="w-5 h-5 animate-spin text-[#1C1C1E]" />
                ) : (
                  <UserPlus className="w-5 h-5 text-[#1C1C1E]" />
                )}
                <span>Enviar solicitud</span>
              </button>

              <p className="text-center text-[15px] text-slate-500 dark:text-slate-400">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-semibold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
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
