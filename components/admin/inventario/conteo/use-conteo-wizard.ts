"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { Conteo, ConteoEnLista, ConteoItem, Paso, ResumenCierre } from "./wizard-tipos";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** El asistente de conteo: mismos endpoints de siempre (`/api/inventory/conteo`), sin tocar qué se manda. */
export function useConteoWizard() {
  const [paso, setPaso] = useState<Paso>(1);
  const [tipo, setTipo] = useState<"completo" | "categoria">("completo");
  const [categoria, setCategoria] = useState("");
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [items, setItems] = useState<ConteoItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState<ResumenCierre | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [conteos, setConteos] = useState<ConteoEnLista[]>([]);

  useEffect(() => {
    fetch("/api/inventory/conteo")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setConteos(data); })
      .catch((err) => console.warn("[ConteoFisicoWizard] conteos fetch failed:", err));
  }, []);

  const cargarItems = async (conteoId: string) => {
    const res = await fetch(`/api/inventory/conteo/${conteoId}/items`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al cargar items");
    setItems(data.items || []);
    const primero = (data.items || []).findIndex((i: ConteoItem) => i.stockContado === null);
    setSelectedIdx(primero >= 0 ? primero : 0);
  };

  const iniciarConteo = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/conteo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo, ...(tipo === "categoria" ? { categoria } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear conteo");
      setConteo(data);
      await cargarItems(data.id);
      setPaso(2);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  const reanudarConteo = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      setConteo({ id, tipo: "", status: "", totalItems: 0 });
      await cargarItems(id);
      setPaso(2);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  const guardarConteo = async () => {
    if (!conteo || !items[selectedIdx]) return;
    const item = items[selectedIdx];
    const stockContado = parseInt(inputValue, 10);
    if (isNaN(stockContado) || stockContado < 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/conteo/${conteo.id}/items`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ itemId: item.id, stockContado }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...updated } : i)));
      setInputValue("");

      const siguiente = items.findIndex((i, idx) => idx > selectedIdx && i.stockContado === null);
      if (siguiente >= 0) {
        setSelectedIdx(siguiente);
      } else if (items.filter((i, idx) => idx !== selectedIdx && i.stockContado === null).length === 0) {
        setPaso(3);
      }
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  const cerrarConteo = async () => {
    if (!conteo) return;
    setLoading(true);
    try {
      // Sin los headers de CSRF esto devolvía 403 SIEMPRE (el token se valida en
      // `proxy.ts` para todo POST bajo /api/): el conteo se podía empezar pero nunca cerrar.
      const res = await fetch(`/api/inventory/conteo/${conteo.id}/close`, { method: "POST", headers: csrfHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cerrar");
      setResumen(data.resumen);
      setPaso(4);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Tildar/destildar «ajustar» y que el servidor se entere: el cierre lee
   * `ajustado` de la base, no del estado de React.
   */
  const toggleAjustado = async (itemId: string) => {
    const actual = items.find((i) => i.id === itemId);
    if (!actual || !conteo) return;
    const nuevo = !actual.ajustado;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ajustado: nuevo } : i)));
    try {
      const res = await fetch(`/api/inventory/conteo/${conteo.id}/items`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ itemId, ajustado: nuevo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn("[ConteoFisicoWizard] no se pudo guardar el check", err);
      // Mostrar tildado lo que el servidor no aceptó sería un engaño.
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ajustado: actual.ajustado } : i)));
      setError("No se pudo guardar ese cambio. Revisa la conexión.");
      setTimeout(() => setError(""), 4000);
    }
  };

  const alEscanear = useCallback((barcode: string) => {
    setShowScanner(false);
    const idx = items.findIndex((i) => i.product?.barcode === barcode);
    if (idx >= 0) {
      setSelectedIdx(idx);
      setSearch("");
    } else {
      setError(`El código "${barcode}" no está en este conteo`);
      setTimeout(() => setError(""), 3000);
    }
  }, [items]);

  const nuevoConteo = () => { setPaso(1); setConteo(null); setItems([]); setResumen(null); };

  const q = search.toLowerCase();
  const filtrados = search
    ? items.filter((i) => i.product?.name.toLowerCase().includes(q) || i.product?.barcode?.includes(search))
    : items;
  const contados = items.filter((i) => i.stockContado !== null).length;
  const conDiferencia = items.filter((i) => i.stockContado !== null && i.diferencia !== null && i.diferencia !== 0);

  return {
    paso, setPaso, tipo, setTipo, categoria, setCategoria, items, selectedIdx, setSelectedIdx,
    inputValue, setInputValue, search, setSearch, loading, error, resumen, showScanner, setShowScanner,
    conteos, filtrados, contados, conDiferencia, selected: items[selectedIdx] ?? null,
    iniciarConteo, reanudarConteo, guardarConteo, cerrarConteo, toggleAjustado, alEscanear, nuevoConteo,
  };
}

export type ConteoWizard = ReturnType<typeof useConteoWizard>;
