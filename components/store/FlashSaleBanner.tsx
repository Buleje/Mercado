"use client";

/**
 * FlashSaleBanner.tsx — Roadmap item #47
 *
 * Banner de flash sale cross-vendor con countdown timer.
 * Muestra productos en oferta relampago de cualquier tienda del marketplace.
 */

import { useState, useEffect } from "react";
import { Zap, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface FlashItem {
  id: string;
  name: string;
  originalPrice: number;
  salePrice: number;
  storeName: string;
  stock: number;
  imageUrl?: string;
}

interface FlashSaleBannerProps {
  items?: FlashItem[];
  endsAt?: Date;
  className?: string;
}

function CountdownTimer({ endsAt }: { endsAt: Date }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = endsAt.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Terminada"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return (
    <span className="flex items-center gap-1 text-xs font-mono font-bold text-white">
      <Clock className="h-3 w-3" />
      {timeLeft}
    </span>
  );
}

export default function FlashSaleBanner({ items = [], endsAt, className }: FlashSaleBannerProps) {
  const [fallbackEnd] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000));

  if (items.length === 0) return null;

  const endDate = endsAt ?? fallbackEnd;

  return (
    <div className={cn("bg-[var(--data-error-500)] rounded-xl p-4 text-white", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-300 fill-yellow-300" />
          <h3 className="text-sm font-bold">Oferta Relampago</h3>
        </div>
        <CountdownTimer endsAt={endDate} />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map((item) => {
          const discount = Math.round((1 - item.salePrice / item.originalPrice) * 100);
          return (
            <div key={item.id} className="flex-shrink-0 w-36 bg-white/10 backdrop-blur-sm rounded-lg p-3">
              <p className="text-xs font-bold truncate">{item.name}</p>
              <p className="text-[length:var(--ts-2xs)] text-white/60">{item.storeName}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-extrabold">S/{Number(item.salePrice).toFixed(0)}</span>
                <span className="text-[length:var(--ts-2xs)] line-through text-white/50">S/{Number(item.originalPrice).toFixed(0)}</span>
                <span className="text-[length:var(--ts-2xs)] font-bold text-yellow-300">-{discount}%</span>
              </div>
              {item.stock <= 5 && (
                <p className="text-[length:var(--ts-2xs)] text-yellow-200 mt-0.5">Solo quedan {item.stock}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
