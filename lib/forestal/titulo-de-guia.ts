/**
 * Declarar el título habilitante de una guía YA asentada (Brandon 05-10).
 *
 * Medido ese día en Blas: 17 de 17 trozas del patio sin título, en 7 guías
 * validadas del inventario de apertura. La corrección de un ingreso
 * (`WoodEntriesDB.update`) sólo vale para los PENDIENTES —«anúlalo y regístralo
 * de nuevo»—, que para un casillero vacío es tirar el asiento entero.
 *
 * Esto es otra cosa: **llenar un hueco**, igual que los D1/D2 medidos en planta
 * (ADR-440). Las reglas, por ingreso de la guía (una GTF con N especies son N
 * ingresos, ADR-312):
 *   · sólo sobre VACÍO: un código ya declarado no se pisa nunca —si es otro, se
 *     dice cuál y no se toca—; la resolución y el vínculo al permiso, igual;
 *   · el mes cerrado manda: lo presentado no cambia;
 *   · lo anulado o rechazado no se toca (no está en el libro vivo).
 * El libro admite el hueco; el certificado no (`trazabilidadCompleta()`): por
 * eso vale la pena poder cerrarlo sin rehacer la guía.
 *
 * PURO: la DB class lo usa para decidir y el test lo prueba sin base.
 */

import { normalizarCodigoContrato } from "./contratos";

export interface IngresoParaTitulo {
  id: string;
  especie: string | null;
  status: string;
  anulado: boolean;
  originCode: string | null;
  originSourceNumber: string | null;
  contratoId: string | null;
  /** Etiqueta del mes cerrado que lo contiene («setiembre 2026»), o null. */
  periodoCerrado: string | null;
}

export interface PedidoTitulo {
  originCode: string;
  originSourceNumber: string | null;
  contratoId: string | null;
}

export interface PlanTitulo {
  id: string;
  especie: string | null;
  /** Lo que se escribe (sólo los campos vacíos). `null` = nada. */
  escribir: { originCode?: string; originSourceNumber?: string; contratoId?: string } | null;
  /** Por qué no se escribió nada, en palabras del operador. */
  motivo: string | null;
}

const vacio = (s: string | null | undefined) => !(s ?? "").trim();

export function planearTitulo(ingresos: readonly IngresoParaTitulo[], pedido: PedidoTitulo): PlanTitulo[] {
  const codigo = pedido.originCode.trim();
  const res = (pedido.originSourceNumber ?? "").trim();
  return ingresos.map((i) => {
    const base = { id: i.id, especie: i.especie };
    if (i.anulado || i.status === "anulado" || i.status === "rechazado") {
      return { ...base, escribir: null, motivo: `está ${i.status === "rechazado" ? "rechazado" : "anulado"}` };
    }
    if (i.periodoCerrado) return { ...base, escribir: null, motivo: `mes cerrado (${i.periodoCerrado})` };
    if (!vacio(i.originCode)) {
      const mismo = normalizarCodigoContrato(i.originCode ?? "") === normalizarCodigoContrato(codigo);
      if (!mismo) return { ...base, escribir: null, motivo: `ya declara ${i.originCode?.trim()}: no se pisa` };
    }
    const escribir: NonNullable<PlanTitulo["escribir"]> = {};
    if (vacio(i.originCode) && codigo) escribir.originCode = codigo;
    if (vacio(i.originSourceNumber) && res) escribir.originSourceNumber = res;
    if (!i.contratoId && pedido.contratoId) escribir.contratoId = pedido.contratoId;
    return Object.keys(escribir).length > 0
      ? { ...base, escribir, motivo: null }
      : { ...base, escribir: null, motivo: "ya tenía ese título" };
  });
}
