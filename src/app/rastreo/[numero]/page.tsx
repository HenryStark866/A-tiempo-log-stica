"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Circle, LoaderCircle, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { StatusBadge } from "@/components/StatusBadge";
import { GUIDE_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { TrackingResult } from "@/lib/types";

export default function TrackingPage() {
  const { numero } = useParams<{ numero: string }>();
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("at_track_guide", { p_guide_number: decodeURIComponent(numero) })
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) {
          setNotFound(true);
          return;
        }
        setResult(data as TrackingResult);
      });
  }, [numero]);

  return (
    <div className="min-h-screen bg-navy-950">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/">
          <Logo dark />
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Ingresar
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
              <LoaderCircle className="size-6 animate-spin" />
              Consultando guía…
            </div>
          ) : notFound || !result ? (
            <div className="py-12 text-center">
              <PackageX className="mx-auto mb-4 size-12 text-slate-300" />
              <h1 className="text-lg font-bold text-navy-900">
                No encontramos esa guía
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Verifica el número (ej: ATL-100008) e inténtalo de nuevo.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-2.5 font-semibold text-white transition hover:bg-brand-600"
              >
                Volver al inicio
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Guía
                  </p>
                  <h1 className="text-2xl font-extrabold text-navy-900">
                    {result.guide_number}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Destino: {result.recipient_city} · Intentos de entrega:{" "}
                    {result.delivery_attempts}
                  </p>
                </div>
                <StatusBadge status={result.status} large />
              </div>

              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Historial de la guía
              </h2>
              <ol className="space-y-0">
                {[...result.events].reverse().map((ev, i) => (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < result.events.length - 1 && (
                      <span className="absolute left-[11px] top-6 h-full w-px bg-slate-200" />
                    )}
                    {i === 0 ? (
                      <CheckCircle2 className="relative z-10 size-6 shrink-0 text-brand-500" />
                    ) : (
                      <Circle className="relative z-10 size-6 shrink-0 fill-white text-slate-300" />
                    )}
                    <div>
                      <p className="font-semibold text-navy-900">
                        {GUIDE_STATUS_LABELS[ev.status]}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
