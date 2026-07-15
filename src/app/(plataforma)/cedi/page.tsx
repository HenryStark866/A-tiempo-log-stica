"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScanBarcode, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, Loading, Empty, Button, inputCls } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { Guide } from "@/lib/types";

export default function CediPage() {
  const [incoming, setIncoming] = useState<Guide[] | null>(null);
  const [returns, setReturns] = useState<Guide[] | null>(null);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: inc }, { data: ret }] = await Promise.all([
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name)")
        .eq("status", "recogida")
        .order("picked_up_at"),
      supabase
        .from("at_guides")
        .select("*, at_clients(business_name)")
        .eq("status", "novedad")
        .order("updated_at"),
    ]);
    setIncoming((inc as Guide[]) ?? []);
    setReturns((ret as Guide[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function receive(guideId: string, guideNumber: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("at_change_guide_status", {
      p_guide_id: guideId,
      p_new_status: "en_cedi",
      p_note: "Escaneo de recepción en bodega",
    });
    setBusy(false);
    setMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: `${guideNumber} recibida en CEDI ✓` }
    );
    load();
  }

  async function receiveByScan(e: React.FormEvent) {
    e.preventDefault();
    const num = scan.trim().toUpperCase();
    if (!num) return;
    const g = (incoming ?? []).find((x) => x.guide_number.toUpperCase() === num);
    if (!g) {
      setMsg({ ok: false, text: `La guía ${num} no está en estado "recogida"` });
      return;
    }
    setScan("");
    await receive(g.id, g.guide_number);
  }

  async function processReturn(guideId: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_process_return", {
      p_guide_id: guideId,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      const g = data as Guide;
      setMsg({
        ok: true,
        text:
          g.status === "en_devolucion"
            ? `${g.guide_number}: 2do fallo → logística inversa`
            : `${g.guide_number}: reprogramada para nuevo despacho`,
      });
    }
    load();
  }

  return (
    <>
      <PageHeader
        title="CEDI — Centro de Distribución"
        subtitle="Fase 2.1: validación de entrada a bodega · Fases 8-9: retorno de novedades"
      />

      {msg && (
        <p
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
            msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-navy-900">
            <ScanBarcode className="size-5 text-brand-500" /> Recepción en bodega
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Guías recogidas en comercio pendientes de escaneo de entrada
          </p>

          <form onSubmit={receiveByScan} className="mb-4 flex gap-2">
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Escanea o digita la guía (ATL-…)"
              className={inputCls}
            />
            <Button type="submit" disabled={busy}>
              Recibir
            </Button>
          </form>

          {incoming === null ? (
            <Loading />
          ) : incoming.length === 0 ? (
            <Empty label="No hay guías pendientes de ingreso" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {incoming.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/guias/${g.id}`} className="font-bold text-brand-600 hover:underline">
                      {g.guide_number}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {g.at_clients?.business_name} · recogida {formatDateTime(g.picked_up_at)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={busy}
                    onClick={() => receive(g.id, g.guide_number)}
                  >
                    Recibir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-navy-900">
            <Undo2 className="size-5 text-amber-500" /> Retorno de novedades
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            El sistema evalúa reintentos: 1er fallo reprograma, 2do fallo pasa a logística inversa
          </p>

          {returns === null ? (
            <Loading />
          ) : returns.length === 0 ? (
            <Empty label="No hay novedades por procesar" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {returns.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/guias/${g.id}`} className="font-bold text-brand-600 hover:underline">
                      {g.guide_number}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {g.at_clients?.business_name} · intento {g.delivery_attempts}/2
                    </p>
                    <StatusBadge status={g.status} />
                  </div>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={busy}
                    onClick={() => processReturn(g.id)}
                  >
                    Procesar retorno
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
