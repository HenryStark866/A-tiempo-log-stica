"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Banknote, Check, Copy, ExternalLink, LoaderCircle, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DemasiadasSolicitudes } from "@/components/DemasiadasSolicitudes";
import { Logo } from "@/components/Logo";
import { PAYMENT_KIND_LABELS } from "@/lib/constants";
import { formatCOP, esDemasiadasSolicitudes } from "@/lib/utils";
import type { PaymentInfo } from "@/lib/types";

import { FondoPago } from "@/components/fondos/FondoPago";
/**
 * Página pública del QR de pago. La abre quien recibe el paquete, sin cuenta y
 * casi siempre desde el celular en la puerta, así que muestra lo mínimo:
 * cuánto se paga y por dónde.
 */
export default function PagarPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [frenado, setFrenado] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("at_payment_info", { p_token: decodeURIComponent(token) })
      .then(({ data, error }) => {
        setLoading(false);
        // Ir muy rápido no es que el enlace de pago sea inválido: decírselo
        // a alguien que está por pagar lo hace desconfiar del cobro entero.
        if (esDemasiadasSolicitudes(error)) {
          setFrenado(true);
          return;
        }
        if (error || !data) {
          setNoExiste(true);
          return;
        }
        setInfo(data as PaymentInfo);
      });
  }, [token]);

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300 pb-12">
      <FondoPago />
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-slate-900/[0.06] dark:border-white/[0.08] transition-colors duration-300">
        <div className="mx-auto max-w-md flex items-center justify-between px-4 h-14">
          <Link href="/" className="active:opacity-70 transition-opacity">
            <Logo />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <LoaderCircle className="w-7 h-7 animate-spin text-[#ff812c]" />
          </div>
        ) : frenado ? (
          <DemasiadasSolicitudes onReintentar={() => window.location.reload()} />
        ) : noExiste || !info ? (
          <div className="text-center py-16">
            <PackageX className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
            <h1 className="mt-4 text-[22px] font-bold">Enlace no válido</h1>
            <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
              Este código de pago no corresponde a ningún pedido. Verifica con
              quien te entregó el paquete.
            </p>
          </div>
        ) : (
          <Contenido info={info} />
        )}
      </div>
    </div>
  );
}

function Contenido({ info }: { info: PaymentInfo }) {
  if (!info.is_cod) {
    return (
      <div className="text-center py-16">
        <Check className="w-12 h-12 mx-auto text-emerald-500" />
        <h1 className="mt-4 text-[22px] font-bold">Sin pago pendiente</h1>
        <p className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
          El pedido <strong>{info.guide_number}</strong> no tiene recaudo
          contraentrega. No tienes que pagar nada al recibir.
        </p>
      </div>
    );
  }

  const yaEntregada = info.status === "entregada";

  return (
    <>
      <div className="text-center">
        <p className="text-[15px] text-slate-500 dark:text-slate-400">
          Pago a <strong className="text-slate-700 dark:text-slate-300">{info.business_name}</strong>
        </p>
        <p className="mt-3 text-[32px] sm:text-[40px] font-bold tracking-tight leading-none tabular-nums break-words">
          {formatCOP(info.cod_amount)}
        </p>
        <p className="mt-2 text-[14px] text-slate-400 dark:text-slate-500">
          Pedido {info.guide_number} · {info.recipient_name}
        </p>

        {yaEntregada && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" /> Este pedido ya figura como entregado
          </div>
        )}
      </div>

      {info.methods.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-amber-50 dark:bg-amber-500/10 p-5 text-center">
          <p className="text-[15px] leading-relaxed text-amber-700 dark:text-amber-400">
            El comercio todavía no publicó sus medios de pago. Paga en efectivo
            al mensajero y pide tu comprobante.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-8 mb-2 ml-1 text-[13px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Cómo pagar
          </p>
          <ul className="atl-superficie rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
            {info.methods.map((m, i) => (
              <MedioDePago key={`${m.kind}-${i}`} metodo={m} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-center text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
        Guarda tu comprobante. Ante cualquier duda sobre el cobro, comunícate
        directamente con {info.business_name}.
      </p>
    </>
  );
}

function MedioDePago({ metodo }: { metodo: PaymentInfo["methods"][number] }) {
  const [copiado, setCopiado] = useState(false);
  const esLink = metodo.kind === "link" && metodo.identifier;

  async function copiar() {
    if (!metodo.identifier) return;
    try {
      await navigator.clipboard.writeText(metodo.identifier);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el dato igual está a la vista.
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 shrink-0 rounded-full bg-[#ff812c]/10 inline-flex items-center justify-center">
          <Banknote className="w-[18px] h-[18px] text-[#ff812c]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            {PAYMENT_KIND_LABELS[metodo.kind] ?? metodo.kind}
          </p>

          {metodo.identifier && (
            esLink ? (
              <a
                href={metodo.identifier}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#ff812c] break-all active:opacity-70"
              >
                Abrir link de pago <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            ) : (
              <p className="mt-0.5 text-[17px] font-bold tracking-tight text-slate-900 dark:text-white break-all">
                {metodo.identifier}
              </p>
            )
          )}

          {metodo.holder && (
            <p className="mt-0.5 text-[14px] text-slate-500 dark:text-slate-400">
              A nombre de {metodo.holder}
            </p>
          )}
          {metodo.instructions && (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">
              {metodo.instructions}
            </p>
          )}
        </div>

        {metodo.identifier && !esLink && (
          <button
            type="button"
            onClick={copiar}
            aria-label={`Copiar ${PAYMENT_KIND_LABELS[metodo.kind] ?? metodo.kind}`}
            className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 active:opacity-70 transition-colors"
          >
            {copiado ? (
              <Check className="w-[18px] h-[18px] text-emerald-500" />
            ) : (
              <Copy className="w-[18px] h-[18px]" />
            )}
          </button>
        )}
      </div>
    </li>
  );
}
