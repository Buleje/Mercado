import { useState, useEffect, useMemo } from "react";
import type { ProductOption } from "@/components/admin/shared/ProductCombobox";
import { enRango, type FacetaOpcion, type Rango } from "@/lib/admin/filtros-columna";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { STATUS_MAP, type Reception, type ReceptionStatus } from "@/components/admin/ordenes-compra/recepciones/tipos";

/**
 * La lista de Recepciones: carga (con caché local), filtros, facetas, cifras y
 * los datos de los pickers (productos y proveedores). Salió de `ReceivingTab`
 * (10-10) sin cambiar la lógica.
 */
export function useRecepciones() {
  const [receptions, setReceptions]     = useState<Reception[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  // Filtros en la cabecera, estilo Excel (Brandon, 2026-09-03/22): un solo
  // estado por columna; las pastillas de arriba y el autofiltro del `<th>`
  // escriben lo mismo. `[]` = todos los estados (antes era el sentinela
  // "todos"), y ahora admite VARIOS a la vez (antes sólo 4 de los 5 estados
  // tenían pastilla — "parcial"/"rechazada" quedaban sin forma de filtrarse).
  const [estadoFiltro, setEstadoFiltro] = useState<ReceptionStatus[]>([]);
  // Proveedor, en su columna: no existía ningún filtro para esto antes.
  const [proveedorFiltro, setProveedorFiltro] = useState<string[]>([]);
  // Fecha programada, en su columna: "entre estas fechas".
  const [programadaRango, setProgramadaRango] = useState<Rango<string>>({ min: null, max: null });
  // Columnas de la tabla: arrastrar el título para reordenarlas.
  const ordenRecepciones = useOrdenColumnas("recepciones-lista", ["ref", "proveedor", "programada", "recibida", "inspector", "estado", "fotos", "nc"]);
  // Datos reales para los campos que eran texto libre (reporte QA): productos
  // del inventario (combobox con id/unidad) + proveedores (datalist).
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  /* La recepción guarda el NOMBRE del proveedor: su id (para el enlace a la ficha) sale
     de la lista. Un nombre repetido no se sabe de quién es: queda como texto. */
  const [proveedorIdDe, setProveedorIdDe] = useState<ReadonlyMap<string, string | null>>(() => new Map());

  // Carga recepciones con cache localStorage stale-while-revalidate
  useEffect(() => {
    const KEY = "admin-recepciones-cache";
    const TTL = 60 * 1000;
    let active = true;

    // 1. Hidratar instantaneo desde cache
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Reception[]; ts: number };
        if (Array.isArray(data)) {
          setReceptions(data);
          setLoading(false);
          if (Date.now() - ts < TTL) return;
        }
      }
    } catch { /* ignore */ }

    // 2. Refrescar de red
    fetch("/api/compras/recepciones").then(r => r.ok ? r.json() : []).then((data: Reception[]) => {
      if (!active) return;
      setReceptions(data);
      setLoading(false);
      try { localStorage.setItem(KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
    }).catch(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  // Carga real para los pickers: productos (combobox) + proveedores (datalist).
  useEffect(() => {
    let cancelled = false;
    const toArr = (data: unknown, key: string) =>
      (Array.isArray(data) ? data : (data as Record<string, unknown[]>)?.[key] ?? []) as unknown[];
    Promise.all([
      fetch("/api/products").then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/suppliers").then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([prods, sups]) => {
      if (cancelled) return;
      const prodList = (toArr(prods, "products") as Array<{ id?: number | string; name?: string; stock?: number | null; unit?: string; barcode?: string; type?: string | null; category?: string | null }>)
        .filter(p => !!p.name)
        .map(p => ({ id: p.id ?? p.name!, name: p.name!, stock: p.stock ?? null, unit: p.unit, barcode: p.barcode, type: p.type ?? null, category: p.category ?? null }));
      setProducts(prodList);
      const supList = toArr(sups, "suppliers") as Array<{ id?: string; name?: string }>;
      const supNames = supList.map(s => s.name).filter((n): n is string => !!n);
      setSupplierNames(Array.from(new Set(supNames)).sort());
      const ids = new Map<string, string | null>();
      for (const sp of supList) if (sp.name && sp.id) ids.set(sp.name, ids.has(sp.name) ? null : sp.id);
      setProveedorIdDe(ids);
    });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const scheduled   = receptions.filter(r => r.status === "programada").length;
    const inProgress  = receptions.filter(r => r.status === "en-proceso").length;
    const accepted    = receptions.filter(r => r.status === "aceptada").length;
    const totalNonConf = receptions.reduce((s, r) => s + r.nonConformities, 0);
    return { scheduled, inProgress, accepted, totalNonConf };
  }, [receptions]);

  const filtered = useMemo(() => {
    let list = receptions;
    if (estadoFiltro.length > 0) list = list.filter(r => estadoFiltro.includes(r.status));
    if (proveedorFiltro.length > 0) list = list.filter(r => proveedorFiltro.includes(r.supplier));
    list = list.filter(r => enRango(r.scheduledDate || null, programadaRango));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.supplier.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.orderRef.toLowerCase().includes(q) ||
        // «muestra», «consignación»: el motivo de las que llegaron sin orden (C18).
        (r.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [receptions, search, estadoFiltro, proveedorFiltro, programadaRango]);

  // Opciones de los autofiltros de columna, con su peso (cuántas recepciones).
  const proveedorFaceta = useMemo((): FacetaOpcion[] => {
    const m = new Map<string, number>();
    for (const r of receptions) m.set(r.supplier, (m.get(r.supplier) ?? 0) + 1);
    return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }, [receptions]);
  const estadoFaceta = useMemo((): FacetaOpcion[] => {
    const m = new Map<ReceptionStatus, number>();
    for (const r of receptions) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return (Object.keys(STATUS_MAP) as ReceptionStatus[])
      .filter(k => (m.get(k) ?? 0) > 0)
      .map(k => ({ value: k, count: m.get(k) ?? 0 }));
  }, [receptions]);

  const hayFiltros = estadoFiltro.length > 0 || proveedorFiltro.length > 0 || Boolean(programadaRango.min || programadaRango.max) || search.trim() !== "";
  const limpiar = () => { setSearch(""); setEstadoFiltro([]); setProveedorFiltro([]); setProgramadaRango({ min: null, max: null }); };

  return {
    receptions, setReceptions, loading, search, setSearch, estadoFiltro, setEstadoFiltro,
    proveedorFiltro, setProveedorFiltro, programadaRango, setProgramadaRango, ordenRecepciones,
    products, supplierNames, proveedorIdDe, stats, filtered, proveedorFaceta, estadoFaceta, hayFiltros, limpiar,
  };
}

export type Recepciones = ReturnType<typeof useRecepciones>;
