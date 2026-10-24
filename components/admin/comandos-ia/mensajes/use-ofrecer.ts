"use client";

/**
 * «Ofrécele algo» (Comandos › A quién escribir): buscar al cliente, traer lo
 * que le recomienda el negocio y armar el mensaje SIN IA. Nada se envía solo.
 *
 * Venía de Sugerencias IA › Para clientes (TabClientes, 10-10). Dos arreglos al
 * mudarlo: el buscador mandaba `?search=` y la ruta lee `?q=` (salían los 10
 * primeros clientes escribieras lo que escribieras), y las recomendaciones
 * llegan con `id` (no `productId`) y el precio como texto (Decimal).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import { waLink } from "@/lib/whatsapp-link";

export interface ClienteOfrecer {
  phone: string;
  name: string;
  totalSpent: number | null;
}

export interface ProductoOfrecer {
  id: string;
  name: string;
  price: number;
}

export type Carga = "quieto" | "cargando" | "error" | "listo";

const MINIMO_BUSQUEDA = 2;
const ESPERA_MS = 300;
/** Cuántos productos van marcados al elegir al cliente (los primeros, que son los más afines). */
const PRESELECCION = 3;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function aCliente(x: unknown): ClienteOfrecer | null {
  if (!esObjeto(x) || typeof x.phone !== "string" || typeof x.name !== "string") return null;
  const total = Number(x.totalSpent);
  return { phone: x.phone, name: x.name, totalSpent: Number.isFinite(total) ? total : null };
}

function aProducto(x: unknown): ProductoOfrecer | null {
  if (!esObjeto(x) || typeof x.name !== "string") return null;
  const precio = Number(x.price);
  if (x.id == null || !Number.isFinite(precio)) return null;
  return { id: String(x.id), name: x.name, price: precio };
}

function lista<T>(json: unknown, convertir: (x: unknown) => T | null): T[] {
  const filas = Array.isArray(json) ? json : [];
  return filas.map(convertir).filter((v): v is T => v !== null);
}

/** «Hola Ana, pensé en ti: …». El primer nombre, una línea por producto y la pregunta de cierre. */
export function armarMensaje(nombre: string, productos: ProductoOfrecer[]): string {
  if (productos.length === 0) return "";
  const primero = nombre.trim().split(/\s+/)[0] ?? "";
  const lineas = productos.map((p) => `• ${p.name} — ${formatCurrency(p.price)}`).join("\n");
  return `Hola ${primero}, pensé en ti. Te pueden interesar:\n\n${lineas}\n\n¿Te separo algo?`;
}

export function useOfrecer() {
  const [texto, setTexto] = useState("");
  const [clientes, setClientes] = useState<ClienteOfrecer[]>([]);
  const [busqueda, setBusqueda] = useState<Carga>("quieto");
  const [cliente, setCliente] = useState<ClienteOfrecer | null>(null);
  const [productos, setProductos] = useState<ProductoOfrecer[]>([]);
  const [recs, setRecs] = useState<Carga>("quieto");
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  /** El mensaje que el usuario corrigió a mano; `null` = el armado. */
  const [editado, setEditado] = useState<string | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedidoBusqueda = useRef<AbortController | null>(null);
  const pedidoRecs = useRef<AbortController | null>(null);

  // Al desmontar: nada que llegue tarde escribe en un componente que ya no está.
  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
      pedidoBusqueda.current?.abort();
      pedidoRecs.current?.abort();
    },
    [],
  );

  const buscar = useCallback(async (q: string) => {
    pedidoBusqueda.current?.abort();
    const ctrl = new AbortController();
    pedidoBusqueda.current = ctrl;
    setBusqueda("cargando");
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=10`, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (ctrl.signal.aborted) return;
      setClientes(lista(json, aCliente));
      setBusqueda("listo");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setClientes([]);
      setBusqueda("error");
      // El estado de error ya se ve; esto queda para el soporte.
      logger.warn("[ofrecele-algo] búsqueda falló", { error: String(err) });
    }
  }, []);

  const cambiarTexto = useCallback(
    (valor: string) => {
      setTexto(valor);
      if (reloj.current) clearTimeout(reloj.current);
      const q = valor.trim();
      if (q.length < MINIMO_BUSQUEDA) {
        pedidoBusqueda.current?.abort();
        setClientes([]);
        setBusqueda("quieto");
        return;
      }
      reloj.current = setTimeout(() => void buscar(q), ESPERA_MS);
    },
    [buscar],
  );

  const reintentarBusqueda = useCallback(() => {
    const q = texto.trim();
    if (q.length >= MINIMO_BUSQUEDA) void buscar(q);
  }, [buscar, texto]);

  const traerRecs = useCallback(async (c: ClienteOfrecer) => {
    pedidoRecs.current?.abort();
    const ctrl = new AbortController();
    pedidoRecs.current = ctrl;
    setRecs("cargando");
    setProductos([]);
    setMarcados(new Set());
    setEditado(null);
    try {
      const res = await fetch(`/api/recommendations?phone=${encodeURIComponent(c.phone)}&limit=8`, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (ctrl.signal.aborted) return;
      const filas = lista(json, aProducto);
      setProductos(filas);
      setMarcados(new Set(filas.slice(0, PRESELECCION).map((p) => p.id)));
      setRecs("listo");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setRecs("error");
      logger.warn("[ofrecele-algo] recomendaciones fallaron", { error: String(err) });
    }
  }, []);

  const elegir = useCallback(
    (c: ClienteOfrecer) => {
      if (reloj.current) clearTimeout(reloj.current);
      pedidoBusqueda.current?.abort();
      setCliente(c);
      setClientes([]);
      setBusqueda("quieto");
      void traerRecs(c);
    },
    [traerRecs],
  );

  const soltar = useCallback(() => {
    pedidoRecs.current?.abort();
    setCliente(null);
    setProductos([]);
    setRecs("quieto");
    setEditado(null);
    setTexto("");
  }, []);

  const reintentarRecs = useCallback(() => {
    if (cliente) void traerRecs(cliente);
  }, [cliente, traerRecs]);

  // Marcar o desmarcar NO pisa lo que corregiste a mano: para volver al armado está «Rehacer mensaje».
  const alternar = useCallback((id: string) => {
    setMarcados((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });
  }, []);

  const armado = useMemo(
    () => (cliente ? armarMensaje(cliente.name, productos.filter((p) => marcados.has(p.id))) : ""),
    [cliente, productos, marcados],
  );
  const mensaje = editado ?? armado;
  /** Corregiste el texto y ya no coincide con lo marcado: se ofrece rehacerlo. */
  const editadoAMano = editado !== null && editado !== armado;
  const rehacer = useCallback(() => setEditado(null), []);
  const enlace = cliente && mensaje.trim() ? waLink(cliente.phone, mensaje) : null;

  return {
    texto, cambiarTexto, clientes, busqueda, reintentarBusqueda,
    cliente, elegir, soltar,
    productos, recs, reintentarRecs, marcados, alternar,
    mensaje, cambiarMensaje: setEditado, editadoAMano, rehacer, enlace,
    minimoBusqueda: MINIMO_BUSQUEDA,
  };
}
