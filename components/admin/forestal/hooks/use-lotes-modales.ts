"use client";

/**
 * Qué modal de la vista Lotes está abierto.
 *
 * Salió de `CtpLotesView` (27-09, la vista pasaba de 800 líneas): los abren
 * piezas distintas —la cabecera, el menú «Opciones», un indicador, el aviso del
 * SNIFFS, cada tarjeta— y los dibuja `CtpLotesModales`. Un estado por modal,
 * como estaba: se cierran y se abren en cadena (el cuadre abre la resolución,
 * los productos abren la guía) y un único «modal activo» cambiaría ese orden.
 */

import { useState } from "react";

export interface LoteDeProductos {
  code: string;
  especie: string | null;
}

export function useLotesModales() {
  const [armar, setArmar] = useState(false);
  /** «Armar escaneando» (2026-09-26): la pila se arma con la pistola, no en una tabla. */
  const [escaneando, setEscaneando] = useState(false);
  /** Importar la lista de programaciones del SNIFFS (ADR-398). */
  const [importar, setImportar] = useState(false);
  /** La mesa de lo que no cuadra con el SNIFFS, y el lote que se está resolviendo. */
  const [verCuadre, setVerCuadre] = useState(false);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  /* Qué salió de un lote y en qué terminó (Brandon, 2026-09-12). */
  const [productosDe, setProductosDe] = useState<LoteDeProductos | null>(null);
  /* Armar una guía eligiendo lotes, en vez de producto por producto. */
  const [despachando, setDespachando] = useState(false);
  /* Los `uid`s que van a la guía: `null` = la guía no está abierta. Vive acá
     (y no en `CtpLotesModales`) porque también la abre la barra de lotes
     elegidos (2026-10-02). */
  const [uidsParaGuia, setUidsParaGuia] = useState<string[] | null>(null);
  return {
    armar,
    setArmar,
    escaneando,
    setEscaneando,
    importar,
    setImportar,
    verCuadre,
    setVerCuadre,
    resolviendoId,
    setResolviendoId,
    detalleId,
    setDetalleId,
    productosDe,
    setProductosDe,
    despachando,
    setDespachando,
    uidsParaGuia,
    setUidsParaGuia,
  };
}

export type LotesModales = ReturnType<typeof useLotesModales>;
