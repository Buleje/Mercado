import { useEffect, useCallback, useMemo } from "react";
import { leFalta } from "@/lib/inventario/catalogo-incompleto";
import type { DbProduct } from "@/lib/jsondb";
import { usePagination } from "@/hooks/use-pagination";
import { formatDateShort } from "@/lib/format";
import { enRango, rangoActivo, textoDeRango, type ChipFiltro } from "@/lib/admin/filtros-columna";
import { realCategories, claveCategoria, coincideBusqueda, textoDeCategoria } from "@/components/admin/inventario/inventario-compartido";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";
import { useInventarioMasivo } from "@/components/admin/inventario/hooks/use-inventario-masivo";
import { useInventarioPedidos } from "@/components/admin/inventario/hooks/use-inventario-pedidos";

/** Categorías, filtros de columna y paginación. Parte de `useInventario`. */
export function useInventarioFiltros(previo: ReturnType<typeof useInventarioEstado> & ReturnType<typeof useInventarioCarga> & ReturnType<typeof useInventarioImagenes> & ReturnType<typeof useInventarioMasivo> & ReturnType<typeof useInventarioPedidos>) {
  const {
    products, movements, search, catFilter, setCatFilter, catalogoCategorias, lowOnly, estadoFiltro,
    setEstadoFiltro, showInactive, stockRango, setStockRango, vencRango, setVencRango, noImageOnly,
    faltaDato, showAdd, addForm, setAddForm, isLowStock,
  } = previo;
  // ── Dynamic categories — derivadas del inventario real ─────────────────
  // En lugar de la lista hardcodeada de data/products.ts, calculamos las
  // categorías que efectivamente tienen productos (con conteo). Si el
  // catálogo del tenant no tiene "carnes" pero sí "panadería", solo se
  // muestra panadería. Mantenemos siempre "Todos" como primer chip.
  /* El nombre de cada categoría, por su clave normalizada (10-10): sale del
     catálogo unido (`/api/admin/categorias`): su id, su nombre y los textos
     que usan sus productos caen en la MISMA clave. «abarrotes» y «Abarrotes»
     ya no son dos pastillas. */
  const etiquetaPorClave = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalogoCategorias) {
      for (const v of [c.id, c.label, ...c.valores]) {
        const k = claveCategoria(v);
        if (v && !m.has(k)) m.set(k, c.label);
      }
    }
    return m;
  }, [catalogoCategorias]);
  const humanize = useCallback((clave: string) => {
    const delCatalogo = etiquetaPorClave.get(clave);
    if (delCatalogo) return delCatalogo;
    const known = realCategories.find(rc => claveCategoria(rc.id) === clave);
    if (known) return known.label;
    return clave
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(t => t.charAt(0).toUpperCase() + t.slice(1))
      .join(" ") || "Otros";
  }, [etiquetaPorClave]);

  // Las categorías con productos (con conteo), para el filtro. «Todos» primero.
  const dynamicCategories = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    products.forEach(p => {
      if (!showInactive && !p.active) return;
      const cat = claveCategoria(p.category);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
      total++;
    });
    const real = Array.from(counts.entries())
      .map(([id, count]) => ({ id, label: humanize(id), count }))
      .sort((a, b) => b.count - a.count);
    return [
      { id: "todos", label: "Todos", count: total },
      ...real,
    ];
  }, [products, showInactive, humanize]);

  /* Ley de Brandon (2026-10-01): 24 pastillas de categoría eran 24 botones a la
     vista. Quedan «Todos» + las más grandes + las que están elegidas (nunca se
     esconde un filtro activo); el resto va a «Más categorías». */
  const CATEGORIAS_A_LA_VISTA = 8;
  const { chipsVisibles, chipsEnMenu } = useMemo(() => {
    const visibles: typeof dynamicCategories = [];
    const enMenu: typeof dynamicCategories = [];
    dynamicCategories.forEach((c, i) => {
      if (i < CATEGORIAS_A_LA_VISTA || catFilter.includes(c.id)) visibles.push(c);
      else enMenu.push(c);
    });
    return { chipsVisibles: visibles, chipsEnMenu: enMenu };
  }, [dynamicCategories, catFilter]);

  /* Categorías ASIGNABLES en el formulario (10-10): las visibles del catálogo
     unido; se MUESTRA el nombre y se GUARDA el texto que ya usan sus productos
     (`textoDeCategoria`: la tienda agrupa por ese texto tal cual). Las ocultas
     no se ofrecen; un producto que ya está en una oculta la conserva
     (el formulario la muestra aparte). Sin catálogo: las de los productos. */
  const formCategories = useMemo(() => {
    // Toda clave que ya es de una categoría del catálogo (su id, su nombre y
    // los textos de sus productos): no se vuelve a ofrecer suelta.
    const delCatalogo = new Set(catalogoCategorias.flatMap(c => [c.id, c.label, ...c.valores].map(v => claveCategoria(v))));
    // Valor = el texto que ya usan sus productos (lo que se guarda); rótulo = el nombre.
    const map = new Map<string, { id: string; label: string }>();
    for (const c of catalogoCategorias) {
      if (c.visible) map.set(claveCategoria(c.label), { id: textoDeCategoria(c, products), label: c.label });
    }
    for (const c of dynamicCategories) {
      if (c.id === "todos" || map.has(c.id) || delCatalogo.has(c.id)) continue;
      map.set(c.id, { id: textoDeCategoria({ id: c.id, label: c.label, valores: [] }, products), label: c.label });
    }
    const arr = Array.from(map.values());
    return arr.length ? arr : [{ id: "General", label: "General" }];
  }, [catalogoCategorias, dynamicCategories, products]);

  /** La opción del formulario que corresponde a un texto de categoría (sin mirar mayúsculas ni tildes). */
  const opcionDeCategoria = useCallback((texto: string | null | undefined) => {
    if (!texto || !texto.trim()) return undefined;
    // Por el catálogo («snacks» puede ser un texto de «Piqueos»), por el valor o por el nombre.
    const k = claveCategoria(etiquetaPorClave.get(claveCategoria(texto)) ?? texto);
    const directo = claveCategoria(texto);
    return formCategories.find(c => claveCategoria(c.label) === k || claveCategoria(c.id) === directo);
  }, [formCategories, etiquetaPorClave]);

  // Nombre legible de una categoría guardada en un producto (cualquier escritura).
  const catLabelOf = useCallback((id: string): string => {
    if (!id) return "Sin categoría";
    return humanize(claveCategoria(id));
  }, [humanize]);

  // Default de categoría al abrir el alta: primera categoría real del comercio.
  // EMPTY_ADD nace con category="" (las categorías cargan async).
  // Al abrir el alta: sin categoría → la primera; con una que ya existe con
  // otra escritura (duplicar «abarrotes») → el nombre de la existente.
  useEffect(() => {
    if (!showAdd) return;
    if (!addForm.category) {
      setAddForm(f => ({ ...f, category: formCategories[0]?.id ?? "General" }));
      return;
    }
    const opcion = opcionDeCategoria(addForm.category);
    if (opcion && opcion.id !== addForm.category) setAddForm(f => ({ ...f, category: opcion.id }));
  }, [showAdd, formCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si alguna categoría elegida ya no existe en el inventario (p.ej.
  // eliminaron todos sus productos), se saca del filtro — no se resetea TODO
  // el filtro por una sola categoría muerta (antes con sentinela "todos" no
  // había otra opción).
  useEffect(() => {
    if (catFilter.length === 0) return;
    const validos = new Set(dynamicCategories.map(c => c.id));
    const limpio = catFilter.filter(id => validos.has(id));
    if (limpio.length !== catFilter.length) setCatFilter(limpio);
  }, [dynamicCategories, catFilter, setCatFilter]);

  // ── Filtered ───────────────────────────────────────────────────────────────

  const noImageCount = products.filter(p => !p.image || p.image === "").length;
  const expiryOf = (p: DbProduct) => {
    const conFechas = p as DbProduct & { expiryDate?: string; expiresAt?: string | null };
    // Sólo el día: `expiresAt` llega con hora («2026-10-16T00:00:00.000Z») y
    // comparado como texto contra «2026-10-16» quedaba fuera del rango; el que
    // vence el día +7 no salía en la lista aunque Inicio sí lo contaba.
    const fecha = conFechas.expiryDate ?? conFechas.expiresAt ?? null;
    return fecha ? fecha.slice(0, 10) : null;
  };

  const filteredProducts = products.filter(p => {
    // Único filtro de Estado (antes: booleano `showInactive` + este mismo
    // chequeo por separado). `estadoFiltro` vacío = todos, como cualquier
    // otro autofiltro de columna.
    if (estadoFiltro.length > 0 && !estadoFiltro.includes(p.active ? "Activo" : "Inactivo")) return false;
    if (catFilter.length > 0 && !catFilter.includes(claveCategoria(p.category))) return false;
    if (lowOnly && !isLowStock(p)) return false;
    if (!enRango(p.stock ?? null, stockRango)) return false;
    if (!enRango(expiryOf(p), vencRango)) return false;
    // Mejora 8R2: Filtro sin imagen
    if (noImageOnly && p.image && p.image !== "") return false;
    if (faltaDato && !leFalta(p, faltaDato)) return false;
    return coincideBusqueda(p, search);
  });

  const filteredMovements = movements.filter(m => {
    if (search) {
      const product = products.find(p => p.id === m.productId);
      return product?.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  /**
   * Los filtros de columna puestos, como chips con cruz ARRIBA de la tabla.
   * Es el control que rescata al filtro huérfano: «Vence» sólo se ve con
   * «Más columnas», y si se apaga con un rango puesto la tabla quedaría
   * acotada sin nada visible que lo saque. El Estado por defecto («Activo»)
   * no se lista: es lo de siempre, no un acotamiento que puso el operador.
   */
  const fechaCorta = (v: number | string) =>
    formatDateShort(`${v}T00:00:00Z`, { soloFecha: true });
  const chipsDeColumna: ChipFiltro[] = [
    ...(catFilter.length > 0
      ? [{
          id: "categoria",
          label: "Categoría",
          texto: catFilter.length === 1
            ? (dynamicCategories.find(c => c.id === catFilter[0])?.label ?? catFilter[0])
            : `Categoría: ${catFilter.length} elegidas`,
        }]
      : []),
    ...(estadoFiltro.length > 0 && !(estadoFiltro.length === 1 && estadoFiltro[0] === "Activo")
      ? [{ id: "estado", label: "Estado", texto: estadoFiltro.length === 1 ? estadoFiltro[0] : "Estado: activos e inactivos" }]
      : []),
    ...(rangoActivo(stockRango) ? [{ id: "stock", label: "Stock", texto: textoDeRango("Stock", stockRango) }] : []),
    ...(rangoActivo(vencRango) ? [{ id: "vence", label: "Vence", texto: textoDeRango("Vence", vencRango, { formatear: fechaCorta }) }] : []),
  ];
  const quitarChip = (id: string) => {
    if (id === "categoria") setCatFilter([]);
    else if (id === "estado") setEstadoFiltro(["Activo"]);
    else if (id === "stock") setStockRango({ min: null, max: null });
    else if (id === "vence") setVencRango({ min: null, max: null });
  };

  const pgProducts = usePagination(filteredProducts, 50);
  const pgMovements = usePagination(filteredMovements, 50);

  // Reset pagination when filters change
  useEffect(() => { pgProducts.reset(); }, [search, catFilter, estadoFiltro, stockRango, vencRango, lowOnly, noImageOnly, faltaDato]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pgMovements.reset(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    dynamicCategories, CATEGORIAS_A_LA_VISTA, chipsVisibles, chipsEnMenu, formCategories, catLabelOf, opcionDeCategoria,
    noImageCount, expiryOf, filteredProducts, filteredMovements, fechaCorta, chipsDeColumna,
    quitarChip, pgProducts, pgMovements,
  };
}
