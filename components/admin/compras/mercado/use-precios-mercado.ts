"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fusionarMercado,
  MERCADO_VACIO,
  normalizarMercado,
  type DatosMercado,
  type PrecioVisto,
} from "@/lib/compras/mercado";

/**
 * Dónde viven los precios del mercado (C38): en este navegador (como siempre)
 * o compartidos con el equipo (`/api/compras/mercado`). El modo se recuerda en
 * el navegador; la lista local se conserva aunque compartas, como respaldo.
 *
 * En equipo cada cambio se guarda en fila, con la versión que se leyó: si otra
 * persona guardó antes, el servidor no pisa nada y acá se recarga lo último.
 */

const LS_DATOS = "buleje-competitor-prices";
const LS_MODO = "buleje-competitor-prices-modo";

export type ModoMercado = "local" | "equipo";

export interface QuienGuardo {
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

interface DocEquipo extends QuienGuardo {
  datos: unknown;
  version: number;
}

function leerLocal(): DatosMercado {
  try {
    return normalizarMercado(JSON.parse(localStorage.getItem(LS_DATOS) ?? "null"));
  } catch {
    return { ...MERCADO_VACIO };
  }
}

function guardarLocal(d: DatosMercado) {
  try {
    localStorage.setItem(LS_DATOS, JSON.stringify(d));
  } catch (err) {
    console.warn("[precios-mercado] no se pudo guardar en el navegador", err);
  }
}

async function pedir(metodo: "GET" | "PUT", cuerpo?: unknown): Promise<{ status: number; doc: DocEquipo | null; conflicto: DocEquipo | null }> {
  const r = await fetch("/api/compras/mercado", {
    method: metodo,
    cache: "no-store",
    ...(cuerpo ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : {}),
  });
  const json = (await r.json().catch(() => null)) as (DocEquipo & { conflicto?: DocEquipo }) | null;
  if (r.status === 409) return { status: 409, doc: null, conflicto: json?.conflicto ?? null };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { status: r.status, doc: json, conflicto: null };
}

const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const mismoNombre = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function usePreciosMercado() {
  const [modo, setModo] = useState<ModoMercado>("local");
  const [datos, setDatos] = useState<DatosMercado>(MERCADO_VACIO);
  const [quien, setQuien] = useState<QuienGuardo>({ actualizadoEn: null, actualizadoPor: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const datosRef = useRef(datos);
  const versionRef = useRef(0);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const enFila = useRef(0);

  const aplicarDoc = useCallback((doc: DocEquipo) => {
    const d = normalizarMercado(doc.datos);
    datosRef.current = d;
    versionRef.current = doc.version;
    setDatos(d);
    setQuien({ actualizadoEn: doc.actualizadoEn, actualizadoPor: doc.actualizadoPor });
  }, []);

  const traerEquipo = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { doc } = await pedir("GET");
      if (doc) aplicarDoc(doc);
    } catch (err) {
      console.warn("[precios-mercado] GET falló", err);
      setError("No se pudo traer la lista de tu equipo.");
    } finally {
      setCargando(false);
    }
  }, [aplicarDoc]);

  useEffect(() => {
    const m: ModoMercado = localStorage.getItem(LS_MODO) === "equipo" ? "equipo" : "local";
    setModo(m);
    if (m === "equipo") {
      void traerEquipo();
    } else {
      const d = leerLocal();
      datosRef.current = d;
      setDatos(d);
      setCargando(false);
    }
  }, [traerEquipo]);

  /** Aplica un cambio y lo guarda donde corresponde (en equipo, en fila). */
  const cambiar = useCallback((fn: (d: DatosMercado) => DatosMercado) => {
    const next = fn(datosRef.current);
    datosRef.current = next;
    setDatos(next);
    if (modo === "local") { guardarLocal(next); return; }
    enFila.current += 1;
    setGuardando(true);
    cola.current = cola.current
      .then(async () => {
        // Se manda lo último (incluye los cambios anteriores aún en fila) con la versión vigente.
        const r = await pedir("PUT", { datos: datosRef.current, version: versionRef.current });
        if (r.doc) aplicarDoc(r.doc);
        else if (r.conflicto) {
          aplicarDoc(r.conflicto);
          toast.error("Alguien de tu equipo guardó antes. Te mostramos lo último: vuelve a anotar tu cambio.");
        }
      })
      .catch((err: unknown) => {
        console.warn("[precios-mercado] PUT falló", err);
        toast.error("No se guardó el cambio. Revisa tu conexión: te traemos lo último del equipo.");
        void traerEquipo();
      })
      .finally(() => {
        enFila.current -= 1;
        if (enFila.current === 0) setGuardando(false);
      });
  }, [modo, aplicarDoc, traerEquipo]);

