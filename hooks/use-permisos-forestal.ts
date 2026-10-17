"use client";

/**
 * use-permisos-forestal — los permisos (`ForestContrato`) desde los formularios.
 *
 * `use-contratos` existe para la PANTALLA de contratos: pide la lista con
 * balances y además los candidatos del libro, dos consultas pesadas que un
 * formulario no necesita. Esto es la versión de formulario: la lista pelada,
 * cargada **sólo cuando hace falta** (`activo`), más las tres escrituras que
 * usan la ficha del Directorio y el alta de plan.
 *
 * Degradar con gracia es parte del contrato: los permisos viven detrás de la
 * especialización `spec:forestal:ctp-libro`, y un tenant que tenga el Libro TH
 * sin el CTP recibe 403. Eso NO es un error que mostrar — es que acá no hay
 * permisos —, así que se marca `disponible: false` y la UI esconde el bloque.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { Contrato, ContratoInput } from "@/lib/forestal/contratos";

const BASE = "/api/admin/forestal/contratos";

async function motivo(r: Response, quePedia: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `No se pudo ${quePedia} (HTTP ${r.status})`;
}

/** Cuántos documentos cuelgan de un permiso, por tipo. */
export interface UsosDelPermiso {
  madera: number;
  produccion: number;
  lotes: number;
  gastos: number;
  adelantos: number;
  fletes: number;
  total: number;
}

/** Qué pasó al crear: el permiso, y si ya estaba cargado con ese código. */
export interface ResultadoAltaPermiso {
  contrato: Contrato | null;
  /** El código ya era de otro permiso: se devuelve ÉSE, no se duplica el papel. */
  yaExistia: boolean;
  error: string | null;
}

/**
 * Alta de un permiso, SIN estado de React.
 *
 * Suelta a propósito: el alta de una parte nueva del Directorio crea sus
 * permisos **después** de que el servidor devuelve el id de la ficha, y para
 * entonces el modal ya está cerrándose — un hook montado en ese árbol no
 * serviría. El hook de abajo la usa para no tener dos versiones de la misma
 * llamada.
 */
export async function crearPermiso(input: ContratoInput): Promise<ResultadoAltaPermiso> {
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      credentials: "include",
      body: JSON.stringify(input),
    });
    const j = (await leerJson<{ contrato?: Contrato; message?: string; error?: string }>(r)) ?? {};
    /* 409: ese código YA es un permiso. No se duplica el papel —partiría el
       balance del contrato en dos mitades que no suman—: se devuelve el
       existente para que quien lo cargó decida atarlo a esta ficha. */
    if (r.status === 409 && j.contrato) return { contrato: j.contrato, yaExistia: true, error: null };
    if (!r.ok || !j.contrato) {
      return { contrato: null, yaExistia: false, error: j.message ?? j.error ?? `No se pudo crear el permiso (HTTP ${r.status})` };
    }
    return { contrato: j.contrato, yaExistia: false, error: null };
  } catch (e) {
    return { contrato: null, yaExistia: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function usePermisosForestal({ activo = true }: { activo?: boolean } = {}) {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState(true);
  /** Ya se pidió al menos una vez: evita repetir el GET cada vez que se abre. */
  const pedidoRef = useRef(false);
  const cargasRef = useRef({ ultima: 0, cambios: 0 });

  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    if (!opciones?.silenciosa) {
      setCargando(true);
      setError(null);
    }
    try {
      const r = await fetch(BASE, { credentials: "include", cache: "no-store" });
      if (r.status === 403) {
        if (esta === cargasRef.current.ultima) setDisponible(false);
        return;
      }
      if (!r.ok) throw new Error(await motivo(r, "cargar los permisos"));
      const j = (await r.json()) as { contratos?: Contrato[] };
      /* Guarda de «carga vieja pisa lo optimista»: el GET del doble montaje
         vuelve tarde y repondría la lista SIN el permiso recién creado. */
      if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) {
        setContratos(j.contratos ?? []);
        setDisponible(true);
      }
    } catch (e) {
      if (esta === cargasRef.current.ultima && !opciones?.silenciosa) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (esta === cargasRef.current.ultima) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!activo || pedidoRef.current) return;
    pedidoRef.current = true;
    void cargar();
  }, [activo, cargar]);

  /** Mete o reemplaza un permiso en la lista sin esperar el GET. */
  const aplicar = useCallback((c: Contrato) => {
    cargasRef.current.cambios += 1;
    setContratos((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
  }, []);

  const crear = useCallback(
    async (input: ContratoInput): Promise<ResultadoAltaPermiso> => {
      const res = await crearPermiso(input);
      if (res.contrato) aplicar(res.contrato);
      return res;
    },
    [aplicar],
  );

  const actualizar = useCallback(
    async (id: string, cambios: Partial<ContratoInput>): Promise<{ contrato: Contrato | null; error: string | null }> => {
      try {
        const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify(cambios),
        });
        const j = (await leerJson<{ contrato?: Contrato; message?: string; error?: string }>(r)) ?? {};
        if (!r.ok || !j.contrato) {
          return { contrato: null, error: j.message ?? j.error ?? `No se pudo guardar el permiso (HTTP ${r.status})` };
        }
        aplicar(j.contrato);
        return { contrato: j.contrato, error: null };
      } catch (e) {
        return { contrato: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [aplicar],
  );

  /**
   * Qué cuelga del permiso hoy. Se pide ANTES de confirmar una baja: dar de
   * baja uno con 24 ingresos imputados no es lo mismo que uno recién cargado.
   */
  const usosDe = useCallback(async (id: string): Promise<UsosDelPermiso | null> => {
    try {
      const r = await fetch(`${BASE}/${encodeURIComponent(id)}?usos=1`, { credentials: "include", cache: "no-store" });
      if (!r.ok) return null;
      const j = (await r.json()) as { usos?: UsosDelPermiso };
      return j.usos ?? null;
    } catch {
      return null;
    }
  }, []);

  /** Baja lógica: el papel sale de los selectores, lo imputado no se toca. */
  const eliminar = useCallback(async (id: string): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!r.ok) return { ok: false, error: await motivo(r, "dar de baja el permiso") };
      cargasRef.current.cambios += 1;
      setContratos((prev) => prev.filter((c) => c.id !== id));
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  return { contratos, cargando, error, disponible, recargar: cargar, crear, actualizar, eliminar, usosDe };
}
