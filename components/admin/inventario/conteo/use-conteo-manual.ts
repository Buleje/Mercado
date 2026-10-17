"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  diferenciaDe, guardarSesion, hoyClave, leerSesion, leerSesiones,
  type FilaConteo, type ProductoManual, type SesionConteo, type VistaManual,
} from "./manual-tipos";

/** Conteo manual: baja los productos, deja escribir lo contado y al final ajusta el stock (`bulk-adjust`). */
export function useConteoManual() {
  const [view, setView] = useState<VistaManual>("start");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [session, setSession] = useState<SesionConteo | null>(null);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<SesionConteo[]>([]);

  useEffect(() => { setSessions(leerSesiones()); }, []);

  const avisar = (texto: string, ms: number) => {
    setSuccess(texto);
    setTimeout(() => setSuccess(null), ms);
  };

  const fetchProducts = useCallback(async (): Promise<ProductoManual[]> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products?tenantId=default&limit=500");
      if (!res.ok) throw new Error("No se pudieron cargar los productos");
      const data = await res.json();
      return (data.products ?? data).map((p: { id: number; name: string; sku?: string; stock?: number; currentStock?: number }) => ({
        id: p.id,
        name: p.name,
        sku: p.sku ?? "",
        stock: p.stock ?? p.currentStock ?? 0,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStart = async () => {
    const list = await fetchProducts();
    if (!list.length) return;
    const date = hoyClave();
    const previa = leerSesion(date);
    if (previa?.status === "pendiente") {
      setSession(previa);
      setView("counting");
      return;
    }
    const rows: FilaConteo[] = list.map((p) => ({
      productId: p.id, productName: p.name, sku: p.sku ?? "", systemStock: p.stock, realStock: "", reason: "",
    }));
    const nueva: SesionConteo = { id: `count-${Date.now()}`, date, rows, status: "pendiente", totalCounted: 0, differences: 0 };
    guardarSesion(nueva);
    setSession(nueva);
    setView("counting");
  };

  const filteredRows = useMemo(() => {
    if (!session) return [];
    const q = search.toLowerCase();
    return session.rows.filter((r) => r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [session, search]);

  const updateRow = useCallback((productId: number, field: "realStock" | "reason", value: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) => {
        if (r.productId !== productId) return r;
        if (field === "realStock") return { ...r, realStock: (value === "" ? "" : Math.max(0, Number(value))) as number | "" };
        return { ...r, reason: value };
      });
      return { ...prev, rows };
    });
  }, []);

  const withDiff = useMemo(
    () => (session ? session.rows.filter((r) => r.realStock !== "" && diferenciaDe(r) !== 0) : []),
    [session],
  );

  const handleSave = () => {
    if (!session) return;
    setSaving(true);
    const actualizada: SesionConteo = {
      ...session,
      totalCounted: session.rows.filter((r) => r.realStock !== "").length,
      differences: withDiff.length,
    };
    guardarSesion(actualizada);
    setSession(actualizada);
    setSessions(leerSesiones());
    setSaving(false);
    avisar("Conteo guardado.", 3000);
  };

  const handleApply = async () => {
    if (!session || !withDiff.length) return;
    setApplying(true);
    setError(null);
    try {
      const items = withDiff.map((r) => ({
        productId: r.productId,
        newStock: r.realStock as number,
        notes: `Conteo físico ${session.date}${r.reason ? " — " + r.reason : ""}`,
      }));
      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "bulk-adjust", items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "No se pudieron aplicar los ajustes");
      }
      const result = await res.json();
      const aplicada: SesionConteo = {
        ...session,
        status: "aplicado",
        totalCounted: session.rows.filter((r) => r.realStock !== "").length,
        differences: withDiff.length,
      };
      guardarSesion(aplicada);
      setSession(aplicada);
      setSessions(leerSesiones());
      avisar(`Ajustes aplicados: ${result.succeeded ?? withDiff.length} productos actualizados.`, 4000);
      setView("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setApplying(false);
    }
  };

  const retomar = (s: SesionConteo) => { setSession(s); setView("counting"); };

  return {
    view, setView, loading, saving, applying, error, success, session, search, setSearch, sessions,
    filteredRows, withDiff, updateRow, handleStart, handleSave, handleApply, retomar,
  };
}

export type ConteoManual = ReturnType<typeof useConteoManual>;
