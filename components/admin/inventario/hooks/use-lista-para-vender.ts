"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { buscarPorCodigo } from "@/components/admin/pos/usePOSLectorCodigo";
import { contarFaltas, productoConElCodigo, sugerirSinCodigo, type ProductoDeLista } from "@/lib/inventario/lista-para-vender";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

export type Lectura =
  | { tipo: "existe"; productoId: number; codigo: string }
  | { tipo: "nuevo"; codigo: string };

/**
 * Datos y acciones de «Lista para vender»: los contadores, la lectura de un
 * código (lector USB o cámara) y completar el producto leído. Escribe por la
 * misma ruta que la ventana de editar (`PUT /api/products/[id]`) con SÓLO el
 * campo que completa; el costo reusa `guardarCosto` de la fila.
 */
export function useListaParaVender(inv: Inventario) {
  const { products, setProducts, guardarCosto } = inv;
  const [abierto, setAbierto] = useState(false);
  const [camara, setCamara] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lista = products as ProductoDeLista[];
  const conteo = useMemo(() => contarFaltas(lista), [lista]);
  const sugeridos = useMemo(() => sugerirSinCodigo(lista, busqueda), [lista, busqueda]);
  const producto = lectura?.tipo === "existe" ? (products.find((p) => p.id === lectura.productoId) ?? null) : null;

  const leer = useCallback((crudo: string) => {
    const codigo = crudo.trim();
    if (!codigo) return;
    setError(null);
    setBusqueda("");
    const hallado = buscarPorCodigo(lista, codigo);
    setLectura(hallado ? { tipo: "existe", productoId: hallado.id, codigo } : { tipo: "nuevo", codigo });
  }, [lista]);

  const limpiar = useCallback(() => { setLectura(null); setError(null); setBusqueda(""); }, []);

  /** PUT con un solo campo; devuelve el error en una frase o null. */
  const poner = useCallback(async (id: number, campos: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(campos) });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) return res.status === 401 || res.status === 403 ? "No tienes permiso para editar productos" : (json?.error ?? `No se guardó (HTTP ${res.status})`);
      setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...campos } : x)));
      return null;
    } catch (err) {
      console.error("[ListaParaVender] guardar falló", err);
      return "Sin conexión: reintenta";
    }
  }, [setProducts]);

  /** Le pone el código leído a un producto sin código. Rechaza uno repetido con el nombre de quien lo tiene. */
  const asignarCodigo = useCallback(async (id: number, codigo: string) => {
    const dueno = productoConElCodigo(lista, codigo, id);
    if (dueno) { setError(`Ese código ya lo tiene «${dueno.name}»`); return false; }
    const fallo = await poner(id, { barcode: codigo.trim() });
    if (fallo) { setError(fallo); return false; }
    const nombre = products.find((p) => p.id === id)?.name ?? "Producto";
    toast.success(`${nombre}: código guardado`);
    setError(null);
    setLectura({ tipo: "existe", productoId: id, codigo: codigo.trim() });
    return true;
  }, [lista, poner, products]);

  /** Activa el control de stock con la cantidad que hay hoy (un producto sin control no descuenta en la caja). */
  const activarControl = useCallback(async (id: number, cantidad: number) => {
    const fallo = await poner(id, { stock: cantidad });
    if (fallo) { setError(fallo); return false; }
    setError(null);
    return true;
  }, [poner]);

  return { abierto, setAbierto, camara, setCamara, lectura, leer, limpiar, busqueda, setBusqueda, error, setError, conteo, sugeridos, producto, asignarCodigo, activarControl, guardarCosto };
}

export type ListaParaVender = ReturnType<typeof useListaParaVender>;
