"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

import { FondoLogin } from "@/components/fondos/FondoLogin";
/** Mensajes de los enlaces de correo que no se pudieron canjear. */
const ERRORES_ENLACE: Record<string, string> = {
  enlace_invalido: "El enlace de confirmación no es válido. Solicita uno nuevo registrándote otra vez.",
  enlace_expirado: "El enlace de confirmación venció. Regístrate de nuevo para recibir uno nuevo.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    ERRORES_ENLACE[params.get("error") ?? ""] ?? null
  );
  const [loading, setLoading] = useState(false);
  /**
   * Ofrecer el reenvío del correo de confirmación tras fallar el acceso.
   *
   * Supabase responde «Invalid login credentials» tanto a quien se equivocó de
   * clave como a quien nunca confirmó su correo: son el mismo error, y a
   * propósito, para no revelar qué correos existen. El efecto es que quien se
   * registró y no abrió el enlace se queda golpeando una puerta sin saber por
   * qué no abre. Se le ofrece la salida sin afirmar que su cuenta exista.
   */
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  async function reenviarConfirmacion() {
    if (!email.trim()) {
      setError("Escribe tu correo arriba y vuelve a tocar aquí.");
      return;
    }
    setReenviando(true);
    setError(null);
    const supabase = createClient();
    await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmar?next=/inicio` },
    });
    setReenviando(false);
    // El mismo mensaje pase lo que pase: si el correo no existe o ya estaba
    // confirmado, decirlo sería confirmar qué cuentas hay.
    setAvisoReenvio(
      `Si ${email.trim()} tiene una cuenta sin confirmar, le acabamos de mandar el enlace. Revisa tu correo, incluida la carpeta de no deseado.`
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAvisoReenvio(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : error.message
      );
      setLoading(false);
      // Llamada aparte y sin esperar: el intento de login ya falló y no tiene
      // sesión, así que esta es una transacción nueva e independiente — no se
      // pierde aunque la de arriba haya fallado. Si el registro mismo falla,
      // que no le arruine la pantalla a quien solo se equivocó de clave.
      supabase
        .rpc("at_log_security_event", {
          p_event_type: "login_fallido",
          p_severity: "info",
          p_detail: { email },
          p_path: "/login",
          p_user_agent: navigator.userAgent,
        })
        .then(() => {});
      return;
    }
    router.push(params.get("next") ?? "/inicio");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-8">
      <div className="atl-superficie rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
        <div className="flex items-center px-4 min-h-[52px] border-b border-slate-900/[0.06] dark:border-white/[0.08] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
          <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
            placeholder="tu@empresa.co"
          />
        </div>
        <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
          <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">Contraseña</label>
          <input
            type={verPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
            placeholder="••••••••"
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

      {error && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 p-4">
          <p className="text-[14px] text-rose-600 dark:text-rose-400 text-center font-medium">
            {error}
          </p>
          {/* La otra razón de este error, y la que nadie adivina: la cuenta
              existe pero el correo nunca se confirmó. */}
          <p className="mt-3 text-center text-[13px] leading-snug text-rose-600/90 dark:text-rose-400/90">
            ¿Te registraste y nunca confirmaste el correo?{" "}
            <button
              type="button"
              onClick={reenviarConfirmacion}
              disabled={reenviando}
              className="font-bold underline disabled:opacity-60"
            >
              {reenviando ? "Enviando…" : "Reenviar el enlace"}
            </button>
          </p>
        </div>
      )}

      {avisoReenvio && (
        <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="text-[14px] leading-snug text-emerald-700 dark:text-emerald-400">
            {avisoReenvio}
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
          <LogIn className="w-5 h-5 text-[#1C1C1E]" />
        )}
        <span>Ingresar</span>
      </button>

      {/* Va debajo del botón y no al lado del campo: quien entra bien no
          necesita verlo, y quien falló ya tiene el error justo encima. */}
      <p className="text-center text-[15px] text-slate-500 dark:text-slate-400">
        <Link
          href="/recuperar"
          className="font-semibold text-[#ff812c] hover:underline active:opacity-70 transition-opacity"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <p className="text-center text-[15px] text-slate-500 dark:text-slate-400">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-[#ff812c] hover:underline active:opacity-70 transition-opacity">
          Regístrate
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 transition-colors duration-300">
      <FondoLogin />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Bienvenido</h1>
          <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
            Ingresa a la plataforma operativa
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <div className="mt-10 text-center">
          <Link href="/" className="inline-block px-4 py-2 text-[15px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:opacity-70">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
