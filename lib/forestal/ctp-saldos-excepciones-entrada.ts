/**
 * La entrada de `excepcionesDeSaldo` («Qué revisar» del balance de planta),
 * armada en UN lugar para el libro (hook `useExcepcionesDeSaldos`) y para el
 * superadmin (Plantas forestales, 17-10).
 *
 * Antes vivía dentro del hook del cliente: el superadmin tenía que copiarla, y
 * dos copias de «qué es un lote añejo» o «cuándo se afirma lo varado» terminan
 * diciendo cosas distintas sobre la misma planta. Pura y sin `"use client"`:
 * los tipos son estructurales para que entre tanto el JSON del panel como lo
 * que el servidor lee de la base (ya pasado por JSON).
 */
import type { EspecieSinIngreso } from "@/lib/forestal/corrida-compra";
import type { EntradaExcepciones } from "@/lib/forestal/ctp-saldos-excepciones";
import { DIAS_LOTE_ANEJO } from "@/lib/forestal/lotes-aserrio";
import { TRAMOS_DIAS_PATIO } from "@/lib/forestal/patio-resumen";

/** Lo mínimo de un lote de `lotesParaReporte` que miran los avisos. */
export interface LoteParaExcepciones {
  code: string;
  status: string;
  vencido: boolean;
  diasParado: number | null;
}

export interface FuentesDeExcepciones {
  /** `ForestCtpDB.saldos` del período. */
  saldos: Pick<EntradaExcepciones, "materiaPrima" | "porEspecie" | "productos">;
  /** `ForestCtpDB.curvaSaldo`: `null` = no llegó (no se afirma ningún valle). */
  curva: { valle: { fecha: string; saldo: number } | null } | null;
  /** `ForestCtpDB.conciliacionPeriodo`: `null` = no llegó (se juzga el movimiento). */
  concil: { materiaPrima: ReadonlyArray<{ especie: string; final: number }> } | null;
  /** `resumenDeOrigen` sobre las corridas disponibles y los lotes. */
  origen: { corridas: readonly unknown[]; m3SinCertificar: number };
  lotes: readonly LoteParaExcepciones[];
  /**
   * La antigüedad por guía, SÓLO si su lectura llegó: sin ella no se afirma
   * nada de lo varado ni de lo que no tiene costo (`null`).
   */
  antiguedad: {
    varadas: { guias: number; m3: number };
    m3SinCosto: number;
    guiasSinCosto: number;
  } | null;
  /** ADR-485: especies aserradas sin ningún ingreso (todo el libro). `undefined` = no llegó. */
  especiesSinIngreso?: readonly EspecieSinIngreso[];
}

/** Abierto, sin vencer y parado más de {@link DIAS_LOTE_ANEJO} días. */
export const esLoteAnejo = (l: LoteParaExcepciones): boolean =>
  !l.vencido && l.status === "abierto" && (l.diasParado ?? 0) > DIAS_LOTE_ANEJO;

export function entradaDeExcepciones(f: FuentesDeExcepciones): EntradaExcepciones {
  const { saldos, curva, concil, origen, lotes, antiguedad } = f;
  return {
    materiaPrima: saldos.materiaPrima,
    porEspecie: saldos.porEspecie,
    productos: saldos.productos,
    valleDelPeriodo: curva?.valle ?? null,
    /* La existencia FINAL manda sobre el movimiento: con stock heredado se
       puede consumir más de lo recibido sin que el libro esté mal. */
    existenciaFinal: concil?.materiaPrima.map((m) => ({ especie: m.especie, final: m.final })),
    origenIncompleto: { corridas: origen.corridas.length, m3: origen.m3SinCertificar },
    lotes: {
      vencidos: lotes.filter((l) => l.vencido).map((l) => l.code),
      anejos: lotes.filter(esLoteAnejo).map((l) => l.code),
      diasAnejo: DIAS_LOTE_ANEJO,
    },
    guiasVaradas: antiguedad ? { ...antiguedad.varadas, dias: TRAMOS_DIAS_PATIO[2] } : undefined,
    sinCosto: antiguedad ? { m3: antiguedad.m3SinCosto, guias: antiguedad.guiasSinCosto } : undefined,
    especiesSinIngreso: f.especiesSinIngreso,
  };
}
