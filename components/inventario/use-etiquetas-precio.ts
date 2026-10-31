"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import {
  FORMATO_ETIQUETA_PRECIO_DEFAULT,
  armarTanda,
  cambioEsDeHoy,
  cambioEsDeLaSemana,
  cantidadValida,
  etiquetasPedidas,
  hojasNecesarias,
  medidaDeBarras,
  type CambioDePrecio,
  type FormatoEtiquetaPrecio,
  type ProductoEtiquetable,
} from "@/lib/etiquetas/precio";

interface Datos {
  productos: ProductoEtiquetable[];
  cambios: Record<number, CambioDePrecio>;
  ahora: Date;
}

/** Cuántos productos se listan a la vez: con más, se pide afinar la búsqueda. */
export const VISIBLES_MAX = 60;

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Estado de la pantalla de etiquetas de precio: carga, búsqueda, lo elegido
 * (producto → cantidad, en el orden en que se eligió) y la tanda armada.
 */
export function useEtiquetasPrecio() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloElegidos, setSoloElegidos] = useState(false);
  const [elegidos, setElegidos] = useState<ReadonlyMap<number, number>>(new Map());
  const [formato, setFormato] = useState<FormatoEtiquetaPrecio>(FORMATO_ETIQUETA_PRECIO_DEFAULT);
  const [guias, setGuias] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetch("/api/admin/etiquetas-precio", { credentials: "same-origin", cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as
          | { productos?: ProductoEtiquetable[]; cambios?: Record<number, CambioDePrecio>; ahora?: string; error?: string }
          | null;
        if (!r.ok || !json?.productos) throw new Error(json?.error ?? `HTTP ${r.status}`);
        setDatos({ productos: json.productos, cambios: json.cambios ?? {}, ahora: new Date(json.ahora ?? Date.now()) });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[etiquetas-precio] no cargó", { error: String(err) });
        setError("No pudimos traer tus productos. Revisa tu conexión y vuelve a intentar.");
      });
    return () => ctrl.abort();
  }, [recarga]);

  const productos = useMemo(() => datos?.productos ?? [], [datos]);
  const cambios = useMemo(() => datos?.cambios ?? {}, [datos]);
  const ahora = datos?.ahora;

  const categorias = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const p of productos) cuenta.set(p.categoria, (cuenta.get(p.categoria) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([nombre, n]) => ({ nombre, n }));
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return productos.filter((p) => {
      if (soloElegidos && !elegidos.has(p.id)) return false;
      if (categoria && p.categoria !== categoria) return false;
      if (!q) return true;
      return [p.nombre, p.marca, p.barcode, p.sku].some((v) => !!v && normalizar(v).includes(q));
    });
  }, [productos, busqueda, categoria, soloElegidos, elegidos]);

  const cambiadosHoy = useMemo(
    () => (ahora ? productos.filter((p) => cambioEsDeHoy(cambios[p.id], ahora)).map((p) => p.id) : []),
    [productos, cambios, ahora],
  );
  const cambiadosSemana = useMemo(
    () => (ahora ? productos.filter((p) => cambioEsDeLaSemana(cambios[p.id], ahora)).map((p) => p.id) : []),
    [productos, cambios, ahora],
  );

  const pedidos = useMemo(() => [...elegidos].map(([productoId, cantidad]) => ({ productoId, cantidad })), [elegidos]);
  const tanda = useMemo(
    () => (ahora ? armarTanda(productos, pedidos, cambios, ahora) : []),
    [productos, pedidos, cambios, ahora],
  );
  /** Lo pedido antes del tope: si pasa de ETIQUETAS_MAX, la pantalla avisa cuántas quedan fuera. */
  const pedidas = useMemo(() => etiquetasPedidas(productos, pedidos), [productos, pedidos]);

  /** Productos elegidos sin código, o con uno que en este formato sale muy fino. */
  const avisos = useMemo(() => {
    const porId = new Map(tanda.map((e) => [e.productoId, e]));
    let sinCodigo = 0;
    let muyLargo = 0;
    for (const e of porId.values()) {
      if (!e.codigo) sinCodigo++;
      else if (!medidaDeBarras(e.codigo, formato).legible) muyLargo++;
    }
    return {
      sinCodigo,
      muyLargo,
      conSku: [...porId.values()].filter((e) => e.origenCodigo === "sku").length,
      recortadas: Math.max(pedidas - tanda.length, 0),
      pedidas,
    };
  }, [tanda, formato, pedidas]);

  const alternar = useCallback((id: number) => {
    setElegidos((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }, []);

  const fijarCantidad = useCallback((id: number, cantidad: number) => {
    setElegidos((prev) => {
      const next = new Map(prev);
      const n = cantidadValida(cantidad);
      if (n === 0) next.delete(id);
      else next.set(id, n);
      return next;
    });
  }, []);

  /** Suma varios de una vez (categoría, cambiados hoy); los que ya estaban conservan su cantidad. */
  const agregarVarios = useCallback((ids: readonly number[]) => {
    setElegidos((prev) => {
      const next = new Map(prev);
      for (const id of ids) if (!next.has(id)) next.set(id, 1);
      return next;
    });
  }, []);

  const vaciar = useCallback(() => {
    setElegidos(new Map());
    setSoloElegidos(false);
  }, []);

  return {
    cargando: !datos && !error,
    error,
    reintentar: () => setRecarga((n) => n + 1),
    productos,
    cambios,
    ahora,
    categorias,
    filtrados,
    visibles: filtrados.slice(0, VISIBLES_MAX),
    busqueda, setBusqueda,
    categoria, setCategoria,
    soloElegidos, setSoloElegidos,
    elegidos, alternar, fijarCantidad, agregarVarios, vaciar,
    formato, setFormato,
    guias, setGuias,
    cambiadosHoy, cambiadosSemana,
    tanda,
    hojas: hojasNecesarias(tanda.length, formato),
    avisos,
  };
}

export type EstadoEtiquetasPrecio = ReturnType<typeof useEtiquetasPrecio>;
