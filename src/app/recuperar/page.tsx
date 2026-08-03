"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, MailCheck, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { FondoLogin } from "@/components/fondos/FondoLogin";

/**
 * /recuperar — pedir el enlace para volver a entrar.
 *
 * Hasta ahora no existía: quien olvidaba la contraseña quedaba fuera y la
 * única salida era que un administrador se la cambiara a mano desde el panel
 * de Supabase. Para un mensajero que trabaja en la calle con el teléfono, eso
 * es perder el turno.
 *
 * El enlace del correo no lleva a esta pantalla sino a /auth/confirmar, que ya
 * sabe canjear las dos formas en que Supabase puede mandarlo (`token_hash` de
 * nuestra plantilla y `code` del flujo PKCE de fábrica) y de ahí reenvía a
 * /nueva-clave. Así este flujo no estrena camino propio: reusa el que ya
 * funciona para la confirmación de cuenta.
 *
 * ── Por qué el mensaje de éxito no confirma nada ─────────────────────────
 *
 * Diga lo que diga el resultado, la respuesta es la misma: «si ese correo
 * tiene cuenta, ya salió el enlace». Si dijéramos «no encontramos ese correo»,
 * cualquiera podría probar direcciones una por una y averiguar quién trabaja
 * aquí. Supabase tampoco lo distingue en su respuesta, y está bien así.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // El origen se toma del navegador y no de una variable de entorno: así
      // funciona igual en local, en las vistas previas de Vercel y en
      // producción, sin tener que acordarse de cambiarlo.
      redirectTo: `${window.location.origin}/auth/confirmar?next=/nueva-clave`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnviado(true);
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
            {enviado ? "Revisa tu correo" : "Recuperar acceso"}
          </h1>
          <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
            {enviado
              ? "Si ese correo tiene una cuenta, ya salió el enlace para poner una contraseña nueva"
              : "Te enviamos un enlace para poner una contraseña nueva"}
          </p>
        </div>

        {enviado ? (
          <div className="mt-8 rounded-2xl bg-[#FFFFFF] dark:bg-[#2C2C2E] p-8 text-center shadow-sm transition-colors duration-300">
            <MailCheck className="mx-auto mb-4 w-12 h-12 text-[#ff812c]" />
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              Abre el enlace desde este mismo teléfono o computador. Si no llega
              en unos minutos, mira en la carpeta de correo no deseado.
            </p>
            <button
              type="button"
              onClick={() => setEnviado(false)}
              className="mt-6 text-[15px] font-semibold text-[#ff812c] hover:underline active:opacity-70"
            >
              Usar otro correo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 mt-8">
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
              <div className="flex items-center px-4 min-h-[52px] focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">
                  Correo
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                  placeholder="tu@empresa.co"
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
                <Send className="w-5 h-5 text-[#1C1C1E]" />
              )}
              <span>Enviar enlace</span>
            </button>
          </form>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/login"
            className="inline-block px-4 py-2 text-[15px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:opacity-70"
          >
            ← Volver a ingresar
          </Link>
        </div>
      </div>
    </div>
  );
}
