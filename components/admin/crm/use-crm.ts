import { useMemo } from "react";
import { guardarCliente } from "@/components/admin/cliente360/guardar-cliente";
import { enRango } from "@/lib/admin/filtros-columna";
import { PAGE_SIZE, type Customer, type Segment } from "@/components/admin/crm/crm-compartido";
import { useCrmClientes } from "@/components/admin/crm/use-crm-clientes";

/** Lo que se calcula de los clientes (indicadores, filtros, página) y las acciones de la tabla. Parte de `useCrm`. */
export function useCrmVista(previo: ReturnType<typeof useCrmClientes>) {
  const {
    customers, setCustomers, search, actividadFiltro, creditoRango, filterSegment, page, filterTag,
    setEditingCreditLimit, creditLimitInput, setCreditLimitInput, freqFilter, comparePhones,
    setComparePhones,
  } = previo;
  // ── Derived ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const total     = customers.length;
    const activos   = customers.filter(c => c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo).length;
    const nuevos    = customers.filter(c => c._segment === "nuevo").length;
    const clvProm   = total > 0 ? customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / total : 0;
    return { total, activos, nuevos, clvProm };
  }, [customers]);

  const segmentCounts = useMemo(() => {
    const counts: Record<Segment, number> = { frecuente: 0, ocasional: 0, nuevo: 0, perdido: 0 };
    for (const c of customers) counts[c._segment ?? "nuevo"]++;
    return counts;
  }, [customers]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const c of customers) {
      for (const t of (c._tags ?? [])) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [customers]);

  const quickFilterCounts = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    return {
      todos: customers.length,
      activos: customers.filter(c => c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo).length,
      inactivos: customers.filter(c => !c._lastOrder || new Date(c._lastOrder).getTime() <= thirtyDaysAgo).length,
      "con-deuda": customers.filter(c => (c.creditBalance ?? 0) > 0).length,
    };
  }, [customers]);

  // Mejora 10: Ranking de clientes por totalSpent
  const rankingMap = useMemo(() => {
    const sorted = [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0));
    const map = new Map<string, number>();
    sorted.forEach((c, idx) => map.set(c.phone, idx + 1));
    return map;
  }, [customers]);

  // Mejora nueva 7: Frecuencia de compra counts
  const freqCounts = useMemo(() => {
    const counts = { "todos-freq": customers.length, diario: 0, semanal: 0, quincenal: 0, mensual: 0, "inactivo-freq": 0 };
    for (const c of customers) {
      const orders30d = c._orderCount ?? 0;
      if (orders30d >= 20) counts.diario++;
      else if (orders30d >= 4) counts.semanal++;
      else if (orders30d >= 2) counts.quincenal++;
      else if (orders30d >= 1) counts.mensual++;
      else counts["inactivo-freq"]++;
    }
    return counts;
  }, [customers]);

  const getFreqLabel = (c: Customer): { label: string } => {
    const orders30d = c._orderCount ?? 0;
    if (orders30d >= 20) return { label: "Diario" };
    if (orders30d >= 4) return { label: "Semanal" };
    if (orders30d >= 2) return { label: "Quincenal" };
    if (orders30d >= 1) return { label: "Mensual" };
    return { label: "Inactivo" };
  };

  const topCustomer = useMemo(() => {
    if (customers.length === 0) return null;
    return [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))[0];
  }, [customers]);

  const avgSpent = useMemo(() => {
    if (customers.length === 0) return 0;
    return customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / customers.length;
  }, [customers]);

  const filtered = useMemo(() => {
    let list = [...customers];

    // Actividad — columna "Último pedido" (antes parte de quickFilter).
    if (actividadFiltro.length > 0) {
      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      const esActivo = (c: Customer) => Boolean(c._lastOrder && new Date(c._lastOrder).getTime() > thirtyDaysAgo);
      list = list.filter(c => actividadFiltro.includes(esActivo(c) ? "Activo" : "Inactivo"));
    }

    // Deuda — columna "Crédito" (antes "con-deuda" de quickFilter).
    list = list.filter(c => enRango(c.creditBalance ?? 0, creditoRango));

    // Segment filter
    if (filterSegment.length > 0) list = list.filter(c => filterSegment.includes(c._segment ?? "nuevo"));

    // Tag filter
    if (filterTag !== "todos") list = list.filter(c => (c._tags ?? []).includes(filterTag));

    // Mejora nueva 7: Frequency filter
    if (freqFilter !== "todos-freq") {
      list = list.filter(c => {
        const orders30d = c._orderCount ?? 0;
        switch (freqFilter) {
          case "diario": return orders30d >= 20;
          case "semanal": return orders30d >= 4 && orders30d < 20;
          case "quincenal": return orders30d >= 2 && orders30d < 4;
          case "mensual": return orders30d >= 1 && orders30d < 2;
          case "inactivo-freq": return orders30d === 0;
          default: return true;
        }
      });
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [customers, actividadFiltro, creditoRango, filterSegment, filterTag, freqFilter, search]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp page dentro del rango válido — evita setState derivado en useEffect
  const effectivePage = Math.min(page, totalPages);
  const paginated   = filtered.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  // ── Credit limit ──────────────────────────────────────────────────────────

  async function saveCreditLimit(phone: string) {
    const limit = parseFloat(creditLimitInput);
    if (isNaN(limit) || limit < 0) return;
    try {
      /**
       * Iba con PUT, que la ruta no tiene: 405 callado y el tope editado en la
       * tabla nunca se guardaba. guardarCliente va por PATCH y avisa si no entró.
       */
      if (!await guardarCliente(phone, { creditLimit: limit }, "guardar el límite de crédito")) return;
      setCustomers(prev =>
        prev.map(c => c.phone === phone ? { ...c, creditLimit: limit } : c)
      );
    } finally {
      setEditingCreditLimit(null);
      setCreditLimitInput("");
    }
  }

  // ── Mejora 13: Compare helpers ────────────────────────────────────────────
  const toggleCompare = (phone: string) => {
    setComparePhones(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else if (next.size < 3) next.add(phone);
      return next;
    });
  };

  const compareCustomers = useMemo(() => {
    return customers.filter(c => comparePhones.has(c.phone));
  }, [customers, comparePhones]);

  function getSegmentLabel(c: Customer): string {
    const s = c.totalSpent ?? 0;
    const o = c._orderCount ?? 0;
    if (o === 0) return "Nuevo";
    if (s > 1000) return "Champion";
    if (s > 500) return "Loyal";
    if (o >= 5) return "Frecuente";
    return "Regular";
  }
  return {
    stats, segmentCounts, allTags, quickFilterCounts, rankingMap, freqCounts, getFreqLabel,
    topCustomer, avgSpent, filtered, totalPages, effectivePage, paginated, saveCreditLimit,
    toggleCompare, compareCustomers, getSegmentLabel,
  };
}

/**
 * Todo el estado del CRM. Encadena los dos hooks en el MISMO orden en que estaban en CRMTab
 * (los efectos corren igual); cada pieza de la vista recibe el resultado entero.
 */
export function useCrm() {
  const clientes = useCrmClientes();
  const vista = useCrmVista(clientes);
  return { ...clientes, ...vista };
}

export type Crm = ReturnType<typeof useCrm>;
