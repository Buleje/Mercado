"use client";

/**
 * Datos del cuaderno de combustible (ADR-533): trae TODO el cuaderno de una vez
 * (`GET /api/admin/combustible`) y hace las cuentas acá con la misma lógica
 * pura que usa el servidor (`lib/combustible/cuaderno.ts`): el recorrido
 * cilindro por cilindro, el saldo diario, el gal/h de cada vale y el reporte
 * del mes. Un año de cuaderno son ~100 ingresos y unos cientos de vales: cabe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  nivelAlmacen,
  recorrer,
  rendimientoVales,
  reporteDelMes,
  type ConfigCuaderno,
  type NivelAlmacen,
  type Recorrido,
  type RendimientoVale,
  type ReporteMes,
} from "@/lib/combustible/cuaderno";
import type { CuadernoCompleto, MaquinaCuaderno } from "@/lib/db/cuaderno-combustible.db";

export type TipoRenglon = "ingresos" | "vales" | "conteos";

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CuerpoIngreso {
  tipo: "compra" | "inicial";
  fecha: string;
  hora: string | null;
  factura: string | null;
  grifo: string | null;
  grifoRuc: string | null;
  guia: string | null;
  cilindros: number;
  galones: number;
  precioGal: number | null;
  notas: string | null;
  anotarGasto: boolean;
}

export interface CuerpoVale {
  fecha: string;
  hora: string | null;
  maquinaId: string;
  horometro: number | null;
  galones: number;
  operador: string;
  firma: string | null;
  notas: string | null;
}

export interface CuerpoConteo {
  fecha: string;
  hora: string | null;
  cilindros: number;
  galones: number;
  contadoPor: string;
  testigo: string | null;
  notas: string | null;
}

export interface CuadernoCombustible {
  datos: CuadernoCompleto | null;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  rec: Recorrido | null;
  nivel: NivelAlmacen;
  metas: Record<string, number | null>;
  rendimiento: Map<string, RendimientoVale>;
  /** Máquinas activas (las que se pueden elegir en un vale). */
  maquinasActivas: MaquinaCuaderno[];
  /** Días desde el último conteo vigente (null = nunca se contó). */
  diasDesdeConteo: number | null;
  reporte: (anio: number, mes: number) => ReporteMes | null;
  anotarIngreso: (b: CuerpoIngreso) => Promise<Resultado<{ gasto: "nuevo" | "ya-estaba" | null }>>;
  anotarVale: (b: CuerpoVale) => Promise<Resultado<{ deCilindros: string[]; sinRespaldoGal: number }>>;
  anotarConteo: (b: CuerpoConteo) => Promise<Resultado<{ difGal: number; difCil: number }>>;
  guardarAjustes: (c: ConfigCuaderno) => Promise<Resultado<ConfigCuaderno>>;
  anular: (tipo: TipoRenglon, id: string, motivo: string) => Promise<Resultado<unknown>>;
  firmaDeVale: (id: string) => Promise<string | null>;
}

const BASE = "/api/admin/combustible";

async function enviar<T>(url: string, method: "POST" | "PUT" | "DELETE", body: unknown): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
    if (!res.ok) return { ok: false, error: j?.error ?? `No se pudo guardar (${res.status})` };
    return { ok: true, data: j?.data as T };
  } catch (err) {
    logger.error("[combustible] enviar failed", { url, error: String(err) });
    return { ok: false, error: "Sin conexión: intenta de nuevo" };
  }
}

export function useCuadernoCombustible(): CuadernoCombustible {
  const [datos, setDatos] = useState<CuadernoCompleto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cuándo llegaron los datos: «hace cuántos días se contó» se mide contra esto (Date.now en el render es impuro). */
  const [cargadoEn, setCargadoEn] = useState(0);

  const recargar = useCallback(async () => {
    try {
      const res = await fetch(BASE, { credentials: "include" });
      const j = (await res.json().catch(() => null)) as { data?: CuadernoCompleto; error?: string } | null;
      if (!res.ok || !j?.data) {
        setError(j?.error ?? `No se pudo cargar el cuaderno (${res.status})`);
        return;
      }
      setDatos(j.data);
      setCargadoEn(Date.now());
      setError(null);
    } catch (err) {
      logger.error("[combustible] cargar failed", { error: String(err) });
      setError("Sin conexión: no se pudo cargar el cuaderno");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const rec = useMemo(() => (datos ? recorrer(datos) : null), [datos]);
  const metas = useMemo(() => Object.fromEntries((datos?.maquinas ?? []).map((m) => [m.id, m.meta])), [datos]);
  const rendimiento = useMemo(() => rendimientoVales(datos?.vales ?? [], metas), [datos, metas]);
  const nivel: NivelAlmacen = datos && rec ? nivelAlmacen(rec.saldoGal, rec.cilindrosConCombustible, datos.config) : "ok";
  const maquinasActivas = useMemo(() => (datos?.maquinas ?? []).filter((m) => m.activa), [datos]);

  const diasDesdeConteo = useMemo(() => {
    const ultimo = (datos?.conteos ?? []).filter((c) => !c.anulado).reduce<number | null>((max, c) => Math.max(max ?? 0, Date.parse(c.fecha)), null);
    return ultimo == null ? null : Math.floor((cargadoEn - ultimo) / 86_400_000);
  }, [datos, cargadoEn]);

  const reporte = useCallback(
    (anio: number, mes: number) =>
      datos ? reporteDelMes(datos, datos.config, anio, mes, metas, datos.maquinas.map((m) => ({ id: m.id, nombre: m.nombre, placa: m.placa }))) : null,
    [datos, metas],
  );

  const conRecarga = useCallback(
    async <T,>(p: Promise<Resultado<T>>): Promise<Resultado<T>> => {
      const r = await p;
      if (r.ok) await recargar();
      return r;
    },
    [recargar],
  );

  const firmaDeVale = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${BASE}/vales/${encodeURIComponent(id)}`, { credentials: "include" });
      const j = (await res.json().catch(() => null)) as { data?: { firma: string | null } } | null;
      return j?.data?.firma ?? null;
    } catch (err) {
      logger.error("[combustible] firma failed", { id, error: String(err) });
      return null;
    }
  }, []);

  return {
    datos,
    cargando,
    error,
    recargar,
    rec,
    nivel,
    metas,
    rendimiento,
    maquinasActivas,
    diasDesdeConteo,
    reporte,
    anotarIngreso: (b) => conRecarga(enviar(`${BASE}/ingresos`, "POST", b)),
    anotarVale: (b) => conRecarga(enviar(`${BASE}/vales`, "POST", b)),
    anotarConteo: (b) => conRecarga(enviar(`${BASE}/conteos`, "POST", b)),
    guardarAjustes: (c) => conRecarga(enviar(BASE, "PUT", c)),
    anular: (tipo, id, motivo) => conRecarga(enviar(`${BASE}/${tipo}/${encodeURIComponent(id)}`, "DELETE", { motivo })),
    firmaDeVale,
  };
}
