"use client";

import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Map, 
  Settings, 
  Search, 
  Bell, 
  ChevronDown, 
  Clock, 
  CheckCircle2, 
  Truck
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState("management");
  
  // Timer state for SLA (simulating a live countdown from 24h)
  const [timeLeft, setTimeLeft] = useState(23 * 3600 + 45 * 60 + 12); // 23h 45m 12s

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const requests = [
    { id: "ATL-9024", client: "María Gómez", address: "Cl. 10 #40-20, Poblado", payment: "wompi", status: "paid", packages: 1 },
    { id: "ATL-9025", client: "Juan Pérez", address: "Cra. 43A #1-50, Poblado", payment: "cash", status: "pending", packages: 3 },
    { id: "ATL-9026", client: "Diana Rojas", address: "Cra. 35 #7-112, Lalinde", payment: "wompi", status: "paid", packages: 2 },
    { id: "ATL-9027", client: "Carlos Restrepo", address: "Cl. 12 #30-10, Manila", payment: "cash", status: "pending", packages: 1 },
  ];

  const inWarehouse = [
    { id: "ATL-9010", driver: "Luis M.", timeIn: "Hace 2 horas" },
    { id: "ATL-9011", driver: "Ana P.", timeIn: "Hace 4 horas" },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#F2F2F7] dark:bg-[#000000] font-sans overflow-hidden">
      
      {/* iPadOS Sidebar (if this acts as a standalone layout) */}
      <aside className="hidden lg:flex w-[280px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border-r border-gray-200/60 dark:border-gray-800/60 flex-col shrink-0 transition-colors">
        <div className="p-6 pb-2">
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">A tiempo logística</h1>
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <button 
            onClick={() => setActiveTab("management")}
            className={`w-full min-h-[48px] flex items-center space-x-3 px-4 py-2.5 rounded-2xl transition-colors active:scale-[0.98] ${
              activeTab === "management" 
                ? "bg-[#ff812c] text-[#1C1C1E] font-semibold" 
                : "text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${activeTab === "management" ? "text-[#1C1C1E]" : "text-slate-400 dark:text-slate-500"}`} />
            <span className="text-[17px]">Gestión</span>
          </button>
          
          <button className="w-full min-h-[48px] flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-[0.98]">
            <Package className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <span className="text-[17px]">Envíos</span>
          </button>
          
          <button className="w-full min-h-[48px] flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-[0.98]">
            <Users className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <span className="text-[17px]">Conductores</span>
          </button>

          <button className="w-full min-h-[48px] flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-[0.98]">
            <Map className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <span className="text-[17px]">Rutas</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200/60 dark:border-gray-800/60">
          <button className="w-full min-h-[48px] flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-[0.98]">
            <Settings className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            <span className="text-[17px]">Ajustes</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-[#FFFFFF] dark:bg-[#1C1C1E] lg:rounded-l-[32px] overflow-hidden lg:shadow-[-8px_0_30px_rgba(0,0,0,0.05)] border-l border-gray-200 dark:border-gray-800 transition-colors">
        
        {/* Top Header */}
        <header className="h-[72px] border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-6 shrink-0 bg-[#FFFFFF]/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md z-10 transition-colors">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar solicitudes, IDs..." 
                className="w-full min-h-[48px] bg-[#F2F2F7] dark:bg-[#2C2C2E] rounded-xl pl-10 pr-4 py-2 text-[16px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff812c] transition-all placeholder-slate-400 dark:placeholder-slate-500 border border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="relative w-12 h-12 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors shrink-0">
              <Bell className="w-6 h-6" />
              <span className="absolute top-2.5 right-2.5 w-3 h-3 bg-red-500 rounded-full border-2 border-[#FFFFFF] dark:border-[#1C1C1E]"></span>
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#ff812c] to-amber-500 flex items-center justify-center text-[#1C1C1E] font-bold text-[14px] shadow-sm shrink-0">
              AD
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col xl:flex-row gap-8 bg-[#F2F2F7] dark:bg-[#000000] transition-colors">
          
          {/* Left Column: New Requests (Table/Grid) */}
          <div className="flex-[2] space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Nuevas Solicitudes</h2>
              <button className="text-[16px] text-[#ff812c] font-semibold hover:underline active:opacity-70 transition-opacity">Ver todas</button>
            </div>

            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl shadow-sm border border-transparent overflow-hidden transition-colors">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ID & Cliente</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dirección</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Asignar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-[#F2F2F7]/30 dark:hover:bg-[#1C1C1E]/30 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="font-bold text-[16px] text-slate-900 dark:text-white">{req.id}</div>
                          <div className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">{req.client} ({req.packages} paq.)</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-[15px] text-slate-700 dark:text-slate-300 font-medium">{req.address}</div>
                        </td>
                        <td className="px-6 py-5">
                          {req.status === "paid" ? (
                            <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              <span className="text-[14px] font-bold">Pagado</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-500 border border-amber-100 dark:border-amber-500/20">
                              <Clock className="w-4 h-4 mr-2" />
                              <span className="text-[14px] font-bold">Contraentrega</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          {/* Quick Assign Dropdown */}
                          <div className="relative inline-block w-full min-w-[180px]">
                            <select className="appearance-none w-full min-h-[48px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent text-slate-900 dark:text-white py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#ff812c] text-[15px] font-semibold cursor-pointer transition-all">
                              <option value="">Seleccionar...</option>
                              <option value="1">Luis M. (Cerca)</option>
                              <option value="2">Ana P. (Disponible)</option>
                              <option value="3">Carlos G.</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                              <ChevronDown className="w-5 h-5" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Warehouse Status SLA */}
          <div className="flex-1 space-y-6">
            <h2 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white px-1">Estado en Bodega</h2>
            
            {/* SLA Alert Card */}
            <div className="bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-3xl p-6 shadow-sm relative overflow-hidden transition-colors border border-rose-100 dark:border-rose-500/20">
              <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/10 dark:bg-rose-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-500 mb-4">
                <div className="bg-rose-50 dark:bg-rose-500/10 p-2 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-[17px] font-bold uppercase tracking-wider">SLA Crítico (24h)</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-1 font-medium">Tiempo restante para despachar</p>
                <div className="text-[40px] font-bold tracking-tight text-rose-600 dark:text-rose-500 tabular-nums leading-none">
                  {formatTime(timeLeft)}
                </div>
              </div>

              <div className="space-y-3">
                {inWarehouse.map((item) => (
                  <div key={item.id} className="bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-2xl p-4 flex justify-between items-center transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-[#FFFFFF] dark:bg-[#2C2C2E] rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <Truck className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-[16px] font-bold text-slate-900 dark:text-white">{item.id}</p>
                        <p className="text-[14px] text-slate-500 dark:text-slate-400">Por {item.driver}</p>
                      </div>
                    </div>
                    <span className="text-[13px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-500/20">
                      {item.timeIn}
                    </span>
                  </div>
                ))}
              </div>
              
              <button className="w-full mt-6 min-h-[52px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] transition-all text-white font-bold text-[16px] rounded-2xl flex items-center justify-center">
                Despachar Urgentes
              </button>
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}
