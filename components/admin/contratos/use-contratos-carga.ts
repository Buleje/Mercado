import { useCallback, useEffect } from "react";
import type { ContratoAPI } from "./constantes-contratos";
import type { HastaContratosEstado } from "./use-contratos-estado";
export function useContratosCarga(previo: HastaContratosEstado) {
  const { setLoading, setError, setContratos, selected, setDetalle, setDebouncedSearch, search, setSelected,
    setStoreSettings, setGeoLoading, setWizardData, setGeoResult } = previo;

  // ── Fetch ─────────────────────────────────────────────────────────────

  const fetchContratos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contratos");
      if (!res.ok) throw new Error("Error al cargar contratos");
      const json = await res.json();
      const data: ContratoAPI[] = Array.isArray(json) ? json : Array.isArray(json?.contratos) ? json.contratos : [];
      setContratos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContratos(); }, [fetchContratos]);

  // El listado no trae el historial (sería una consulta por contrato); se pide
  // sólo al abrir el detalle.
  useEffect(() => {
    if (!selected) { setDetalle(null); return; }
    let vigente = true;
    fetch(`/api/contratos/${selected.id}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: ContratoAPI | null) => { if (vigente && data) setDetalle(data); })
      .catch((err) => console.warn("[contratos] no se pudo cargar el detalle", err));
    return () => { vigente = false; };
  }, [selected]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selected]);

  // Fetch store settings for auto-fill
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const s: Record<string, string> = {};
          if (data.storeName) s.storeName = data.storeName;
          if (data.ruc) s.ruc = data.ruc;
          if (data.address) s.address = data.address;
          if (data.ownerName) s.ownerName = data.ownerName;
          setStoreSettings(s);
        }
      })
      .catch((err) => console.warn("[contratos] no se pudo cargar la config del negocio", err));
  }, []);

  // ── Geolocation ────────────────────────────────────────────────────────

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=es`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || "Pucallpa";
          const state = data.address?.state || "Ucayali";
          setWizardData(p => ({ ...p, CIUDAD: city }));
          setGeoResult(`${city}, ${state}`);
        } catch {
          setWizardData(p => ({ ...p, CIUDAD: "Pucallpa" }));
          setGeoResult("Pucallpa, Ucayali");
        }
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setGeoResult(null);
      }
    );
  }, []);

  return { fetchContratos, detectLocation };
}
export type HastaContratosCarga = HastaContratosEstado & ReturnType<typeof useContratosCarga>;