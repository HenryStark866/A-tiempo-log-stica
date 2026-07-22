"use client";

import { useState, useMemo } from "react";
import { Camera, ChevronLeft, CreditCard, Banknote, Package, MapPin, User, Phone, Info } from "lucide-react";
import Link from "next/link";

export default function NuevaSolicitudPage() {
  const [paymentMethod, setPaymentMethod] = useState<"wompi" | "cash">("wompi");

  // Package dimensions and weight
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const volumetricWeight = useMemo(() => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const vol = (l * w * h) / 5000;
    return vol > 0 ? vol.toFixed(2) : "0.00";
  }, [length, width, height]);

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] pb-28 font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60 transition-colors duration-300">
        <div className="flex items-center justify-between px-4 h-12">
          <Link href="#" className="flex items-center text-[#ff812c] active:opacity-70 transition-opacity">
            <ChevronLeft className="w-6 h-6 -ml-2" />
            <span className="text-[17px]">Atrás</span>
          </Link>
          <h1 className="text-[17px] font-semibold tracking-tight absolute left-1/2 -translate-x-1/2 text-slate-900 dark:text-white">Nueva Solicitud</h1>
          <div className="w-[70px]"></div> {/* Placeholder for balance alignment */}
        </div>
      </div>

      <div className="p-4 pt-6 space-y-6">
        <h2 className="text-[34px] font-bold tracking-tight text-slate-900 dark:text-white">Nuevo Envío</h2>

        <form className="space-y-6">

          {/* Destinatario Section */}
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Destinatario</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden flex flex-col transition-colors duration-300">
              <div className="flex items-center px-4 min-h-[48px] border-b border-gray-100 dark:border-gray-800 last:border-0 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <User className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  type="text"
                  placeholder="Nombre completo"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center px-4 min-h-[48px] border-b border-gray-100 dark:border-gray-800 last:border-0 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <Phone className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  type="tel"
                  placeholder="Teléfono"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center px-4 min-h-[48px] border-b border-gray-100 dark:border-gray-800 last:border-0 focus-within:bg-gray-50/50 dark:focus-within:bg-gray-800/50 transition-colors">
                <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-4 shrink-0" />
                <input
                  type="text"
                  placeholder="Dirección de entrega"
                  className="flex-1 bg-transparent text-[17px] py-3 focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </section>

          {/* Detalles del Paquete Section */}
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Detalles del Paquete</h3>
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl overflow-hidden p-4 space-y-4 transition-colors duration-300">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 flex flex-col">
                  <label className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Peso (kg)</label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-4 text-[17px] focus:outline-none min-h-[48px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors duration-300"
                    placeholder="0.0"
                  />
                </div>
                <div className="flex-[2] flex items-center justify-between gap-2">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">L (cm)</label>
                    <input
                      type="number"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-2 text-[17px] focus:outline-none min-h-[48px] text-center text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors duration-300"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">A (cm)</label>
                    <input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-2 text-[17px] focus:outline-none min-h-[48px] text-center text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors duration-300"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Al (cm)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl px-2 text-[17px] focus:outline-none min-h-[48px] text-center text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-colors duration-300"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-xl p-4 transition-colors duration-300">
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  <Info className="w-5 h-5 mr-3 text-slate-400 dark:text-slate-500" />
                  <span className="text-[15px]">Peso Volumétrico</span>
                </div>
                <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] px-3 py-1.5 rounded-lg shadow-sm transition-colors duration-300">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-white">{volumetricWeight} kg</span>
                </div>
              </div>

              <button
                type="button"
                className="w-full flex items-center justify-center space-x-2 bg-[#F2F2F7] dark:bg-[#1C1C1E] active:bg-gray-200 dark:active:bg-gray-700 transition-colors text-[#ff812c] font-medium rounded-xl min-h-[48px]"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[17px]">Añadir Foto</span>
              </button>
            </div>
          </section>

          {/* Payment Method Section */}
          <section>
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-4 mb-2">Método de Pago</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod("wompi")}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-[120px] ${paymentMethod === "wompi"
                  ? "border-[#ff812c] bg-[#ff812c]/10 dark:bg-[#ff812c]/20"
                  : "border-transparent bg-[#FFFFFF] dark:bg-[#2C2C2E] shadow-sm active:scale-95"
                  }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors duration-300 ${paymentMethod === "wompi" ? "bg-[#ff812c] text-[#1C1C1E]" : "bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-400 dark:text-slate-500"
                  }`}>
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className={`text-[15px] font-semibold transition-colors duration-300 ${paymentMethod === "wompi" ? "text-[#ff812c]" : "text-slate-900 dark:text-white"}`}>
                  En línea
                </span>
                <span className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Wompi</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-[120px] ${paymentMethod === "cash"
                  ? "border-[#ff812c] bg-[#ff812c]/10 dark:bg-[#ff812c]/20"
                  : "border-transparent bg-[#FFFFFF] dark:bg-[#2C2C2E] shadow-sm active:scale-95"
                  }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors duration-300 ${paymentMethod === "cash" ? "bg-[#ff812c] text-[#1C1C1E]" : "bg-[#F2F2F7] dark:bg-[#1C1C1E] text-slate-400 dark:text-slate-500"
                  }`}>
                  <Banknote className="w-5 h-5" />
                </div>
                <span className={`text-[15px] font-semibold transition-colors duration-300 ${paymentMethod === "cash" ? "text-[#ff812c]" : "text-slate-900 dark:text-white"}`}>
                  Efectivo
                </span>
                <span className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Al recibir</span>
              </button>
            </div>
          </section>

        </form>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-t border-gray-200/60 dark:border-gray-800/60 pb-8 z-20 transition-colors duration-300">
        <button
          className="w-full min-h-[52px] rounded-xl flex items-center justify-center space-x-2 text-[17px] font-bold text-[#1C1C1E] shadow-sm transition-transform active:scale-[0.98] bg-[#ff812c] hover:bg-[#ff812c]/90"
        >
          {paymentMethod === "wompi" ? (
            <>
              <CreditCard className="w-5 h-5 text-[#1C1C1E]" />
              <span>Pagar y Crear Solicitud</span>
            </>
          ) : (
            <>
              <Package className="w-5 h-5 text-[#1C1C1E]" />
              <span>Crear Solicitud</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
