import { leerJson, sinDato } from "@/lib/errores/sin-dato";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useAbrirFichaAlLlegar } from "@/hooks/use-abrir-ficha-al-llegar";
import type { Rango } from "@/lib/admin/filtros-columna";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { COLS_CRM_CLIENTES, inferSegment, type Customer, type Segment, type FrequencyFilter } from "@/components/admin/crm/crm-compartido";

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
  // Filtros en la cabecera, estilo Excel (Brandon, 2026-09-03/22): un solo
  // estado por columna — las pastillas de abajo y el autofiltro del `<th>`
  // escriben lo mismo, no dos filtros distintos.
  //
  // `quickFilter` era UN estado excluyente para tres preguntas de DOS columnas
  // distintas (actividad de "Último pedido" y deuda de "Crédito"): se separa
  // en dos, y las pastillas de abajo pasan a ser un atajo que escribe ambos a
  // la vez (mismo look excluyente de siempre) en vez de la fuente de verdad.
  const [actividadFiltro, setActividadFiltro] = useState<string[]>([]);
  const [creditoRango, setCreditoRango] = useState<Rango<number>>({ min: null, max: null });
  // Segmento: multi (antes un solo valor a la vez).
  const [filterSegment, setFilterSegment] = useState<Segment[]>([]);
  const [page, setPage]               = useState(1);

  const [filterTag, setFilterTag] = useState<string>("todos");

  const [detail, setDetalle] = useState<string | null>(null); // phone
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [editingCreditLimit, setEditingCreditLimit] = useState<string | null>(null); // phone
  const [creditLimitInput, setCreditLimitInput] = useState("");
  /* Foco en el límite al entrar en edición, sin `autoFocus` (jsx-a11y/no-autofocus). */
  const creditLimitInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingCreditLimit) creditLimitInputRef.current?.focus();
  }, [editingCreditLimit]);

  // Mejora nueva 7: Frecuencia de compra
  const [freqFilter, setFreqFilter] = useState<FrequencyFilter>("todos-freq");

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
       * `_orderCount` y `_lastOrder` decían «Populated client-side from
       * /orders» desde siempre, y NADIE los llenaba: sólo se pedía
       * /api/customers. Con los dos en `undefined`, `inferSegment` corta en su
       * primera línea —`_orderCount ?? 0 === 0` → «nuevo»— y toda la
       * segmentación quedaba muerta: TODOS los clientes «nuevo», Frecuente /
       * Ocasional / Perdido vacíos para siempre, «Activos (30d)» clavado en 0
       * y la columna de última compra en blanco. No dependía de los datos: con
       * cualquier tenant daba lo mismo.
       *
       * Cuenta también la venta de mostrador, no sólo el pedido: para el dueño
       * el cliente que vino ayer a la bodega compró igual que el que pidió por
       * la app. Las dos listas son secundarias — si fallan, se pierde la
       * segmentación pero la lista de clientes se muestra igual.
       */
      const [res, resPedidos, resVentas] = await Promise.all([
        fetch("/api/customers?limit=500"),
        fetch("/api/orders?limit=500").catch(sinDato("CRM /api/orders")),
        fetch("/api/sales?limit=500").catch(sinDato("CRM /api/sales")),
      ]);
      if (!res.ok) throw new Error("fetch failed");
      const data: Customer[] = await res.json();

      const compras = new Map<string, { n: number; ultima: string }>();
      const anotarCompra = (telefono: unknown, fecha: unknown) => {
        const tel = typeof telefono === "string" ? telefono.trim() : "";
        const iso = typeof fecha === "string" ? fecha : "";
        if (!tel || !iso) return;
        const previo = compras.get(tel);
        compras.set(tel, {
          n: (previo?.n ?? 0) + 1,
          ultima: !previo || iso > previo.ultima ? iso : previo.ultima,
        });
      };
      const leerLista = async (r: Response | null): Promise<unknown[]> => {
        if (!r?.ok) return [];
        const j = await leerJson(r);
        if (Array.isArray(j)) return j;
        const cont = j as { orders?: unknown[]; sales?: unknown[]; items?: unknown[] } | null;
        return cont?.orders ?? cont?.sales ?? cont?.items ?? [];
      };
      for (const o of await leerLista(resPedidos)) {
        const p = o as { customer?: { phone?: string }; customerPhone?: string; createdAt?: string };
        anotarCompra(p.customer?.phone ?? p.customerPhone, p.createdAt);
      }
      for (const v of await leerLista(resVentas)) {
        const p = v as { customerPhone?: string; createdAt?: string; date?: string };
        anotarCompra(p.customerPhone, p.createdAt ?? p.date);
      }

      // Annotate with inferred segment and parsed tags
      const annotated = data.map(c => {
        let parsedTags: string[] = [];
        if (c.tags) {
          try {
            const t = JSON.parse(c.tags);
            if (Array.isArray(t)) parsedTags = t;
          } catch { /* ignore */ }
        }
        const compra = compras.get((c.phone ?? "").trim());
        const conCompras = { ...c, _orderCount: compra?.n ?? 0, _lastOrder: compra?.ultima ?? null };
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
    customers, setCustomers, loading, setLoading, error, setError, search, setSearch, actividadFiltro,
    setActividadFiltro, creditoRango, setCreditoRango, filterSegment, setFilterSegment, page, setPage,
    filterTag, setFilterTag, detail, setDetail, showNewClientModal, setShowNewClientModal,
    editingCreditLimit, setEditingCreditLimit, creditLimitInput, setCreditLimitInput,
    creditLimitInputRef, freqFilter, setFreqFilter, compareMode, setCompareMode, comparePhones,
    setComparePhones, orden, showCompareModal, setShowCompareModal, load,
  };
}
