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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
        <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
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
