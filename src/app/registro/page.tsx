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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo dark />
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          {done ? (
            <div className="text-center">
              <h1 className="mb-2 text-xl font-bold text-navy-900">
                ¡Cuenta creada!
              </h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Si tu proyecto exige confirmación, revisa tu correo. Luego un
                administrador de A Tiempo activará tu rol para que puedas operar.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-2.5 font-semibold text-white transition hover:bg-brand-600"
              >
                Ir a ingresar
              </Link>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-bold text-navy-900">Crear cuenta</h1>
              <p className="mb-6 text-sm text-slate-500">
                Un administrador activará tu rol después del registro
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Nombre completo
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="Nombre y apellido"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="tu@empresa.co"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
                >
                  {loading ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    <UserPlus className="size-5" />
                  )}
                  Registrarme
                </button>

                <p className="text-center text-sm text-slate-500">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/login" className="font-medium text-brand-600 hover:underline">
                    Ingresa
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
