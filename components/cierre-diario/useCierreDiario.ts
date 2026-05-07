"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export type PreviewData = {
  ventas: {
    total: number;
    cantidad: number;
    ticketPromedio: number;
    mejorHora: string | null;
    productoTop: string | null;
  };
  fiados: {
    cobradosHoy: number;
    nuevosHoy: number;
    vencidos: number;
  };
  caja: {
    efectivoEsperado: number;
  };
  stockAlertas: Array<{ nombre: string; stock: number; stockMin: number }>;
  fecha: string;
};

export type Denominacion = {
  valor: number;
  tipo: "billete" | "moneda";
};

export const DENOMINACIONES: Denominacion[] = [
  { valor: 200, tipo: "billete" },
  { valor: 100, tipo: "billete" },
  { valor: 50, tipo: "billete" },
  { valor: 20, tipo: "billete" },
  { valor: 10, tipo: "billete" },
  { valor: 5, tipo: "moneda" },
  { valor: 2, tipo: "moneda" },
  { valor: 1, tipo: "moneda" },
  { valor: 0.5, tipo: "moneda" },
  { valor: 0.2, tipo: "moneda" },
];

export type CierreState = {
  paso: 1 | 2 | 3;
  efectivoContado: number | null;
  preview: PreviewData | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saved: boolean;
};

const DRAFT_KEY = "cierre-diario-draft";

type ConteoMap = Record<number, number>;

function loadDraft(): { conteo: ConteoMap; notas: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(conteo: ConteoMap, notas: string) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ conteo, notas }));
  } catch {
    // ignore
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function useCierreDiario() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notas, setNotas] = useState("");
  const [skipCaja, setSkipCaja] = useState(false);

  // Conteo de denominaciones: { [valor]: cantidad }
  const draft = useRef(loadDraft());
  const [conteo, setConteo] = useState<ConteoMap>(() => {
    if (draft.current?.conteo) return draft.current.conteo;
    const initial: ConteoMap = {};
    for (const d of DENOMINACIONES) initial[d.valor] = 0;
    return initial;
  });

  useEffect(() => {
    if (draft.current?.notas) setNotas(draft.current.notas);
  }, []);

  // Persist draft on changes
  useEffect(() => {
    saveDraft(conteo, notas);
  }, [conteo, notas]);

  const totalContado = DENOMINACIONES.reduce(
    (sum, d) => sum + d.valor * (conteo[d.valor] ?? 0),
    0,
  );

  const efectivoEsperado = preview?.caja?.efectivoEsperado ?? 0;
  const diferencia = skipCaja ? 0 : totalContado - efectivoEsperado;

  const incrementar = useCallback((valor: number) => {
    setConteo((prev) => ({ ...prev, [valor]: (prev[valor] ?? 0) + 1 }));
  }, []);

  const setCantidad = useCallback((valor: number, cantidad: number) => {
    setConteo((prev) => ({ ...prev, [valor]: Math.max(0, cantidad) }));
  }, []);

  const resetConteo = useCallback(() => {
    const empty: ConteoMap = {};
    for (const d of DENOMINACIONES) empty[d.valor] = 0;
    setConteo(empty);
  }, []);

  const fetchPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cierre-diario/preview");
      if (!res.ok) throw new Error("Error al cargar datos");
      const data: PreviewData = await res.json();
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const guardar = useCallback(async () => {
    if (!preview) return;
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        fecha: preview.fecha,
        totalVentas: preview.ventas.total,
        cantidadVentas: preview.ventas.cantidad,
        ticketPromedio: preview.ventas.ticketPromedio,
        efectivoContado: skipCaja ? null : totalContado,
        efectivoEsperado: preview.caja.efectivoEsperado,
        diferenciaCaja: skipCaja ? 0 : diferencia,
        fiadosCobrados: preview.fiados.cobradosHoy,
        fiadosNuevos: preview.fiados.nuevosHoy,
        fiadosVencidos: preview.fiados.vencidos,
        mejorHora: preview.ventas.mejorHora,
        productoTop: preview.ventas.productoTop,
        stockAlertas: preview.stockAlertas.length > 0 ? JSON.stringify(preview.stockAlertas) : null,
        notas: notas.trim() || null,
      };

      const res = await fetch("/api/cierre-diario", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }

      setSaved(true);
      clearDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setIsSaving(false);
    }
  }, [preview, skipCaja, totalContado, diferencia, notas]);

  const generarTextoWhatsApp = useCallback(() => {
    if (!preview) return "";
    const f = preview.fecha;
    const dif = skipCaja ? "N/A" : (diferencia >= 0 ? `+S/${diferencia.toFixed(2)}` : `-S/${Math.abs(diferencia).toFixed(2)}`);
    const lines = [
      `\u{1F4CA} *Cierre Buleje \u2014 ${f}*`,
      `\u{1F4B0} Ventas: S/ ${preview.ventas.total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
      `\u{1F9FE} Ticket prom: S/ ${preview.Number(ventas.ticketPromedio).toFixed(2)}`,
      `\u{1F4B5} Caja: S/ ${skipCaja ? "N/A" : totalContado.toFixed(2)} (dif: ${dif})`,
      `\u{1F4E6} Alertas stock: ${preview.stockAlertas.length} productos`,
      `\u2705 Fiados cobrados: S/ ${preview.Number(fiados.cobradosHoy).toFixed(2)}`,
      `Hasta ma\u00f1ana! \u{1F64F}`,
    ];
    return lines.join("\n");
  }, [preview, skipCaja, totalContado, diferencia]);

  const reset = useCallback(() => {
    setPaso(1);
    setPreview(null);
    setSaved(false);
    setError(null);
    setNotas("");
    setSkipCaja(false);
    resetConteo();
    clearDraft();
  }, [resetConteo]);

  return {
    paso,
    setPaso,
    preview,
    isLoading,
    isSaving,
    error,
    saved,
    notas,
    setNotas,
    conteo,
    totalContado,
    efectivoEsperado,
    diferencia,
    skipCaja,
    setSkipCaja,
    incrementar,
    setCantidad,
    resetConteo,
    fetchPreview,
    guardar,
    generarTextoWhatsApp,
    reset,
  };
}
