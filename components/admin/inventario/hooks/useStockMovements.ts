"use client";

import { useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";
import type { FormEvent } from "react";

type AddFormShape = {
  name: string;
  category: string;
  price: string;
  unit: string;
  badge: string;
  image: string;
  barcode: string;
  costPrice: string;
  stock: string;
  stockMin: string;
  stockMax: string;
  expiryDate: string;
  isVariant: boolean;
  variantOf: string;
  variantAttr: string;
};

const EMPTY_ADD: AddFormShape = {
  name: "", category: "abarrotes", price: "", unit: "und", badge: "", image: "",
  barcode: "", costPrice: "", stock: "", stockMin: "", stockMax: "", expiryDate: "",
  isVariant: false, variantOf: "", variantAttr: "",
};

export function useStockMovements(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddFormShape>(EMPTY_ADD);

  // Barcode / DB search
  const [scanLoading, setScanLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [dbQuery, setDbQuery] = useState("");
  const [dbResults, setDbResults] = useState<Array<{
    name: string; brand: string; barcode: string; image: string; quantity: string; unit: string;
  }>>([]);
  const [dbSearching, setDbSearching] = useState(false);

  // CSV import
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; errors: string[] } | null>(null);

  const handleDbSearch = useCallback(async () => {
    if (!dbQuery.trim()) return;
    setDbSearching(true);
    try {
      const res = await fetch(`/api/product-search?q=${encodeURIComponent(dbQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setDbResults(data.products ?? []);
      }
    } catch { /* ignore */ }
    setDbSearching(false);
  }, [dbQuery]);

  const applyDbResult = useCallback((r: { name: string; brand: string; barcode: string; image: string; quantity: string; unit: string }) => {
    setAddForm(f => ({
      ...f,
      name: r.name || f.name,
      barcode: r.barcode || f.barcode,
      image: r.image || f.image,
      unit: r.unit || f.unit,
    }));
    setDbResults([]);
    setDbQuery("");
  }, []);

  const handleBarcodeScan = useCallback(async (code: string) => {
    setShowScanner(false);
    setScanLoading(true);
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found) {
        setAddForm(f => ({
          ...f,
          name: data.name || f.name,
          image: data.image || f.image,
          unit: data.unit || f.unit,
          barcode: data.barcode || code,
        }));
      } else {
        setAddForm(f => ({ ...f, barcode: code }));
      }
      setShowAdd(true);
    } catch {
      setAddForm(f => ({ ...f, barcode: code }));
      setShowAdd(true);
    }
    setScanLoading(false);
  }, []);

  const addProduct = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!addForm.name || !addForm.price) return;
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...addForm,
          price: Number(addForm.price),
          costPrice: addForm.costPrice ? Number(addForm.costPrice) : undefined,
          badge: addForm.badge || undefined,
          barcode: addForm.barcode || undefined,
          stock: addForm.stock !== "" ? Number(addForm.stock) : undefined,
          stockMin: addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined,
          stockMax: addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined,
          expiryDate: addForm.expiryDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string })?.error || `No se pudo crear el producto (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      toast.success("Producto creado");
      setShowAdd(false);
      setAddForm(EMPTY_ADD);
      onDone();
    } catch (err) {
      console.error("[useStockMovements] addProduct error", err);
      toast.error("Error de conexión. Reintentá.");
    }
    setSaving(false);
  }, [saving, addForm, onDone]);

  const handleCsvImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, csvImportRef: React.RefObject<HTMLInputElement | null>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setCsvImporting(false); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
    const idx = (key: string) => headers.findIndex(h => h === key);
    const nameIdx = idx("nombre");
    const priceIdx = idx("precio");
    const categoryIdx = idx("categoria");
    const stockIdx = idx("stock");
    const costIdx = idx("costo");
    const unitIdx = idx("unidad");
    const barcodeIdx = idx("codigo");

    if (nameIdx === -1 || priceIdx === -1) {
      setCsvResult({ created: 0, errors: ["El CSV debe tener columnas 'nombre' y 'precio' como mínimo."] });
      setCsvImporting(false);
      if (csvImportRef.current) csvImportRef.current.value = "";
      return;
    }

    let created = 0;
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      const name = nameIdx >= 0 ? cols[nameIdx] : "";
      const price = priceIdx >= 0 ? parseFloat(cols[priceIdx]) : NaN;
      if (!name || isNaN(price) || price <= 0) {
        errors.push(`Fila ${i + 1}: nombre o precio inválido`);
        continue;
      }
      const body: Record<string, unknown> = {
        name, price,
        category: categoryIdx >= 0 && cols[categoryIdx] ? cols[categoryIdx] : "otros",
        unit: unitIdx >= 0 && cols[unitIdx] ? cols[unitIdx] : "und",
        active: true,
      };
      if (stockIdx >= 0 && cols[stockIdx]) body.stock = parseInt(cols[stockIdx], 10);
      if (costIdx >= 0 && cols[costIdx]) body.costPrice = parseFloat(cols[costIdx]);
      if (barcodeIdx >= 0 && cols[barcodeIdx]) body.barcode = cols[barcodeIdx];
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (res.ok) created++;
        else errors.push(`Fila ${i + 1}: Error API (${res.status})`);
      } catch {
        errors.push(`Fila ${i + 1}: Error de red`);
      }
    }
    setCsvResult({ created, errors });
    setCsvImporting(false);
    if (csvImportRef.current) csvImportRef.current.value = "";
    if (created > 0) onDone();
  }, [onDone]);

  return {
    saving, setSaving,
    showAdd, setShowAdd,
    addForm, setAddForm,
    EMPTY_ADD,
    showScanner, setShowScanner,
    scanLoading,
    dbQuery, setDbQuery,
    dbResults,
    dbSearching,
    csvImporting,
    csvResult,
    handleDbSearch,
    applyDbResult,
    handleBarcodeScan,
    addProduct,
    handleCsvImport,
  };
}

export type { AddFormShape };
