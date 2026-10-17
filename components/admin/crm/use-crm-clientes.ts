import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";
import type { Rango } from "@/lib/admin/filtros-columna";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { COLS_CRM_CLIENTES, inferSegment, type Customer, type Frecuencia, type Segment } from "@/components/admin/crm/crm-compartido";

/** Los últimos 9 dígitos: «+51 982 519 788», «51982519788» y «982519788» son el mismo celular. */
const claveTelefono = (t: string) => t.replace(/\D/g, "").slice(-9);

/** El teléfono (como lo guarda el CRM) del cliente que pide el enlace, si está en lo cargado. */
function buscarTelefono(clientes: readonly Customer[], v: string): string | undefined {
  const clave = claveTelefono(v);
  return clientes.find((c) => c.phone === v || (clave.length >= 6 && claveTelefono(c.phone ?? "") === clave))?.phone;
}

/** Estado y carga del CRM: clientes con sus compras, filtros, edición de crédito y comparar. Parte de `useCrm`. */
export function useCrmClientes() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const [search, setSearch]           = useState("");
  /*
   * Filtros de la fila de arriba de la tabla (10-10: una sola fila, sin
   * autofiltros en las cabeceras, que repetían lo mismo). Cada uno es multi:
   * OR adentro, AND entre filtros.
   *  · `frecuencia`: compras de los últimos 30 días. Absorbe a «Estado: Activos
   *    / Inactivos 30d», que eran la misma pregunta (activo = compró en 30 días
   *    = Diario + Semanal + Quincenal + Mensual).
   *  · `creditoRango`: «Con deuda» escribe { min: 0,01 }.
   */
  const [frecuencia, setFrecuencia] = useState<Frecuencia[]>([]);
  const [creditoRango, setCreditoRango] = useState<Rango<number>>({ min: null, max: null });
  const [filterSegment, setFilterSegment] = useState<Segment[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [page, setPage]               = useState(1);

  const [detail, setDetalle] = useState<string | null>(null); // phone
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [editingCreditLimit, setEditingCreditLimit] = useState<string | null>(null); // phone
  const [creditLimitInput, setCreditLimitInput] = useState("");
  /* Foco en el límite al entrar en edición, sin `autoFocus` (jsx-a11y/no-autofocus). */
  const creditLimitInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingCreditLimit) creditLimitInputRef.current?.focus();
  }, [editingCreditLimit]);

  // Mejora 13: Comparativa de clientes
  const [compareMode, setCompareMode] = useState(false);
  const [comparePhones, setComparePhones] = useState<Set<string>>(new Set());
  const orden = useOrdenColumnas("crm-clientes", COLS_CRM_CLIENTES);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // ── Load customers ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      /*
       * Las compras de cada cliente las cuenta el servidor (`?compras=1` →
       * CustomersDB.comprasPorCliente): pedidos no cancelados + ventas del POS,
       * lo gastado (entregados + ventas) y las de los últimos 30 días. Antes
       * se pedían /api/orders y /api/sales (tope 500 cada uno) y se contaban
       * acá; «Total gastado» venía de `Customer.totalSpent`, que los pedidos
       * no mueven: S/ 0,00 para un cliente con 9 pedidos.
       */
      const res = await fetch("/api/customers?limit=500&compras=1");
      if (!res.ok) throw new Error("fetch failed");
      const data: (Customer & { compras?: number; gastado?: number; cerradas?: number; ultimaCompra?: string | null; compras30d?: number })[] = await res.json();

      // Annotate with inferred segment and parsed tags
      const annotated = data.map(c => {
        let parsedTags: string[] = [];
        if (c.tags) {
          try {
            const t = JSON.parse(c.tags);
            if (Array.isArray(t)) parsedTags = t;
          } catch { /* ignore */ }
        }
        const conCompras: Customer = {
          ...c,
          totalSpent: c.gastado ?? 0,
          _orderCount: c.compras ?? 0,
          _lastOrder: c.ultimaCompra ?? null,
          _compras30d: c.compras30d ?? 0,
          _cerradas: c.cerradas ?? 0,
        };
        return { ...conCompras, _segment: inferSegment(conCompras), _tags: parsedTags };
      });
      setCustomers(annotated);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* La ficha 360 en la URL (`?cliente=<teléfono>`, lib/admin/enlaces-panel): el teléfono es el
     id del cliente en el panel (/api/customers no expone otro; ⌘K y la tabla usan el mismo). */
  const ficha = useFichaEnUrl("cliente");
  const { abrir: abrirEnUrl, cerrar: cerrarEnUrl } = ficha;
  const setDetail = useCallback((telefono: string | null) => {
    setDetalle(telefono);
    if (telefono) abrirEnUrl(telefono);
    else cerrarEnUrl();
  }, [abrirEnUrl, cerrarEnUrl]);
  useAbrirFichaAlLlegar<string>({
    idEnUrl: ficha.id,
    /* «+51 982…» en la URL y «982…» abierto son el mismo cliente. */
    idAbierto: !detail ? null : ficha.id && buscarTelefono(customers, ficha.id) === detail ? ficha.id : detail,
    listo: !loading && !error,
    buscar: (v) => buscarTelefono(customers, v),
    abrir: setDetalle,
    cerrar: () => setDetalle(null),
    noEsta: (v) => {
      /* Fuera de los 500 que trae la lista: si parece teléfono, la 360 lo busca sola. */
      if (/^\+?\d{6,15}$/.test(v.replace(/[\s-]/g, ""))) { setDetalle(v); return; }
      toast.error("No encontramos ese cliente.");
      cerrarEnUrl();
    },
  });

  return {
    customers, setCustomers, loading, setLoading, error, setError, search, setSearch, frecuencia,
    setFrecuencia, creditoRango, setCreditoRango, filterSegment, setFilterSegment, page, setPage,
    filterTags, setFilterTags, detail, setDetail, showNewClientModal, setShowNewClientModal,
    editingCreditLimit, setEditingCreditLimit, creditLimitInput, setCreditLimitInput,
    creditLimitInputRef, compareMode, setCompareMode, comparePhones,
    setComparePhones, orden, showCompareModal, setShowCompareModal, load,
  };
}
