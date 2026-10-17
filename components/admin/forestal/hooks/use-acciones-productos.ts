"use client";

/**
 * El estado de cada acción de «Productos disponibles» (ADR-367/418): qué modal
 * está abierto, qué filas están tildadas y quién puede apartar. Los modales
 * viven en `productos-disponibles-acciones.tsx`.
 */

import { useCallback, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedePedir } from "@/lib/auth/roles-rutas-panel";
import { tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";
import {
  SIN_ESPECIE,
  type ApartadoProducto,
  type CorridaDisponible,
  type FilaProducto,
  type PaqueteDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import type { LineaEditable } from "../CtpEditarLineaModal";
import type { PaqueteAMedir } from "../CtpEscuadriaPaqueteModal";
import type { EstadoProductosDisponibles } from "./use-productos-disponibles";

export const etiquetaDe = (f: Pick<FilaProducto, "corrida" | "paquete">) =>
  f.paquete?.codigo ?? `Corrida N° ${f.corrida.lineNo ?? "—"}`;

/** Lo que el modal de apartar pide de cada fila. */
const aApartar = (f: FilaProducto) => ({
  ctpEntryId: f.corrida.id,
  paqueteId: f.paquete?.id ?? null,
  etiqueta: etiquetaDe(f),
  volumenM3: f.volumenM3,
  piezas: f.paquete?.cantidad ?? null,
});

export function useAccionesProductos(e: EstadoProductosDisponibles) {
  const [ficha, setFicha] = useState<string | null>(null);
  const [escuadria, setEscuadria] = useState<PaqueteAMedir | null>(null);
  const [reprocesar, setReprocesar] = useState<CorridaDisponible | null>(null);
  const [cubicar, setCubicar] = useState<FilaProducto | null>(null);
  const [editar, setEditar] = useState<LineaEditable | null>(null);
  const [marcarUsado, setMarcarUsado] = useState<CorridaDisponible | null>(null);
  const [cubicarConjunto, setCubicarConjunto] = useState(false);
  const [despachando, setDespachando] = useState(false);
  const [apartando, setApartando] = useState<{
    filas: ReturnType<typeof aApartar>[];
    apartadoActual: ApartadoProducto | null;
  } | null>(null);
  /** Filas tildadas (clave = la del paquete o de la corrida sin paquete, ADR-369). */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /* Apartar escribe por PATCH (admin/dueño): al almacenero no se le ofrece. */
  const puedeApartar = puedePedir("PATCH /api/admin/forestal/ctp", useMiRol());

  const alternarFilas = useCallback((claves: readonly string[], tildar: boolean) => {
    setSeleccion((prev) => {
      const s = new Set(prev);
      for (const k of claves) {
        if (tildar) s.add(k);
        else s.delete(k);
      }
      return s;
    });
  }, []);

  const abrirEditar = useCallback(
    (c: CorridaDisponible) =>
      setEditar({
        id: c.id,
        lineNo: c.lineNo,
        fecha: c.fecha,
        observations: c.observations,
        presentacion: c.presentacion,
        materiaPrimaRef: c.lote,
        duenoMadera: c.duenoMadera ?? null,
        titularNombre: c.titularNombre ?? null,
        speciesCommon: c.especie,
        speciesScientific: c.especieCientifica,
        productType: c.producto,
        unit: c.unidad,
        quantity: c.cantidad,
        volumeInputM3: c.volumenConsumidoM3,
        /* Lo que la pantalla ya sabe de las ataduras; el servidor vuelve a decidir. */
        atadaPorque:
          c.despachado > 0 ? "ya tiene madera despachada" : c.reprocesado > 0 ? "ya alimentó un reproceso" : null,
        permisos: c.titularOrigen,
        gtfOrigen: c.gtfOrigen,
        /* Las especies que el libro ya escribió: no inventar otra grafía («Tornillo»/«TORNILLO»). */
        especiesConocidas: e.facetas.especies.map((o) => o.value).filter((v) => v !== SIN_ESPECIE),
      }),
    [e.facetas.especies],
  );

  const abrirEscuadria = useCallback(
    (c: CorridaDisponible, p: PaqueteDisponible) =>
      setEscuadria({
        id: p.id,
        codigo: p.codigo,
        ctpEntryId: c.id,
        lineNo: c.lineNo,
        producto: p.producto ?? c.producto,
        especie: c.especie,
        cantidad: p.cantidad,
        volumenM3: p.volumenM3,
        espesorCm: p.espesorCm,
        anchoCm: p.anchoCm,
        largoM: p.largoM,
      }),
    [],
  );

  const abrirApartar = useCallback(
    (filas: readonly FilaProducto[], apartadoActual: ApartadoProducto | null) =>
      setApartando({ filas: filas.map(aApartar), apartadoActual }),
    [],
  );

  return {
    ficha,
    setFicha,
    escuadria,
    setEscuadria,
    reprocesar,
    setReprocesar,
    cubicar,
    setCubicar,
    editar,
    abrirEditar,
    setEditar,
    marcarUsado,
    setMarcarUsado,
    cubicarConjunto,
    setCubicarConjunto,
    despachando,
    setDespachando,
    apartando,
    setApartando,
    abrirApartar,
    abrirEscuadria,
    seleccion,
    setSeleccion,
    alternarFilas,
    puedeApartar,
  };
}

export type AccionesProductos = ReturnType<typeof useAccionesProductos>;

/** Las corridas que pueden alimentar el reproceso sugerido: mismo tipo comercial y con saldo. */
export function candidatasDelSugerido(e: EstadoProductosDisponibles) {
  if (!e.sugerido) return [];
  const norma = (v: string | null | undefined) =>
    (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const buscado = norma(e.sugerido.desdeTipo);
  return e.corridas
    .filter((c) => !c.usadoAt && c.disponible > 0 && norma(tipoComercialDelProducto(c.producto)) === buscado)
    .map((c) => ({ id: c.id, lineNo: c.lineNo, disponible: c.disponible }));
}
