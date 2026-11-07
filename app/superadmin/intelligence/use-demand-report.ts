"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import type { DemandReport } from "./intelligence-shared";

/** Carga el reporte de demanda de la plataforma (con reintento manual vía `load`). */
export function useDemandReport() {
  const [report, setReport] = useState<DemandReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchSuperadmin("/api/superadmin/intelligence/demand");
      if (!res.ok) {
        setError(`Error al cargar datos (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as DemandReport;
      setReport(data);
    } catch {
      setError("Error de red — revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, loading, error, load };
}
