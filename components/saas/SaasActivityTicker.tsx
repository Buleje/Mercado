"use client";

import { useState, useEffect } from "react";
import { Store, ShoppingCart, Users, Zap } from "@buleje/design-system/icons";

const ACTIVITIES = [
  { icon: <Store className="h-3 w-3" />, text: "Bodega Lima creo su tienda", color: "text-teal-600" },
  { icon: <ShoppingCart className="h-3 w-3" />, text: "Minimarket Ica proceso 12 pedidos hoy", color: "text-emerald-600" },
  { icon: <Users className="h-3 w-3" />, text: "Abarrotes Trujillo registro 5 clientes nuevos", color: "text-[var(--accent)]" },
  { icon: <Zap className="h-3 w-3" />, text: "Bodega Cusco activo su plan Pro", color: "text-amber-600" },
  { icon: <ShoppingCart className="h-3 w-3" />, text: "Tienda Arequipa vendio S/ 2,450 esta semana", color: "text-emerald-600" },
  { icon: <Store className="h-3 w-3" />, text: "Market Piura configuro su delivery", color: "text-orange-600" },
  { icon: <Users className="h-3 w-3" />, text: "Bodega Huancayo alcanzo 100 clientes", color: "text-pink-600" },
  { icon: <Zap className="h-3 w-3" />, text: "Minimarket Tacna subio 200 productos", color: "text-cyan-600" },
];

export default function SaasActivityTicker() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % ACTIVITIES.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const activity = ACTIVITIES[current];

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-xs">
      <div
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <div className={`h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 ${activity.color}`}>
          {activity.icon}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{activity.text}</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-400">Hace {(current % 9) + 1} min</p>
        </div>
      </div>
    </div>
  );
}
