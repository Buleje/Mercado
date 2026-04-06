"use client";

import { useState, useRef } from "react";
import { Truck, Shield, Clock, CreditCard, Leaf, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUST_ITEMS = [
  { icon: Truck, text: "Delivery gratis desde S/50", color: "text-primary", bgStyle: { background: "rgba(45,106,79,0.08)" } },
  { icon: Clock, text: "Entrega en menos de 45 min", color: "text-secondary", bgStyle: { background: "rgba(244,162,97,0.08)" } },
  { icon: Shield, text: "Productos frescos garantizados", color: "text-emerald-600", bgStyle: { background: "rgba(16,185,129,0.08)" } },
  { icon: CreditCard, text: "Paga con Yape o efectivo", color: "text-purple-600", bgStyle: { background: "rgba(147,51,234,0.08)" } },
  { icon: Leaf, text: "Productos locales de Ucayali", color: "text-primary", bgStyle: { background: "rgba(45,106,79,0.08)" } },
  { icon: HeartHandshake, text: "Atención personalizada", color: "text-rose-500", bgStyle: { background: "rgba(244,63,94,0.08)" } },
];

export default function TrustBar() {
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = [...TRUST_ITEMS, ...TRUST_ITEMS];

  return (
    <div
      className="bg-white dark:bg-card border-y border-gray-100 dark:border-card-border py-4 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center gap-6 sm:gap-10 whitespace-nowrap",
          paused ? "[animation-play-state:paused]" : ""
        )}
        style={{
          animation: "scrollX 35s linear infinite",
          width: "max-content",
        }}
      >
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 shrink-0 group">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-transform group-hover:scale-110")} style={item.bgStyle}>
              <item.icon className={cn("h-4 w-4 shrink-0", item.color)} />
            </span>
            <span className="text-xs sm:text-sm font-semibold text-foreground">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
