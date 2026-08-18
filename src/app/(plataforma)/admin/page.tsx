"use client";

import { useState, useEffect } from "react";
import {
  Search,
  ChevronDown,
  Clock,
  CheckCircle2,
  Truck
} from "lucide-react";

export default function AdminDashboardPage() {
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
    /* Una pantalla más dentro de la plataforma: el AppShell ya pone la barra
       lateral, la cabecera y el menú inferior. Antes esta página montaba encima
       su propio layout de pantalla completa (h-screen, su sidebar y su header),
       así que en el escritorio salían dos menús y en el teléfono el contenido
       quedaba encerrado en una caja de alto fijo por debajo de la barra de
       pestañas. */
    <div className="pb-10 space-y-6 font-sans">
      <div className="flex flex-col">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
          Gestión
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Solicitudes por asignar y control del SLA de bodega
        </p>
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Buscar solicitudes, IDs…"
          className="w-full min-h-[48px] atl-superficie rounded-xl pl-11 pr-4 py-2 text-[16px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ff812c] transition-all placeholder-slate-400 dark:placeholder-slate-500 border border-transparent dark:border-slate-700"
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-6 xl:gap-8">

          {/* Left Column: New Requests (Table/Grid) */}
          <div className="min-w-0 flex-[2] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Nuevas Solicitudes</h2>
              <button className="text-[16px] text-[#ff812c] font-semibold hover:underline active:opacity-70 transition-opacity">Ver todas</button>
            </div>

            {/* Translucida y con blur (probado en vivo: /90 sin blur no se notaba).
                Los selects de abajo tienen su propio fondo solido (#F2F2F7/#1C1C1E),
                no heredan esta transparencia. */}
            <div className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-3xl shadow-sm border border-transparent overflow-hidden transition-colors">
              {/* En teléfono la tabla de 4 columnas obligaba a arrastrar de lado;
                  ahí se muestra la misma información apilada en tarjetas. */}
              <ul className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08] md:hidden">
                {requests.map((req) => (
                  <li key={req.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[16px] text-slate-900 dark:text-white">{req.id}</p>
                        <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {req.client} ({req.packages} paq.)
                        </p>
                      </div>
                      {req.status === "paid" ? (
                        <div className="inline-flex shrink-0 items-center px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          <span className="text-[13px] font-bold">Pagado</span>
                        </div>
                      ) : (
                        <div className="inline-flex shrink-0 items-center px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-500 border border-amber-100 dark:border-amber-500/20">
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          <span className="text-[13px] font-bold">Contraentrega</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[15px] text-slate-700 dark:text-slate-300 font-medium">{req.address}</p>
                    <div className="relative">
                      <select className="appearance-none w-full min-h-[48px] bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-transparent text-slate-900 dark:text-white py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#ff812c] text-[15px] font-semibold cursor-pointer transition-all">
                        <option value="">Seleccionar…</option>
                        <option value="1">Luis M. (Cerca)</option>
                        <option value="2">Ana P. (Disponible)</option>
                        <option value="3">Carlos G.</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                        <ChevronDown className="w-5 h-5" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900/[0.06] dark:border-white/[0.08] bg-[#F2F2F7]/50 dark:bg-[#1C1C1E]/50">
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ID & Cliente</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Dirección</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                      <th className="px-6 py-4 text-[14px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Asignar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/[0.06] dark:divide-white/[0.08]">
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
          <div className="min-w-0 flex-1 space-y-4">
            <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white px-1">Estado en Bodega</h2>

            {/* SLA Alert Card */}
            {/* Translucida y con blur, mismo patron probado en produccion.
                El avatar circular de abajo se queda opaco (bg-blanco anidado). */}
            <div className="bg-[#FFFFFF]/75 dark:bg-[#2C2C2E]/75 backdrop-blur-xl rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden transition-colors border border-rose-100 dark:border-rose-500/20">
              <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/10 dark:bg-rose-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-500 mb-4">
                <div className="bg-rose-50 dark:bg-rose-500/10 p-2 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-[17px] font-bold uppercase tracking-wider">SLA Crítico (24h)</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-1 font-medium">Tiempo restante para despachar</p>
                <div className="text-[34px] sm:text-[40px] font-bold tracking-tight text-rose-600 dark:text-rose-500 tabular-nums leading-none">
                  {formatTime(timeLeft)}
                </div>
              </div>

              <div className="space-y-3">
                {inWarehouse.map((item) => (
                  <div key={item.id} className="bg-[#F2F2F7] dark:bg-[#1C1C1E] rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3 transition-colors">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="w-10 h-10 atl-superficie rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        <Truck className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[16px] font-bold text-slate-900 dark:text-white">{item.id}</p>
                        <p className="truncate text-[14px] text-slate-500 dark:text-slate-400">Por {item.driver}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-500/20">
                      {item.timeIn}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Naranja y no rojo: despachar urgentes es la acción que QUEREMOS que se
                  toque. El rojo en esta app significa «esto no tiene vuelta atrás»
                  —eliminar una cuenta, borrar un comercio— y gastarlo en un botón
                  normal le quita el peso justo donde hace falta. */}
              <button className="w-full mt-6 min-h-[52px] bg-[#ff812c] hover:bg-[#ff812c]/90 active:scale-[0.98] transition-all text-[#1C1C1E] font-bold text-[16px] rounded-2xl flex items-center justify-center">
                Despachar Urgentes
              </button>
            </div>

          </div>
      </div>
    </div>
  );
}
