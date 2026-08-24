"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Empty, PageHeader, Card } from "@/components/ui";
import { cn, formatCOP } from "@/lib/utils";
import type { LabelData } from "@/lib/types";

/**
 * Milisegundos entre marcar qué rótulo se va a imprimir y abrir el diálogo.
 *
 * window.print() congela la pestaña y fotografía el DOM tal como esté en ese
 * instante. Si se llama en el mismo turno en que se cambia el estado, React
 * todavía no ha pintado el `print:hidden` sobre los demás rótulos y salen
 * todos. Un turno del reloj alcanza; 50 ms deja margen en equipos lentos sin
 * que el usuario perciba demora.
 */
const RETARDO_DE_PINTADO = 50;

/**
 * `tracking_token` es una tira de 24 caracteres hex sin separadores: fácil de
 * generar, imposible de copiar bien a mano. Se agrupa de a 4 solo para
 * imprimirlo — el valor que viaja en el QR y en la URL no cambia.
 */
function agruparCodigo(token: string): string {
  return token.match(/.{1,4}/g)?.join(" ") ?? token;
}

export default function LabelsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Labels />
    </Suspense>
  );
}

function Labels() {
  const params = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const [rows, setRows] = useState<LabelData[] | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Qué rótulo se está imprimiendo solo. En `null` se imprime la hoja entera,
   * que es el comportamiento de siempre del botón naranja.
   */
  const [printingId, setPrintingId] = useState<string | null>(null);

  // El QR lleva una URL absoluta, y el origin solo existe en el navegador.
  useEffect(() => setOrigin(window.location.origin), []);

  // El navegador avisa cuando el diálogo se cerró —se haya impreso o
  // cancelado— y esa es la señal buena para volver a habilitar la hoja
  // completa. No sirve limpiar justo después de window.print(): en escritorio
  // la llamada bloquea, pero en móvil devuelve enseguida y se alcanzaría a
  // reaparecer el resto de rótulos antes de la foto.
  useEffect(() => {
    const alTerminar = () => setPrintingId(null);
    window.addEventListener("afterprint", alTerminar);
    return () => window.removeEventListener("afterprint", alTerminar);
  }, []);

  /** Imprime un solo rótulo: el resto se esconde apenas para el papel. */
  const imprimirUno = useCallback((id: string) => {
    setPrintingId(id);
    setTimeout(() => window.print(), RETARDO_DE_PINTADO);
  }, []);

  /**
   * Imprime todos. Limpia `printingId` antes por si un navegador se quedó sin
   * disparar `afterprint`: si no, el botón naranja sacaría un solo rótulo y
   * nadie entendería por qué.
   */
  const imprimirTodos = useCallback(() => {
    setPrintingId(null);
    setTimeout(() => window.print(), RETARDO_DE_PINTADO);
  }, []);

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase.rpc("at_label_data", { p_ids: ids });
    if (error) setError(error.message);
    setRows((data as LabelData[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (!rows) return <Loading />;

  if (error) {
    return (
      <>
        <PageHeader title="Rótulos" />
        <Card>
          <p className="p-6 text-center text-rose-600">{error}</p>
        </Card>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Rótulos" />
        <Empty label="No hay pedidos para imprimir. Selecciona pedidos desde la lista." />
      </>
    );
  }

  return (
    <div className="rotulos">
      {/* Barra que no se imprime */}
      <div className="print:hidden mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-slate-900 dark:text-white">
            {rows.length} rótulo{rows.length > 1 ? "s" : ""} listo{rows.length > 1 ? "s" : ""}
          </h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            Imprime, recorta y pega cada uno en su paquete con los datos hacia afuera.
          </p>
        </div>
        <button
          onClick={imprimirTodos}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#ff812c] px-5 font-bold text-[#1C1C1E] active:scale-[0.98]"
        >
          <Printer className="size-5" /> Imprimir
        </button>
      </div>

      <div className="space-y-4 print:space-y-0">
        {rows.map((g) => (
          <Rotulo
            key={g.id}
            g={g}
            origin={origin}
            // Solo para el papel: en pantalla la hoja no se mueve, así que
            // apretar el botón de un rótulo no hace saltar la página.
            oculto={printingId !== null && printingId !== g.id}
            aislado={printingId === g.id}
            onImprimir={imprimirUno}
          />
        ))}
      </div>

      {/* Una etiqueta por página y sin adornos del navegador: lo que se pega a
          la caja tiene que quedar legible, no bonito en pantalla. */}
      <style jsx global>{`
        @media print {
          @page {
            size: A5;
            margin: 8mm;
          }
          body {
            background: #fff !important;
          }
          nav,
          header,
          aside,
          footer {
            display: none !important;
          }
          .rotulo {
            break-inside: avoid;
            page-break-after: always;
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            color: #000 !important;
            background: #fff !important;
          }
          .rotulo:last-child {
            page-break-after: auto;
          }
          /* Al imprimir uno solo, los demás quedan en display:none pero siguen
             en el DOM, así que :last-child puede caerle a un rótulo escondido
             y el que sí se imprime arrastraría su salto de página: sale una
             hoja en blanco detrás. Este es el que manda mientras dure la
             impresión individual. */
          .rotulo-aislado {
            page-break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

function Rotulo({
  g,
  origin,
  oculto,
  aislado,
  onImprimir,
}: {
  g: LabelData;
  origin: string | null;
  /** Se está imprimiendo otro rótulo: este no debe salir en el papel. */
  oculto: boolean;
  /** Este es el rótulo que se está imprimiendo solo. */
  aislado: boolean;
  onImprimir: (id: string) => void;
}) {
  const urlRastreo = origin ? `${origin}/rastreo/t/${g.tracking_token}` : null;
  const urlPago = origin ? `${origin}/pagar/${g.payment_token}` : null;

  return (
    <div
      className={cn(
        "rotulo rounded-2xl border border-slate-300 bg-white p-5 text-black",
        oculto && "print:hidden",
        aislado && "rotulo-aislado"
      )}
    >
      {/* Cabecera: remitente y número de pedido grande, que es lo que el
          mensajero canta al chequear contra su lista. */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* La marca del comercio, pegada a la caja.
              El rótulo es lo único del envío que el comprador ve antes de
              abrirla: si el paquete llega con el logo de la tienda a la que le
              compró, sabe de quién es sin leer nada.
              `crossOrigin` no hace falta —el bucket es público— pero
              print-color-adjust sí: sin eso el navegador imprime las imágenes
              con los colores lavados o directamente en blanco. */}
          {g.business_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={g.business_logo}
              alt={g.business_name}
              className="h-12 w-12 shrink-0 rounded-lg object-contain"
              style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
            />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              A Tiempo Logística · Remite
            </p>
            <p className="truncate text-[15px] font-bold">{g.business_name}</p>
            {g.business_phone && <p className="text-[12px] text-slate-600">{g.business_phone}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pedido</p>
            <p className="text-[22px] font-extrabold leading-none tracking-tight">{g.guide_number}</p>
            {g.zone_name && <p className="mt-1 text-[12px] font-semibold">{g.zone_name}</p>}
            {g.advisor_name && (
              <p className="mt-1 text-[11px] text-slate-600">Atendido por {g.advisor_name}</p>
            )}
          </div>

          {/* Reimprimir un rótulo suelto. Va discreto —sin fondo ni borde
              hasta que se pasa el cursor— porque el protagonista de la tarjeta
              es el número de pedido, no un control. Desaparece en el papel: no
              tendría sentido pegarle a la caja un botón de imprimir. */}
          <button
            type="button"
            onClick={() => onImprimir(g.id)}
            title={`Imprimir solo el pedido ${g.guide_number}`}
            aria-label={`Imprimir solo el pedido ${g.guide_number}`}
            className="print:hidden -mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff812c] active:scale-90"
          >
            <Printer className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Destinatario
          </p>
          <p className="text-[19px] font-bold leading-tight">{g.recipient_name}</p>
          <p className="mt-1 text-[15px] leading-snug">{g.recipient_address}</p>
          <p className="text-[15px] font-semibold">{g.recipient_city}</p>
          {g.recipient_phone && <p className="mt-1 text-[15px]">Tel: {g.recipient_phone}</p>}

          {g.notes && (
            <p className="mt-2 border-l-2 border-slate-400 pl-2 text-[12px] italic leading-snug text-slate-700">
              {g.notes}
            </p>
          )}
        </div>

        <div className="shrink-0 text-center">
          <div className="bg-white">
            {urlRastreo ? (
              <QRCode value={urlRastreo} size={104} level="M" />
            ) : (
              <div className="h-[104px] w-[104px] animate-pulse rounded bg-slate-100" />
            )}
          </div>
          <p className="mt-1 w-[104px] text-[9px] leading-tight text-slate-600">
            Escanea para ver dónde va tu pedido
          </p>
          {/* Mismo destino que el QR, en texto: si el paquete llegó rayado o el
              teléfono no enfoca, este código tecleado a mano en /rastreo/t/
              lleva al mismo seguimiento en vivo. Agrupado de a 4 para que
              copiarlo o dictarlo por teléfono no pierda un carácter. */}
          <p className="mt-1.5 w-[104px] text-[8px] uppercase leading-tight text-slate-400">
            O escribe el código
          </p>
          <p className="w-[104px] break-all font-mono text-[9px] font-semibold tracking-tight text-slate-600">
            {agruparCodigo(g.tracking_token)}
          </p>
        </div>
      </div>

      {/* El recaudo va destacado abajo: es el dato que decide si el mensajero
          cobra o no, y equivocarse ahí cuesta plata. */}
      <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-black pt-3">
        {g.is_cod ? (
          <>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Cobrar al entregar
              </p>
              <p className="text-[24px] font-extrabold leading-none">{formatCOP(g.cod_amount)}</p>
            </div>
            <div className="shrink-0 text-center">
              <div className="bg-white">
                {urlPago ? (
                  <QRCode value={urlPago} size={72} level="M" />
                ) : (
                  <div className="h-[72px] w-[72px] animate-pulse rounded bg-slate-100" />
                )}
              </div>
              <p className="mt-1 w-[72px] text-[9px] leading-tight text-slate-600">Pagar aquí</p>
            </div>
          </>
        ) : (
          <p className="text-[15px] font-bold">SIN RECAUDO · Pedido ya pagado</p>
        )}
      </div>
    </div>
  );
}
