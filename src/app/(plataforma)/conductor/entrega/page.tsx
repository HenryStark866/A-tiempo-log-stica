"use client";

import { useState, useRef } from "react";
import { MessageCircle, MoreHorizontal, ChevronLeft, Package, User, Navigation2, Check } from "lucide-react";
import Link from "next/link";

export default function EntregaActivaPage() {
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isConfirmed) return;
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !trackRef.current || isConfirmed) return;

    const rect = trackRef.current.getBoundingClientRect();
    const handleWidth = 56; // Approx width of the handle button
    const maxTravel = rect.width - handleWidth - 8; // 8px for inner padding

    // Calculate position relative to the track
    let newX = e.clientX - rect.left - (handleWidth / 2);

    // Clamp values
    if (newX < 4) newX = 4;
    if (newX > maxTravel + 4) newX = maxTravel + 4;

    const progress = ((newX - 4) / maxTravel) * 100;
    setSwipeProgress(progress);

    if (progress > 95) {
      setIsConfirmed(true);
      setSwipeProgress(100);
      setIsDragging(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!isConfirmed) {
      // Animate back to 0
      setSwipeProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] pb-32 font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300">

      {/* Navigation Bar */}
      <div className="sticky top-0 z-10 bg-[#F2F2F7]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60 transition-colors duration-300">
        <div className="relative flex items-center justify-between px-4 h-12">
          <Link href="#" className="flex items-center text-[#ff812c] active:opacity-70 transition-opacity">
            <ChevronLeft className="w-6 h-6 -ml-2" />
            <span className="text-[17px]">Ruta</span>
          </Link>
          <h1 className="text-[17px] font-semibold tracking-tight absolute left-1/2 -translate-x-1/2 text-slate-900 dark:text-white">
            Entrega Activa
          </h1>
          <button className="w-10 h-10 flex items-center justify-end text-slate-500 dark:text-slate-400 active:opacity-70 transition-opacity">
            <MoreHorizontal className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">

        {/* Destination Header */}
        <div>
          <h2 className="text-[32px] font-bold tracking-tight mb-1 leading-tight text-slate-900 dark:text-white">
            Cra. 43A #1-50
          </h2>
          <p className="text-[17px] text-slate-500 dark:text-slate-400 font-medium">
            Edificio San Fernando Plaza, Torre 2, Of. 401
          </p>
        </div>

        {/* Map Placeholder */}
        <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl h-32 overflow-hidden relative shadow-sm flex items-center justify-center transition-colors duration-300">
          <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
          <div className="z-10 flex flex-col items-center gap-2">
            <div className="bg-[#ff812c] text-[#1C1C1E] p-2.5 rounded-full shadow-md">
              <Navigation2 className="w-5 h-5" />
            </div>
            <span className="text-[14px] font-semibold text-[#ff812c]">A 1.2 km · 5 min</span>
          </div>
        </div>

        {/* Package Info Card */}
        <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl shadow-sm overflow-hidden transition-colors duration-300">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center transition-colors">
            <h3 className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Info del Paquete</h3>
            <span className="text-[13px] font-bold text-slate-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
              #ATL-9023
            </span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <div className="flex items-center px-4 min-h-[56px] gap-4">
              <div className="w-9 h-9 rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] flex items-center justify-center shrink-0 transition-colors">
                <User className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-slate-900 dark:text-white">Carlos Restrepo</p>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">Cliente final</p>
              </div>
            </div>

            <div className="flex items-center px-4 min-h-[56px] gap-4">
              <div className="w-9 h-9 rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] flex items-center justify-center shrink-0 transition-colors">
                <Package className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-slate-900 dark:text-white">Caja pequeña (1.5 kg)</p>
                <p className="text-[14px] text-slate-500 dark:text-slate-400">Contiene electrónicos · Frágil</p>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Action */}
        <button className="w-full min-h-[56px] bg-[#E8F9EE] dark:bg-[#1C7F45]/20 hover:bg-[#D1F3DF] dark:hover:bg-[#1C7F45]/30 active:scale-[0.98] transition-all rounded-2xl flex items-center justify-center space-x-3 text-[#1C7F45] dark:text-[#34C759] border border-[#25D366]/20 shadow-sm">
          <MessageCircle className="w-6 h-6 fill-[#25D366] text-[#25D366]" />
          <span className="text-[17px] font-semibold tracking-tight">Coordinar vía WhatsApp</span>
        </button>

      </div>

      {/* Swipe to Confirm CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#F2F2F7] dark:from-[#1C1C1E] via-[#F2F2F7]/90 dark:via-[#1C1C1E]/90 to-transparent pb-10 pt-14 z-20 transition-colors duration-300">
        <div
          ref={trackRef}
          className={`relative h-[64px] rounded-full flex items-center p-1 shadow-sm overflow-hidden transition-colors duration-300 ${isConfirmed ? "bg-[#34C759]" : "bg-[#1C1C1E] dark:bg-[#ff812c]/20 dark:border dark:border-[#ff812c]/30"
            }`}
        >
          {/* Background Text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className={`text-[17px] font-semibold tracking-wide transition-opacity duration-300 text-white/60 dark:text-white/50 ${isConfirmed ? "opacity-0" : "opacity-100"}`}>
              Desliza para entregar
            </span>
            <span className={`absolute text-[17px] font-semibold tracking-wide text-white transition-opacity duration-300 ${isConfirmed ? "opacity-100" : "opacity-0"}`}>
              ¡Entregado!
            </span>
          </div>

          {/* Draggable Handle */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`absolute left-1 h-[56px] w-[56px] rounded-full flex items-center justify-center shadow-md cursor-grab touch-none z-10 transition-colors duration-200 ${isConfirmed ? "bg-white" : "bg-[#ff812c]"
              } ${isDragging ? "cursor-grabbing" : ""} ${!isDragging && !isConfirmed ? "transition-all duration-300 ease-out" : ""}`}
            style={{
              transform: `translateX(calc(${swipeProgress}% * ${(trackRef.current?.getBoundingClientRect().width || 0) - 64} / 100))`,
            }}
          >
            {isConfirmed ? (
              <Check className="w-7 h-7 text-[#34C759]" strokeWidth={3} />
            ) : (
              <div className="flex items-center space-x-0.5">
                <ChevronLeft className="w-4 h-4 text-[#1C1C1E]/40 rotate-180 -mr-2" />
                <ChevronLeft className="w-4 h-4 text-[#1C1C1E]/70 rotate-180 -mr-2" />
                <ChevronLeft className="w-4 h-4 text-[#1C1C1E] rotate-180" />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
