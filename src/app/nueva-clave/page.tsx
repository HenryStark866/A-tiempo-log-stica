"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { FondoLogin } from "@/components/fondos/FondoLogin";

/** El mismo mínimo que pide /registro: si aquí fuera otro, uno de los dos mentiría. */
const MINIMO = 8;

/**
 * /nueva-clave — poner la contraseña nueva.
 *
 * Aquí se llega solo desde el enlace del correo, que pasa antes por
 * /auth/confirmar: ese canje deja una sesión abierta, y es esa sesión la que
 * autoriza el cambio. Por eso la ruta NO está en las públicas del middleware —
 * quien caiga aquí de rebote, sin haber abierto el enlace, se va al login como
 * cualquier otra pantalla protegida. La puerta es el correo, no esta pantalla.
 *
 * Las dos casillas no son burocracia: quien acaba de perder el acceso está
 * escribiendo a ciegas en un teclado de teléfono, y una errata aquí lo deja
 * fuera otra vez, con la diferencia de que ahora ni él sabe qué escribió.
 */
export default function NuevaClavePage() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (clave.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres`);
      return;
    }
    if (clave !== confirmacion) {
      setError("Las dos contraseñas no coinciden");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: clave });
    if (error) {
      // El caso típico no es un fallo del servidor sino un enlace ya vencido:
      // sin sesión que respalde el cambio, Supabase responde que falta.
      setError(
        /session|Auth session missing/i.test(error.message)
          ? "El enlace venció o ya se usó. Pide uno nuevo desde «Recuperar acceso»."
          : error.message
      );
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 transition-colors duration-300">
      <FondoLogin />
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            Contraseña nueva
          </h1>
          <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
            Escríbela dos veces y entras de una vez
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 mt-8">
          <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
            <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
              <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">
                Nueva
              </label>
              <input
                type={verClave ? "text" : "password"}
                required
                autoFocus
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                placeholder={`Mínimo ${MINIMO} caracteres`}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? "Ocultar contraseña" : "Ver contraseña"}
                aria-pressed={verClave}
                className="shrink-0 -mr-1 w-10 h-10 inline-flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:opacity-70 transition-colors"
              >
                {verClave ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
              <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">
                Repetir
              </label>
              <input
                type={verClave ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                placeholder="La misma de arriba"
              />
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
              <KeyRound className="w-5 h-5 text-[#1C1C1E]" />
            )}
            <span>Guardar y entrar</span>
          </button>
        </form>

        <div className="mt-10 text-center">
          <Link
            href="/recuperar"
            className="inline-block px-4 py-2 text-[15px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:opacity-70"
          >
            Pedir un enlace nuevo
          </Link>
        </div>
      </div>
    </div>
  );
}