  const agregarCompetidor = useCallback((nombre: string): boolean => {
    const name = nombre.trim();
    if (!name || datosRef.current.competitors.some((c) => mismoNombre(c.name, name))) return false;
    cambiar((d) => ({ ...d, competitors: [...d.competitors, { id: nuevoId("comp"), name }] }));
    return true;
  }, [cambiar]);

  const quitarCompetidor = useCallback((id: string) => {
    cambiar((d) => ({
      competitors: d.competitors.filter((c) => c.id !== id),
      products: d.products.map((p) => {
        const prices = { ...p.prices };
        delete prices[id];
        return { ...p, prices };
      }),
    }));
  }, [cambiar]);

  const agregarProducto = useCallback((nombre: string, miPrecio: number): boolean => {
    const productName = nombre.trim();
    if (!productName || datosRef.current.products.some((p) => mismoNombre(p.productName, productName))) return false;
    cambiar((d) => ({
      ...d,
      products: [...d.products, { productId: nuevoId("prod"), productName, myPrice: Math.max(0, miPrecio || 0), prices: {} }],
    }));
    return true;
  }, [cambiar]);

  const quitarProducto = useCallback((productId: string) => {
    cambiar((d) => ({ ...d, products: d.products.filter((p) => p.productId !== productId) }));
  }, [cambiar]);

  const guardarPrecio = useCallback((productId: string, competidorId: string, visto: PrecioVisto | null) => {
    cambiar((d) => ({
      ...d,
      products: d.products.map((p) => (p.productId === productId ? { ...p, prices: { ...p.prices, [competidorId]: visto } } : p)),
    }));
  }, [cambiar]);

  const cambiarMiPrecio = useCallback((productId: string, precio: number) => {
    cambiar((d) => ({
      ...d,
      products: d.products.map((p) => (p.productId === productId ? { ...p, myPrice: Math.max(0, precio || 0) } : p)),
    }));
  }, [cambiar]);

  /** Junta lo de este navegador con lo del equipo y pasa a compartir. */
  const compartir = useCallback(async () => {
    setGuardando(true);
    try {
      const { doc } = await pedir("GET");
      const equipo = normalizarMercado(doc?.datos);
      const unida = fusionarMercado(equipo, datosRef.current);
      const r = await pedir("PUT", { datos: unida, version: doc?.version ?? 0 });
      if (!r.doc) {
        toast.error("Alguien de tu equipo guardó en ese momento. Vuelve a intentarlo.");
        return;
      }
      guardarLocal(datosRef.current);
      aplicarDoc(r.doc);
      localStorage.setItem(LS_MODO, "equipo");
      setModo("equipo");
      toast.success("Listo: tu equipo ve y completa esta lista.");
    } catch (err) {
      console.warn("[precios-mercado] compartir falló", err);
      toast.error("No se pudo compartir la lista. Vuelve a intentarlo.");
    } finally {
      setGuardando(false);
    }
  }, [aplicarDoc]);

  /** Vuelve a trabajar sólo en este navegador con una copia de lo del equipo. */
  const dejarDeCompartir = useCallback(() => {
    guardarLocal(datosRef.current);
    localStorage.setItem(LS_MODO, "local");
    setModo("local");
    toast.success("Ahora la lista es sólo de este navegador. La de tu equipo sigue para los demás.");
  }, []);

  return {
    modo, datos, quien, cargando, error, guardando,
    traerEquipo, agregarCompetidor, quitarCompetidor, agregarProducto, quitarProducto,
    guardarPrecio, cambiarMiPrecio, compartir, dejarDeCompartir,
  };
}

export type PreciosMercado = ReturnType<typeof usePreciosMercado>;
