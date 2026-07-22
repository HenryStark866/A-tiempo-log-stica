"use client";

import { useState } from "react";
import { Camera, Navigation2, MoreHorizontal, Package } from "lucide-react";

export default function RecogidaPage() {
  // Placeholder data for pickups
  const pickups = [
    { id: 1, address: "Cra. 43A #1-50, Poblado", distance: "1.2 km", time: "5 min", packages: 3 },
    { id: 2, address: "Cl. 10 #40-20, Poblado", distance: "2.5 km", time: "8 min", packages: 1 },
    { id: 3, address: "Cra. 35 #7-112, Lalinde", distance: "3.1 km", time: "12 min", packages: 5 },
  ];

  return (
    <div className="relative h-screen bg-[#F2F2F7] dark:bg-[#1C1C1E] overflow-hidden font-sans text-slate-900 dark:text-white selection:bg-[#ff812c]/20 transition-colors duration-300">

      {/* 1. Map View (Top Half) */}
      <div className="absolute inset-0 h-[55%] bg-[#E5E5EA] dark:bg-[#2C2C2E] flex flex-col items-center justify-center overflow-hidden transition-colors duration-300">
        {/* Decorative Map Pattern */}
        <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.1] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#F2F2F7] dark:to-[#1C1C1E] opacity-80 transition-colors duration-300" />

        {/* Map UI Elements */}
        <div className="absolute top-12 left-4 right-4 flex justify-between items-center z-10">
          <div className="bg-white/90 dark:bg-[#2C2C2E]/90 backdrop-blur-md rounded-full px-4 py-2 shadow-sm">
            <span className="font-semibold text-[15px] text-slate-900 dark:text-white">Ruta Activa</span>
          </div>
          <button className="w-11 h-11 bg-[#ff812c] backdrop-blur-md rounded-full shadow-sm flex items-center justify-center active:scale-95 transition-transform">
            <Navigation2 className="w-5 h-5 text-[#1C1C1E] fill-current" />
          </button>
        </div>

        {/* Map Pins */}
        <div className="absolute top-[40%] left-[30%] z-10">
          <div className="relative">
            <div className="w-10 h-10 bg-[#ff812c] rounded-full flex items-center justify-center shadow-lg border-2 border-white text-[17px] font-bold text-[#1C1C1E]">1</div>
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#ff812c] rounded-full" />
          </div>
        </div>
        <div className="absolute top-[20%] right-[30%] z-10 opacity-70 scale-90">
          <div className="w-10 h-10 bg-gray-400 dark:bg-gray-600 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white text-[17px] font-bold">2</div>
        </div>
        <div className="absolute top-[60%] right-[20%] z-10 opacity-50 scale-75">
          <div className="w-10 h-10 bg-gray-400 dark:bg-gray-600 rounded-full flex items-center justify-center text-white shadow-md border-2 border-white text-[17px] font-bold">3</div>
        </div>
      </div>

      {/* 2. Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 h-[58%] bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.35)] flex flex-col z-20 transition-colors duration-300">

        {/* Sheet Handle */}
        <div className="w-full flex justify-center py-3 pb-1">
          <div className="w-10 h-[5px] bg-gray-300 dark:bg-gray-600 rounded-full transition-colors" />
        </div>

        {/* Sheet Content */}
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-32">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">Próximas Recogidas</h2>
            <span className="text-[14px] font-semibold text-[#ff812c] bg-[#ff812c]/10 dark:bg-[#ff812c]/15 px-3 py-1 rounded-full">
              {pickups.length} pendientes
            </span>
          </div>

          <div className="space-y-3">
            {pickups.map((pickup, index) => (
              <div
                key={pickup.id}
                className={`bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-2xl p-4 flex items-center shadow-sm border transition-colors duration-300 ${
                  index === 0
                    ? "border-[#ff812c]/30 dark:border-[#ff812c]/20"
                    : "border-gray-100 dark:border-gray-800"
                }`}
              >
                {/* Number indicator */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[15px] mr-3 shrink-0 transition-colors ${
                    index === 0
                      ? "bg-[#ff812c] text-[#1C1C1E]"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {index + 1}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h3 className={`text-[16px] font-semibold tracking-tight truncate ${index === 0 ? "text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}>
                    {pickup.address}
                  </h3>
                  <div className="flex items-center text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 space-x-1.5 flex-wrap gap-y-0.5">
                    <span className="flex items-center gap-1">
                      <Navigation2 className="w-3.5 h-3.5" />
                      {pickup.distance}
                    </span>
                    <span>·</span>
                    <span>{pickup.time}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" />
                      {pickup.packages} paq.
                    </span>
                  </div>
                </div>

                {/* More options */}
                <button className="w-9 h-9 flex items-center justify-center text-slate-400 dark:text-slate-500 active:bg-gray-100 dark:active:bg-gray-700 rounded-full transition-colors ml-1 shrink-0">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Primary CTA: Scan QR */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#F2F2F7] dark:from-[#1C1C1E] via-[#F2F2F7]/95 dark:via-[#1C1C1E]/95 to-transparent pb-8 pt-10 transition-colors duration-300">
          <button className="w-full min-h-[56px] bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all rounded-2xl flex items-center justify-center space-x-3 text-[#1C1C1E] shadow-[0_8px_20px_rgba(255,129,44,0.35)]">
            <div className="bg-[#1C1C1E]/10 p-1.5 rounded-full">
              <Camera className="w-6 h-6 text-[#1C1C1E]" />
            </div>
            <span className="text-[19px] font-bold tracking-tight">Escanear QR y Recoger</span>
          </button>
        </div>
      </div>

    </div>
  );
}
