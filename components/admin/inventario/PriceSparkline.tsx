"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

type PricePoint = { date: string; price: number };

export default function PriceSparkline({ productId }: { productId: number }) {
  const [data, setData] = useState<PricePoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/price-history?productId=${productId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        if (cancelled) return;
        if (Array.isArray(d) && d.length >= 2) {
          setData(
            d.map((p: { date?: string; createdAt?: string; price: number }) => ({
              date: p.date || p.createdAt || "",
              price: p.price,
            }))
          );
        }
      })
      .catch(() => {
        /* ignore silently */
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (data.length < 2) {
    return <span className="text-[var(--text-tertiary)] dark:text-muted text-xs">—</span>;
  }

  return (
    <div className="w-[60px] h-[24px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sparkGrad-${productId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00B4A6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="price"
            stroke="#00B4A6"
            strokeWidth={1.5}
            fill={`url(#sparkGrad-${productId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
