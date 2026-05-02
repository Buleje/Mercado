"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Zap, X, HelpCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Product {
  id: number;
  name: string;
  price: number;
  barcode?: string | null;
  stock?: number | null;
}

interface POSExpressModeProps {
  products: Product[];
  onAddToCart: (productId: number, quantity?: number) => void;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSExpressMode({
  products,
  onAddToCart,
}: POSExpressModeProps) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pos-express-mode") === "true";
  });
  const [input, setInput] = useState("");
  const [recentExpress, setRecentExpress] = useState<
    { id: number; name: string; price: number }[]
  >([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("pos-express-mode", String(enabled));
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      inputRef.current?.focus();
    }
  }, [enabled]);

  // Clear feedback after 2 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const raw = input.trim();
      if (!raw) return;

      // Parse "003x5" format: code x quantity
      let code = raw;
      let quantity = 1;
      const xMatch = raw.match(/^(.+?)x(\d+)$/i);
      if (xMatch) {
        code = xMatch[1];
        quantity = Math.max(1, parseInt(xMatch[2], 10));
      }

      // Find product by barcode or ID
      const product =
        products.find((p) => p.barcode === code) ||
        products.find((p) => String(p.id) === code);

      if (!product) {
        setFeedback(`No se encontro: "${code}"`);
        setInput("");
        return;
      }

      if (product.stock != null && product.stock <= 0) {
        setFeedback(`Sin stock: ${product.name}`);
        setInput("");
        return;
      }

      for (let i = 0; i < quantity; i++) {
        onAddToCart(product.id);
      }

      setFeedback(
        `+ ${quantity > 1 ? `${quantity}x ` : ""}${product.name} (${fmt(product.price)})`
      );
      setRecentExpress((prev) => {
        const filtered = prev.filter((p) => p.id !== product.id);
        return [
          { id: product.id, name: product.name, price: product.price },
          ...filtered,
        ].slice(0, 5);
      });
      setInput("");
      inputRef.current?.focus();
    },
    [input, products, onAddToCart]
  );

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] px-3 py-2 rounded-lg transition-colors"
        title="Modo Express - escaneo rápido por codigo"
      >
        <Zap className="h-4 w-4 text-[var(--data-warning)]" /> Express
      </button>
    );
  }

  return (
    <div className="bg-[var(--data-warning-50)]/50 dark:bg-amber-950/10 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-[var(--data-warning)]" />
          <span className="text-xs font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)] inline-flex items-center gap-1">
            Modo Express
            <span className="text-[var(--data-warning)] dark:text-[var(--data-warning)] cursor-help" title="Escribe el código del producto + Enter para agregar rápido sin buscar">
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
          </span>
        </div>
        <button
          onClick={() => setEnabled(false)}
          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Codigo + Enter (ej: 003x5 = producto 003, cant. 5)"
          className="w-full px-3 py-2.5 rounded-lg border border-[var(--data-warning)] dark:border-[var(--data-warning)] text-sm font-bold text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white dark:bg-card text-center"
          autoComplete="off"
        />
      </form>

      {feedback && (
        <p
          className={cn(
            "text-xs font-semibold text-center px-2 py-1 rounded-lg",
            feedback.startsWith("+")
              ? "text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
              : "text-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/20 dark:text-[var(--data-error)]"
          )}
        >
          {feedback}
        </p>
      )}

      {recentExpress.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentExpress.map((p) => (
            <button
              key={p.id}
              onClick={() => onAddToCart(p.id)}
              className="shrink-0 px-2 py-1 rounded-lg text-[length:var(--ts-xs)] font-medium bg-white dark:bg-card border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 text-[var(--text-primary)] dark:text-foreground hover:border-primary transition-all whitespace-nowrap flex items-center gap-1"
            >
              <span className="truncate max-w-20">{p.name}</span>
              <span className="font-bold text-primary">{fmt(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
