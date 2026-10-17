"use client";

/**
 * Trámites abierto con guías elegidas en la vista GTF del Libro TH o en «Guías
 * emitidas» del Libro CTP (`?formato=…&guias=…`, ver `tramite-guias-url`):
 * pide a CADA libro las suyas (`ctp:<id>` al CTP, el resto al Libro TH) y
 * arma los casilleros del formato (`datosDesdeGuias`). El shell abre el
 * formulario con el resultado ENCIMA de lo que se llena solo: pisa el titular
 * de la Ficha con el de las guías (RUC y representante quedan los de la Ficha).
 *
 * Espera a `listo` (la Ficha CTP cargada): sin ella no se puede avisar que el
 * titular de las guías no es el de la ficha, y el formulario abriría sin RUC.
 *
 * Un oficio por permiso (Brandon 08-10): con guías de 2+ permisos se arma el
 * del permiso activo del chip si está entre ellos (si no, el de más guías) y
 * el aviso ofrece armar el de cada uno (`elegirPermiso`). El permiso se fija
 * cuando llegan las guías: cambiar el chip después no rearma el formulario.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { datosDesdeGuias, type DatosDesdeGuias, type GuiaParaFormato } from "@/lib/forestal/tramites-desde-guias";
import { permisoPorDefecto, permisosDeLasGuias } from "@/lib/forestal/tramites-permiso";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { borrarPedidoGuias, idsPorLibro, leerPedidoGuias, type LibroGuia, type PedidoGuias } from "../tramite-guias-url";

/** Cómo se pide cada libro y qué se dice si no está habilitado. */
const LIBRO: Record<LibroGuia, { url: string; nombre: string }> = {
  loth: { url: "/api/admin/forestal/gtf", nombre: "Libro TH" },
  ctp: { url: "/api/admin/forestal/ctp/guias-emitidas", nombre: "Libro CTP" },
};

/** «del Libro TH» · «del Libro CTP» · «de los libros TH y CTP». */
export function deLosLibros(libros: readonly LibroGuia[]): string {
  if (libros.length === 1) return `del ${LIBRO[libros[0]].nombre}`;
  return "de los libros TH y CTP";
}

async function pedirAlLibro(libro: LibroGuia, ids: string[], signal: AbortSignal): Promise<{ guias: GuiaParaFormato[]; faltan: number }> {
  if (ids.length === 0) return { guias: [], faltan: 0 };
  const qs = new URLSearchParams({ ids: ids.join(",") });
  const r = await fetch(`${LIBRO[libro].url}?${qs}`, { credentials: "include", cache: "no-store", signal });
  const j = (await r.json().catch(() => ({}))) as { guias?: GuiaParaFormato[]; faltan?: number; message?: string };
  if (!r.ok) {
    throw new Error(
      j.message ?? (r.status === 403 ? `El ${LIBRO[libro].nombre} no está habilitado en este negocio.` : `No se pudieron leer las guías del ${LIBRO[libro].nombre} (HTTP ${r.status}).`),
    );
  }
  /* El origen lo pone el cliente también: una GTF del Libro TH llega sin él (su forma de siempre). */
  return { guias: (j.guias ?? []).map((g) => ({ ...g, origen: libro })), faltan: j.faltan ?? 0 };
}

export interface TramiteDesdeGuias {
  pedido: PedidoGuias | null;
  /** De qué libros vienen las guías pedidas (para nombrarlos en el aviso). */
  libros: LibroGuia[];
  cargando: boolean;
  error: string | null;
  /** Las guías que llegaron (para contar y nombrar en el aviso). */
  guias: GuiaParaFormato[];
  /** Ids pedidos que el libro ya no tiene (borradas o de otro negocio). */
  faltan: number;
  resultado: DatosDesdeGuias | null;
  /** Mete en la relación las anuladas que también están emitidas (por defecto NO van). */
  incluirReemitidas: () => void;
  /** El permiso (código) con el que se arma el oficio. */
  permiso: string | null;
  /** Armar el oficio de OTRO permiso de las guías elegidas (sólo con sus guías). */
  elegirPermiso: (codigo: string) => void;
  /** Mete en el oficio las guías de otro permiso (por defecto quedan fuera). */
  incluirOtrosPermisos: () => void;
  /** Cierra el aviso: lo traído ya está en el formulario. */
  descartar: () => void;
}

export function useTramiteDesdeGuias(listo: boolean, razonSocialFicha: string | null): TramiteDesdeGuias {
  /* Inicializador PURO (StrictMode lo llama dos veces): la URL se limpia en el efecto. */
  const [pedido, setPedido] = useState<PedidoGuias | null>(() => leerPedidoGuias());
  const [guias, setGuias] = useState<GuiaParaFormato[] | null>(null);
  const [faltan, setFaltan] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [incluir, setIncluir] = useState(false);
  const [permiso, setPermiso] = useState<string | null>(null);
  const [incluirOtros, setIncluirOtros] = useState(false);
  const { activo } = useContratoActivo();
  const codigoActivo = useRef<string | null>(null);
  codigoActivo.current = activo?.codigo ?? null;

  useEffect(() => {
    if (!pedido) return;
    borrarPedidoGuias();
    const ac = new AbortController();
    const ids = idsPorLibro(pedido.ids);
    Promise.all([pedirAlLibro("loth", ids.loth, ac.signal), pedirAlLibro("ctp", ids.ctp, ac.signal)])
      .then(([loth, ctp]) => {
        const todas = [...loth.guias, ...ctp.guias];
        setPermiso(permisoPorDefecto(permisosDeLasGuias(todas), codigoActivo.current));
        setGuias(todas);
        setFaltan(loth.faltan + ctp.faltan);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [pedido]);

  const resultado = useMemo(
    () =>
      pedido && guias && listo
        ? datosDesdeGuias(pedido.formatoId, guias, {
            incluirAnuladasReemitidas: incluir,
            razonSocialFicha,
            permiso,
            incluirOtrosPermisos: incluirOtros,
          })
        : null,
    [pedido, guias, listo, incluir, razonSocialFicha, permiso, incluirOtros],
  );

  const libros = useMemo<LibroGuia[]>(() => {
    if (!pedido) return [];
    const ids = idsPorLibro(pedido.ids);
    return (["loth", "ctp"] as const).filter((l) => ids[l].length > 0);
  }, [pedido]);

  return {
    pedido,
    libros,
    cargando: Boolean(pedido) && guias === null && error === null,
    error,
    guias: guias ?? [],
    faltan,
    resultado,
    incluirReemitidas: () => setIncluir(true),
    permiso,
    elegirPermiso: (codigo) => {
      setPermiso(codigo);
      setIncluir(false);
      setIncluirOtros(false);
    },
    incluirOtrosPermisos: () => setIncluirOtros(true),
    descartar: () => {
      setPedido(null);
      setGuias(null);
      setError(null);
      setPermiso(null);
      setIncluirOtros(false);
    },
  };
}
