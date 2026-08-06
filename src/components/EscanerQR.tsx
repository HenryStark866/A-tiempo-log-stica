"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";

/**
 * Escáner de QR por cámara.
 *
 * Hasta ahora la única forma de "escanear" era con una pistola de código de
 * barras (que teclea en el campo de texto) o saliendo de la app al lector
 * nativo del teléfono. Esto decodifica en el propio navegador con jsQR —el
 * frame de video nunca sale del teléfono, no hay subida a ningún servidor— y
 * entrega el texto exactamente como si se hubiera tecleado.
 */
export function EscanerQR({
  onScan,
  onClose,
}: {
  onScan: (texto: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    function escanear() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameRef.current = requestAnimationFrame(escanear);
        return;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        frameRef.current = requestAnimationFrame(escanear);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const codigo = jsQR(imagen.data, imagen.width, imagen.height, {
        inversionAttempts: "dontInvert",
      });
      if (codigo?.data) {
        onScan(codigo.data);
        return; // onScan cierra el escáner; no hace falta pedir más frames.
      }
      frameRef.current = requestAnimationFrame(escanear);
    }

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no puede usar la cámara. Escribe el código a mano.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        escanear();
      } catch {
        if (!cancelado) {
          setError("No se pudo acceder a la cámara. Revisa el permiso o escribe el código a mano.");
        }
      }
    }

    iniciar();
    return () => {
      cancelado = true;
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
        <p className="text-[15px] font-semibold text-white">Escanear QR</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white active:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* Marco guía: no decodifica nada por sí solo, solo le dice al ojo
            dónde apuntar. jsQR lee el cuadro entero, no solo lo que hay
            dentro del marco. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-56 w-56 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-6 rounded-xl bg-rose-600 px-4 py-3 text-center text-[13px] font-medium text-white">
            {error}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
