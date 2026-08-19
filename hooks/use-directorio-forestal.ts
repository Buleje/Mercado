"use client";

/**
 * use-directorio-forestal — la libreta del aserradero desde el cliente (ADR-317).
 *
 * Single source de "leer y escribir el directorio desde un componente": lo usan
 * la vista de administración, el selector de la guía y el formulario de ingreso.
 * Si cada uno hiciera su propio `fetch`, la parte recién creada en la guía no
 * aparecería en la lista de al lado hasta recargar.
 *
 * El autocompletado por documento (SUNAT/RENIEC) vive acá también, porque es
 * parte del mismo gesto: tipeo el RUC → completo → guardo en la libreta.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  fuenteAutocompletado,
  normalizarDocumento,
  ordenarPorUso,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
  type VehiculoInput,
} from "@/lib/forestal/directorio";

/** Lo que devuelve una consulta a SUNAT/RENIEC, ya traducido a campos de la parte. */
export interface DatosDeDocumento {
  nombre: string;
  direccion?: string;
  region?: string;
  provincia?: string;
  distrito?: string;
  ubigeo?: string;
  /** Estado del contribuyente en SUNAT (ACTIVO/BAJA…) — se muestra, no se guarda. */
  estado?: string;
}

/**
 * Cabeceras de toda mutación del directorio.
 *
 * Era `{ "Content-Type": "application/json" }` pelado y el servidor exige el
 * `x-csrf-token` de la cookie (double-submit, `lib/csrf.ts`): alta, edición y
 * baja de partes y vehículos respondían **403** y el modal sólo podía decir
 * "no se pudo guardar". Se arma por llamada porque la cookie puede rotar.
 */
const jsonConCsrf = () => csrfHeaders({ "Content-Type": "application/json" });

export function useDirectorioForestal(opts: { activo?: boolean } = {}) {
  const habilitado = opts.activo !== false;
  const [partes, setPartes] = useState<Parte[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/directorio?inactivos=1", {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`No se pudo leer el directorio (${r.status})`);
      const j = (await r.json()) as { partes?: Parte[]; vehiculos?: Vehiculo[] };
      setPartes(j.partes ?? []);
      setVehiculos(j.vehiculos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (habilitado) void cargar();
  }, [habilitado, cargar]);

  /** Guarda (alta o edición) y refresca la lista con la fila que devolvió el server. */
  const guardarParte = useCallback(async (input: ParteInput & { id?: string }): Promise<Parte> => {
    const r = await fetch("/api/admin/forestal/directorio", {
      method: "POST",
      credentials: "include",
      headers: jsonConCsrf(),
      body: JSON.stringify(input),
    });
    const j = (await r.json().catch(() => ({}))) as { parte?: Parte; message?: string };
    if (!r.ok || !j.parte) throw new Error(j.message ?? "No se pudo guardar la parte.");
    const parte = j.parte;
    setPartes((prev) => {
      const sinEsa = prev.filter((p) => p.id !== parte.id);
      return [parte, ...sinEsa];
    });
    return parte;
  }, []);

  const eliminarParte = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/admin/forestal/directorio?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (!r.ok) throw new Error("No se pudo dar de baja.");
    setPartes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const guardarVehiculo = useCallback(async (input: VehiculoInput & { id?: string }): Promise<Vehiculo> => {
    const r = await fetch("/api/admin/forestal/directorio/vehiculos", {
      method: "POST",
      credentials: "include",
      headers: jsonConCsrf(),
      body: JSON.stringify(input),
    });
    const j = (await r.json().catch(() => ({}))) as { vehiculo?: Vehiculo; message?: string };
    if (!r.ok || !j.vehiculo) throw new Error(j.message ?? "No se pudo guardar el vehículo.");
    const vehiculo = j.vehiculo;
    setVehiculos((prev) => [vehiculo, ...prev.filter((v) => v.id !== vehiculo.id)]);
    return vehiculo;
  }, []);

  const eliminarVehiculo = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/admin/forestal/directorio/vehiculos?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (!r.ok) throw new Error("No se pudo dar de baja el vehículo.");
    setVehiculos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  /**
   * Suma un uso. Fire-and-forget: se llama cuando la parte entra en un documento
   * real y su única consecuencia es el orden de la libreta — que falle no puede
   * romper el guardado de la guía, que ya ocurrió.
   */
  const marcarUso = useCallback((ids: { partes?: string[]; vehiculos?: string[] }) => {
    void fetch("/api/admin/forestal/directorio", {
      method: "PATCH",
      credentials: "include",
      headers: jsonConCsrf(),
      body: JSON.stringify(ids),
    }).catch((err) => console.error("[directorio] no se pudo marcar el uso", String(err)));
  }, []);

  const porRol = useCallback(
    (rol: RolParte) => ordenarPorUso(partes.filter((p) => p.activo && p.roles.includes(rol))),
    [partes],
  );

  const vehiculosActivos = useMemo(() => ordenarPorUso(vehiculos.filter((v) => v.activo)), [vehiculos]);

  return {
    partes,
    vehiculos,
    vehiculosActivos,
    porRol,
    cargando,
    error,
    cargar,
    guardarParte,
    eliminarParte,
    guardarVehiculo,
    eliminarVehiculo,
    marcarUso,
  };
}

/**
 * Trae los datos públicos del documento: RUC → SUNAT, DNI → RENIEC.
 *
 * Pasa por **`/api/documento/lookup`**, que es el único que decide el padrón por
 * el largo del número, corre admin-only (consulta datos de terceros: Ley 29733),
 * tiene rate limit —los padrones cobran por consulta— y corta a los 6 s en vez
 * de encadenar proveedores mientras alguien mira un spinner.
 *
 * Antes se llamaba a `/api/sunat/lookup-ruc` y `/api/reniec/lookup` por separado:
 * eran tres caminos para la misma pregunta y sólo uno tenía esas tres cosas. Los
 * otros dos siguen vivos para el alta pública de vendors, que es su caso.
 *
 * Devuelve `null` cuando el documento no se puede consultar (CE, pasaporte, o el
 * padrón no lo tiene) y **tira** cuando el servicio falla — el que llama decide
 * si eso es un aviso o un error, porque no encontrar un RUC no impide seguir a
 * mano.
 */
export async function consultarDocumento(docTipo: DocTipo, numero: string): Promise<DatosDeDocumento | null> {
  const n = normalizarDocumento(numero);
  const fuente = fuenteAutocompletado(docTipo);
  if (!fuente || !n) return null;

  const r = await fetch(`/api/documento/lookup?numero=${encodeURIComponent(n)}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`No se pudo consultar ${fuente}.`);
  const j = (await r.json()) as
    | { encontrado: true; nombre: string; direccion?: string; departamento?: string; provincia?: string; distrito?: string; estado?: string }
    | { encontrado: false; motivo: string };
  /* «No encontrado» no es una falla del servicio: el número puede no existir, y
     el formulario sigue a mano. Por eso `null` y no `throw`. */
  if (!j.encontrado || !j.nombre) return null;
  return {
    nombre: j.nombre,
    direccion: j.direccion ?? undefined,
    region: j.departamento ?? undefined,
    provincia: j.provincia ?? undefined,
    distrito: j.distrito ?? undefined,
    estado: j.estado ?? undefined,
  };
}
