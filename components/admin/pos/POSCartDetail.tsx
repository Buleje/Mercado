"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { m, AnimatePresence } from "@/components/admin/providers";

interface CartDetailItem {
  name: string;
  quantity: number;
  price: number;
  discount?: number;
}

interface POSCartDetailProps {
  items: CartDetailItem[];
  count: number;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSCartDetail({ items, count }: POSCartDetailProps) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-muted hover:text-primary transition-colors"
      >
        <span>
          {count} {count === 1 ? "articulo" : "articulos"}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1 text-xs border-t border-[var(--rule-soft)] dark:border-card-border pt-2">
              {items.map((item, i) => {
                const discountMult = 1 - (item.discount || 0) / 100;
                const lineTotal = item.price * item.quantity * discountMult;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-gray-600 dark:text-muted"
                  >
                    <span className="truncate flex-1 min-w-0">
                      {item.name}
                      <span className="text-gray-400 dark:text-muted ml-1">
                        x{item.quantity}
                      </span>
                      {item.discount && item.discount > 0 ? (
                        <span className="text-emerald-500 ml-1">
                          -{item.discount}%
                        </span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-foreground ml-2 shrink-0">
                      {fmt(item.price)} c/u &rarr; {fmt(lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
