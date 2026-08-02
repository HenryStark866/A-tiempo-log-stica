"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Printer, ScanBarcode } from "lucide-react";

/**
 * El QR de un lote de recogida.
 *
 * Para qué sirve: el mensajero llega al muelle con veinte cajas de un mismo
 * comercio. Antes el operario escaneaba veinte guías, una por una, con el
 * mensajero esperando. Con esto escanea un solo código y las veinte entran al
 * inventario del CEDI de un golpe (at_receive_pickup).
 *
 * Lleva una URL y no el token pelado, y eso es a propósito:
 *
 *  · Con pistola de código de barras da igual —teclea lo que sea en el campo
 *    enfocado— pero la pantalla del CEDI recorta el token de la URL.
 *  · Con la cámara del teléfono, en cambio, una URL abre la pantalla del CEDI
 *    con el lote ya cargado. Un token pelado no abriría nada.
 *
 * Y va por token aleatorio, no por el id de la recogida: este papel termina
 * pegado a una estiba, a la vista de quien pase por la bodega.
 */
export function RecogidaQR({
  token,
  comercio,
  paquetes,
  fecha,
  compacto = false,
}: {
  token: string;
  comercio: string;
  /** Cuántas guías trae el lote. Se imprime para cuadrar contra lo que llega. */
  paquetes?: number | null;
  fecha?: string | null;
  /** En la tarjeta del mensajero el QR va más pequeño; en el papel, grande. */
  compacto?: boolean;
}) {
  // El origin solo existe en el navegador. Hasta tenerlo no se pinta nada: un
  // QR con la URL equivocada es peor que ningún QR, porque se imprime igual.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? `${origin}/cedi?recogida=${token}` : null;
  const lado = compacto ? 116 : 168;

  return (
    <div className="flex flex-col items-center text-center">
      {/* Fondo blanco fijo, también en modo oscuro: ningún lector saca un QR
          claro sobre fondo negro, y esta pantalla se lee en un muelle. */}
      <div className="rounded-xl bg-white p-3">
        {url ? (
          <QRCode value={url} size={lado} level="M" />
        ) : (
          <div
            className="animate-pulse rounded bg-gray-100"
            style={{ width: lado, height: lado }}
          />
        )}
      </div>

      <p className="mt-3 text-[16px] font-bold text-slate-900 dark:text-white">{comercio}</p>
      <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
        {typeof paquetes === "number" ? `${paquetes} guía(s)` : "Lote de recogida"}
        {fecha ? ` · ${fecha}` : ""}
      </p>

      {/* El código escrito, debajo del QR. Si el papel se moja o el lector no
          agarra, el operario lo teclea y sigue trabajando. */}
      <p className="mt-2 font-mono text-[12px] tracking-wider text-slate-400 dark:text-slate-500 break-all">
        {token}
      </p>

      {!compacto && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] leading-snug text-slate-400 dark:text-slate-500">
          <ScanBarcode className="h-3.5 w-3.5 shrink-0" />
          Escanéalo en el CEDI para ingresar todo el lote
        </p>
      )}
    </div>
  );
}

/** Botón de imprimir. Aparte del QR porque en la tarjeta del mensajero sobra. */
export function ImprimirQR() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#ff812c] active:opacity-70"
    >
      <Printer className="h-4 w-4" /> Imprimir
    </button>
  );
}
