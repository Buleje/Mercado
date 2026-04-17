"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type DeliveryZone = { zona: string; tarifa: number };
const ZONES_KEY = "delivery-zones";

export function DeliveryZonesConfig() {
  const [zones, setZonesState] = useState<DeliveryZone[]>(() => {
    try {
      const raw = localStorage.getItem(ZONES_KEY);
      return raw ? JSON.parse(raw) : [
        { zona: "Centro", tarifa: 0 },
        { zona: "Manantay", tarifa: 5 },
        { zona: "San Juan", tarifa: 3 },
        { zona: "Yarinacocha", tarifa: 8 },
      ];
    } catch { return []; }
  });
  const [addingZone, setAddingZone] = useState(false);
  const [newZone, setNewZone] = useState({ zona: "", tarifa: 0 });

  const saveZones = (z: DeliveryZone[]) => {
    setZonesState(z);
    localStorage.setItem(ZONES_KEY, JSON.stringify(z));
  };

  return (
    <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Tarifas de Delivery por Zona</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {zones.map((z, i) => (
          <div key={z.zona + i} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg px-3 py-2">
            <span className="flex-1 text-xs font-bold text-gray-700 dark:text-zinc-200">{z.zona}</span>
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              z.tarifa === 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {z.tarifa === 0 ? "GRATIS" : `S/${z.tarifa.toFixed(0)}`}
            </span>
            <button
              onClick={() => saveZones(zones.filter((_, idx) => idx !== i))}
              className="text-gray-300 hover:text-red-500 transition-colors text-xs"
            >&times;</button>
          </div>
        ))}
      </div>
      {addingZone ? (
        <div className="mt-2 flex items-center gap-2">
          <input type="text" placeholder="Nombre zona" value={newZone.zona} onChange={e => setNewZone({...newZone, zona: e.target.value})} className="flex-1 text-xs border border-[var(--rule-base)] dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">S/</span>
            <input type="number" min={0} value={newZone.tarifa} onChange={e => setNewZone({...newZone, tarifa: Number(e.target.value) || 0})} className="w-16 text-xs border border-[var(--rule-base)] dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100" />
          </div>
          <button onClick={() => { if (newZone.zona.trim()) { saveZones([...zones, { zona: newZone.zona.trim(), tarifa: newZone.tarifa }]); setNewZone({ zona: "", tarifa: 0 }); setAddingZone(false); } }} className="px-2 py-1.5 rounded-lg bg-primary text-white text-xs font-bold">OK</button>
          <button onClick={() => setAddingZone(false)} className="text-xs text-gray-400">&times;</button>
        </div>
      ) : (
        <button onClick={() => setAddingZone(true)} className="mt-2 w-full py-1.5 rounded-lg border border-dashed border-[var(--rule-base)] dark:border-zinc-600 text-xs font-bold text-gray-400 hover:text-primary hover:border-primary/40 transition-colors">
          + Agregar zona
        </button>
      )}
      <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-zinc-500 mt-2">Estas tarifas se aplican automaticamente al checkout segun la zona del cliente.</p>
    </div>
  );
}
