"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Printer, QrCode, Wallet } from "lucide-react";
import { formatCOP } from "@/lib/utils";

/**
 * Los dos QR de una guía.
 *
 * Ambos llevan una URL, no los datos crudos: así el código queda corto (se lee
 * bien impreso y en pantalla de celular) y lo que se ve al escanear está
 * siempre al día, aunque el rótulo se haya impreso hace días.
 *
 * - Rastreo: página pública de seguimiento, para destinatario, mensajero y CEDI.
 * - Pago: página pública con lo que se recauda y por dónde pagarle al comercio.
 *   Usa el token aleatorio de la guía, no el número consecutivo.
 */
export function GuiaQR({
  guideNumber,
  paymentToken,
  isCod,
  codAmount,
}: {
  guideNumber: string;
  paymentToken: string;
  isCod: boolean;
  codAmount: number;
}) {
  // El origin solo existe en el navegador; hasta entonces no se pinta el QR
  // para no generar uno con una URL equivocada.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const urlRastreo = origin ? `${origin}/rastreo/${guideNumber}` : null;
  const urlPago = origin ? `${origin}/pagar/${paymentToken}` : null;

  return (
    <section className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm p-5 print:shadow-none print:border print:border-gray-300">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-slate-900 dark:text-white">Códigos QR</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#ff812c] active:opacity-70"
        >
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QRTarjeta
          icon={QrCode}
          titulo="Rastreo y chequeo"
          detalle={guideNumber}
          pie="Estado, historial y datos del envío"
          url={urlRastreo}
        />
        <QRTarjeta
          icon={Wallet}
          titulo="Pago"
          detalle={isCod ? formatCOP(codAmount) : "Sin recaudo"}
          pie={isCod ? "Medios de pago del comercio" : "Esta guía no recauda contraentrega"}
          url={urlPago}
          atenuado={!isCod}
        />
      </div>
    </section>
  );
}

function QRTarjeta({
  icon: Icon,
  titulo,
  detalle,
  pie,
  url,
  atenuado = false,
}: {
  icon: typeof QrCode;
  titulo: string;
  detalle: string;
  pie: string;
  url: string | null;
  atenuado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col items-center text-center ${
        atenuado ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" />
        {titulo}
      </div>

      {/* Fondo blanco fijo: un QR sobre fondo oscuro no lo lee ningún lector. */}
      <div className="mt-3 bg-white p-3 rounded-lg">
        {url ? (
          <QRCode value={url} size={132} level="M" />
        ) : (
          <div className="w-[132px] h-[132px] animate-pulse bg-gray-100 rounded" />
        )}
      </div>

      <p className="mt-3 text-[16px] font-bold text-slate-900 dark:text-white">{detalle}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-slate-400 dark:text-slate-500">{pie}</p>
    </div>
  );
}
