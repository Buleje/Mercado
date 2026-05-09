"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useRef, useCallback } from "react";
import {
  Barcode,
  Search,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  MinusCircle,
  PlusCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductLookup {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock: number;
  price: number;
  unit: string;
}

interface CountedItem {
  productId: number;
  productName: string;
  sku: string;
  barcode: string;
  systemStock: number;
  physicalStock: number;
  price: number;
  unit: string;
}

type LookupState = "idle" | "loading" | "found" | "notfound" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuickStockCounter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const physInputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [foundProduct, setFoundProduct] = useState<ProductLookup | null>(null);
  const [physicalStock, setPhysicalStock] = useState<number | "">("");
  const [counted, setCounted] = useState<CountedItem[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lookupError, setLookupError] = useState("");

  const lookupBarcode = useCallback(async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    setLookupState("loading");
    setFoundProduct(null);
    setPhysicalStock("");
    setLookupError("");

    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        if (res.status === 404) {
          setLookupState("notfound");
        } else {
          throw new Error("Error del servidor");
        }
        return;
      }
      const data: ProductLookup = await res.json();
      setFoundProduct(data);
      setLookupState("found");
      setTimeout(() => physInputRef.current?.focus(), 50);
    } catch {
      setLookupError("No se pudo conectar con el servidor.");
      setLookupState("error");
    }
  }, []);

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      lookupBarcode(code);
    }
  };

  const addToCount = useCallback(() => {
    if (!foundProduct || physicalStock === "") return;

    const phys = Number(physicalStock);
    if (isNaN(phys) || phys < 0) return;

    const alreadyIndex = counted.findIndex((c) => c.productId === foundProduct.id);
    const newItem: CountedItem = {
      productId: foundProduct.id,
      productName: foundProduct.name,
      sku: foundProduct.sku,
      barcode: foundProduct.barcode ?? "",
      systemStock: foundProduct.stock,
      physicalStock: phys,
      price: foundProduct.price,
      unit: foundProduct.unit,
    };

    if (alreadyIndex >= 0) {
      setCounted((prev) => {
        const next = [...prev];
        next[alreadyIndex] = newItem;
        return next;
      });
    } else {
      setCounted((prev) => [newItem, ...prev]);
    }

    setCode("");
    setFoundProduct(null);
    setPhysicalStock("");
    setLookupState("idle");
    inputRef.current?.focus();
  }, [foundProduct, physicalStock, counted]);

  const removeItem = useCallback((productId: number) => {
    setCounted((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const saveCount = useCallback(async () => {
    if (counted.length === 0) return;
    setSaveState("saving");

    try {
      const payload = counted.map((c) => ({
        productId: c.productId,
        systemStock: c.systemStock,
        physicalStock: c.physicalStock,
        difference: c.physicalStock - c.systemStock,
      }));

      const res = await fetch("/api/stock/physical-count", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items: payload }),
      });

      if (!res.ok) throw new Error();

      setSaveState("saved");
      setTimeout(() => {
        setCounted([]);
        setSaveState("idle");
      }, 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [counted]);

  // ─── Summary calculations ────────────────────────────────────────────────────

  const summary = counted.reduce(
    (acc, item) => {
      const diff = item.physicalStock - item.systemStock;
      acc.total += 1;
      if (diff !== 0) {
        acc.withDiff += 1;
        acc.totalDiffValue += diff * item.price;
      }
      return acc;
    },
    { total: 0, withDiff: 0, totalDiffValue: 0 }
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Scanner input */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <div className="mb-4 flex items-center gap-2">
          <Barcode className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
            Escanear o ingresar código
          </CardTitle>
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleCodeKeyDown}
            placeholder="Código de barras o SKU..."
            autoFocus
            className={cn(
              "flex-1 rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm",
              "text-[var(--text-primary)] placeholder-gray-400 outline-none transition",
              "focus:border-primary focus:ring-2 focus:ring-primary/20",
              "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            )}
          />
          <button
            onClick={() => lookupBarcode(code)}
            disabled={lookupState === "loading" || !code.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-[#245a40] disabled:opacity-50"
          >
            {lookupState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </button>
        </div>

        {/* Lookup feedback */}
        {lookupState === "notfound" && (
          <p className="mt-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
            Producto no encontrado con ese código.
          </p>
        )}
        {lookupState === "error" && (
          <p className="mt-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{lookupError}</p>
        )}

        {/* Found product */}
        {lookupState === "found" && foundProduct && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 dark:bg-primary/10">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {foundProduct.name}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  SKU: {foundProduct.sku} · Stock sistema: {foundProduct.stock} {foundProduct.unit}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary dark:bg-primary/20 dark:text-[var(--data-success-500)]">
                {fmt(foundProduct.price)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
                Stock físico contado:
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setPhysicalStock((v) => Math.max(0, (Number(v) || 0) - 1))
                  }
                  className="rounded-md p-1 text-[var(--text-secondary)] hover:text-primary dark:hover:text-[var(--data-success-500)]"
                >
                  <MinusCircle className="h-5 w-5" />
                </button>
                <input
                  ref={physInputRef}
                  type="number"
                  min="0"
                  value={physicalStock}
                  onChange={(e) =>
                    setPhysicalStock(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addToCount();
                  }}
                  className={cn(
                    "w-20 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-2 py-1 text-center text-sm",
                    "text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                    "dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  )}
                />
                <button
                  onClick={() => setPhysicalStock((v) => (Number(v) || 0) + 1)}
                  className="rounded-md p-1 text-[var(--text-secondary)] hover:text-primary dark:hover:text-[var(--data-success-500)]"
                >
                  <PlusCircle className="h-5 w-5" />
                </button>
              </div>

              {physicalStock !== "" && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    Number(physicalStock) === foundProduct.stock
                      ? "text-[var(--text-secondary)]"
                      : Number(physicalStock) > foundProduct.stock
                      ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                      : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                  )}
                >
                  {Number(physicalStock) === foundProduct.stock
                    ? "Sin diferencia"
                    : Number(physicalStock) > foundProduct.stock
                    ? `+${Number(physicalStock) - foundProduct.stock} sobrante`
                    : `${Number(physicalStock) - foundProduct.stock} faltante`}
                </span>
              )}

              <button
                onClick={addToCount}
                disabled={physicalStock === ""}
                className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#245a40] disabled:opacity-40"
              >
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Counted list */}
      {counted.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3 dark:border-[var(--rule-base)]">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              Productos contados ({counted.length})
            </CardTitle>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {counted.map((item) => {
              const diff = item.physicalStock - item.systemStock;
              return (
                <div key={item.productId} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {item.productName}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Sistema: {item.systemStock} · Físico: {item.physicalStock} {item.unit}
                    </p>
                  </div>

                  <div className="text-right">
                    {diff === 0 ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                        <CheckCircle className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                        OK
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs font-semibold",
                          diff < 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                        )}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {diff > 0 ? "+" : ""}
                        {diff} ({fmt(Math.abs(diff * item.price))})
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => removeItem(item.productId)}
                    className="ml-1 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] dark:text-[var(--text-secondary)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="border-t border-[var(--rule-soft)] bg-gray-50 px-5 py-4 dark:border-[var(--rule-base)] dark:bg-gray-800/50">
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-[var(--text-tertiary)]">Contados: </span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {summary.total}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)]">Con diferencia: </span>
                <span
                  className={cn(
                    "font-semibold",
                    summary.withDiff > 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"
                  )}
                >
                  {summary.withDiff}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)]">Diferencia total: </span>
                <span
                  className={cn(
                    "font-semibold",
                    summary.totalDiffValue < 0
                      ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                      : summary.totalDiffValue > 0
                      ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                      : "text-[var(--text-primary)]"
                  )}
                >
                  {fmt(summary.totalDiffValue)}
                </span>
              </div>
            </div>

            <button
              onClick={saveCount}
              disabled={saveState === "saving" || saveState === "saved"}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition",
                saveState === "saved"
                  ? "bg-[var(--accent-soft)]"
                  : saveState === "error"
                  ? "bg-[var(--data-error-500)]"
                  : "bg-primary hover:bg-[#245a40]",
                "disabled:opacity-60"
              )}
            >
              {saveState === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
              {saveState === "saved" && <CheckCircle className="h-4 w-4" />}
              {saveState === "error" && <AlertTriangle className="h-4 w-4" />}
              {saveState === "saving" && "Guardando..."}
              {saveState === "saved" && "Conteo guardado"}
              {saveState === "error" && "Error al guardar"}
              {saveState === "idle" && (
                <>
                  <Save className="h-4 w-4" />
                  Guardar conteo
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
