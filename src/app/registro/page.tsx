"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2F2F7] dark:bg-[#1C1C1E] font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 p-4 transition-colors duration-300">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6">
            <Logo />
          </div>
          {done ? (
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
              ¡Cuenta creada!
            </h1>
          ) : (
            <>
              <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
                Crear cuenta
              </h1>
              <p className="mt-2 text-[16px] text-slate-500 dark:text-slate-400">
                Un administrador activará tu rol después del registro
              </p>
            </>
          )}
        </div>

        <div className="mt-8">
          {done ? (
            <div className="text-center space-y-8">
              <p className="text-[16px] leading-relaxed text-slate-500 dark:text-slate-400">
                Si tu proyecto exige confirmación, revisa tu correo. Luego un
                administrador de A Tiempo activará tu rol para que puedas operar.
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
              <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col shadow-sm transition-colors duration-300">
                <div className="flex items-center px-4 min-h-[52px] border-b border-gray-100 dark:border-gray-800 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                  <label className="w-[100px] text-[16px] font-medium text-slate-900 dark:text-white shrink-0">Nombre</label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                    placeholder="Nombre y apellido"
                  />
                </div>
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
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                    placeholder="Mínimo 8 caracteres"
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
                  <UserPlus className="w-5 h-5 text-[#1C1C1E]" />
                )}
                <span>Registrarme</span>
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
