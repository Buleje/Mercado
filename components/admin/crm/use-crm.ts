import { useMemo } from "react";
import { guardarCliente } from "@/components/admin/cliente360/guardar-cliente";
import { enRango } from "@/lib/admin/filtros-columna";
import { PAGE_SIZE, esActivo, frecuenciaDe, type Customer, type Frecuencia, type Segment } from "@/components/admin/crm/crm-compartido";
import { useCrmClientes } from "@/components/admin/crm/use-crm-clientes";

/** Lo que se calcula de los clientes (indicadores, filtros, página) y las acciones de la tabla. Parte de `useCrm`. */
export function useCrmVista(previo: ReturnType<typeof useCrmClientes>) {
  const {
    customers, setCustomers, search, frecuencia, creditoRango, filterSegment, page, filterTags,
    setEditingCreditLimit, creditLimitInput, setCreditLimitInput, comparePhones, setComparePhones,
  } = previo;
  // ── Derived ───────────────────────────────────────────────────────────────

  /**
   * Las cifras de Indicadores, todas de las MISMAS cuentas que la tabla (las
   * hace el servidor: CustomersDB.comprasPorCliente). «Gasto promedio» era
   * «CLV promedio» y la línea «Top · N clientes · Prom · Activos 30d» repetía
   * tres de las cuatro tarjetas: el mejor cliente es ahora una tarjeta más.
   */
  const stats = useMemo(() => {
    const total   = customers.length;
    const activos = customers.filter(esActivo).length;
    const nuevos  = customers.filter(c => c._segment === "nuevo").length;
    const gastado = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
    const gastoProm = total > 0 ? gastado / total : 0;
    let mejor: Customer | null = null;
    for (const c of customers) if ((c.totalSpent ?? 0) > 0 && (!mejor || (c.totalSpent ?? 0) > (mejor.totalSpent ?? 0))) mejor = c;
    return { total, activos, nuevos, gastoProm, mejor };
  }, [customers]);

  const segmentCounts = useMemo(() => {
    const counts: Record<Segment, number> = { frecuente: 0, ocasional: 0, nuevo: 0, perdido: 0 };
    for (const c of customers) counts[c._segment ?? "nuevo"]++;
    return counts;
  }, [customers]);

  /** Cuántos clientes hay de cada etiqueta (para el desplegable «Etiqueta»). */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) for (const t of (c._tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [customers]);

  const conDeuda = useMemo(() => customers.filter(c => (c.creditBalance ?? 0) > 0).length, [customers]);

  const freqCounts = useMemo(() => {
    const counts: Record<Frecuencia, number> = { diario: 0, semanal: 0, quincenal: 0, mensual: 0, "sin-compras": 0 };
    for (const c of customers) counts[frecuenciaDe(c)]++;
    return counts;
  }, [customers]);

  const filtered = useMemo(() => {
    let list = [...customers];
    if (frecuencia.length > 0) list = list.filter(c => frecuencia.includes(frecuenciaDe(c)));
    // Deuda — «Con deuda» escribe { min: 0,01 }.
    list = list.filter(c => enRango(c.creditBalance ?? 0, creditoRango));
    if (filterSegment.length > 0) list = list.filter(c => filterSegment.includes(c._segment ?? "nuevo"));
    if (filterTags.length > 0) list = list.filter(c => (c._tags ?? []).some(t => filterTags.includes(t)));
    if (search.trim()) {
      const q = search.toLowerCase();
      const digitos = search.replace(/\D/g, "");
      list = list.filter(c => c.name.toLowerCase().includes(q) || (digitos.length > 0 && c.phone.replace(/\D/g, "").includes(digitos)));
    }
    /* El que más gastó primero (antes, la columna «Rank»); a igual gasto, el que compró más reciente. */
    list.sort((a, b) =>
      (b.totalSpent ?? 0) - (a.totalSpent ?? 0)
      || (b._lastOrder ? Date.parse(b._lastOrder) : 0) - (a._lastOrder ? Date.parse(a._lastOrder) : 0));
    return list;
  }, [customers, frecuencia, creditoRango, filterSegment, filterTags, search]);

  const hayFiltros = frecuencia.length > 0 || creditoRango.min != null || creditoRango.max != null
    || filterSegment.length > 0 || filterTags.length > 0 || search.trim() !== "";

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

  return {
    stats, segmentCounts, tagCounts, conDeuda, freqCounts, filtered, hayFiltros, totalPages,
    effectivePage, paginated, saveCreditLimit, toggleCompare, compareCustomers,
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
