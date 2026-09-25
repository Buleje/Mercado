/**
 * Los tipos de `useLotesAserrio`, aparte del hook (2026-09-24).
 *
 * El hook pasaba de 400 líneas y casi un tercio era esta interfaz: la leen
 * cinco pantallas (Consumos, Lotes, Producción, Historia del lote y el reparto)
 * y ninguna necesita el cuerpo del hook para tiparse. `use-lotes-aserrio.ts`
 * los re-exporta, así que ningún import existente cambia.
 */

import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { SniffsRefLote } from "@/lib/forestal/sniffs-produccion-parse";

/** Piezas que no entraron, con el motivo: «guardé 28 de 30» a secas obliga a contar a mano. */
export interface TrozaRechazada {
  id: string;
  codigo: string | null;
  motivo: string;
}

export interface ResultadoGuardado {
  loteId: string;
  code: string | null;
  agregadas: number;
  rechazadas: TrozaRechazada[];
}

/**
 * Lo que se puede corregir de un lote ya creado (Brandon, 2026-08-31): antes
 * sólo la nota. `undefined` = no tocar ese campo.
 */
export interface CambiosLote {
  code?: string | null;
  speciesCommon?: string;
  speciesScientific?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  /** `AAAA-MM-DD` o `null` para borrarla. */
  inicioProceso?: string | null;
  finProceso?: string | null;
  notes?: string | null;
}

export interface EstadoLotesAserrio {
  lotes: LoteAserrio[];
  /** El patio entero, incluidas las bloqueadas: el picker muestra el porqué. */
  trozas: TrozaConsumible[];
  /**
   * El patio NO entró entero en la lectura (pasa el tope del endpoint).
   * Quien dibuje una lista de piezas tiene que decirlo: mostrar de menos en
   * silencio hace que el operador crea que su madera desapareció.
   */
  patioTruncado: { hay: number; leidas: number } | null;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crearConTrozas: (input: {
    speciesCommon: string;
    speciesScientific?: string | null;
    notes?: string | null;
    /** Programación del lote (ADR-342): los campos del formulario oficial. */
    ordenProduccion?: string | null;
    tipoProductoConsumir?: string | null;
    inicioProceso?: string | null;
    finProceso?: string | null;
    /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
    code?: string | null;
    /** Vacío = el lote se declara y se carga después, en Consumos. */
    trozaIds: string[];
  }) => Promise<ResultadoGuardado>;
  agregarTrozas: (loteId: string, trozaIds: string[]) => Promise<ResultadoGuardado>;
  /**
   * Declara un lote como INVENTARIO (Brandon, 2026-08-31): entra y sale en el
   * mismo acto, sin trozas reales que apartar. El volumen consumido y los
   * paquetes producidos se declaran juntos; el tope del 56 % se valida en el
   * servidor con la misma puerta que el resto del libro.
   */
  crearInventario: (input: {
    speciesCommon: string;
    speciesScientific?: string | null;
    volumenConsumidoM3: number;
    fecha?: string;
    finProceso?: string | null;
    /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
    code?: string | null;
    notes?: string | null;
    /** Vacío = programación (ADR-398): consumo declarado, producción pendiente. */
    paquetes: {
      codigo: string;
      productType?: string | null;
      presentacion?: string | null;
      cantidad: number;
      volumenM3: number;
      espesorCm?: number | null;
      anchoCm?: number | null;
      largoM?: number | null;
      observations?: string | null;
    }[];
    /** Lo que el SNIFFS declaró del lote, para cotejar (ADR-398). */
    sniffs?: SniffsRefLote | null;
  }) => Promise<{ lote: { id: string; code: string }; corrida: { id: string; lineNo: number } }>;
  /**
   * Consumir en el patio (ADR-340): las piezas entran al lote y a la sierra con
   * la fecha dada, y se abre la corrida que declarará la producción.
   */
  consumirEnPatio: (input: {
    loteId: string;
    trozaIds: string[];
    fecha?: string;
    /** Observación del consumo — va al casillero (11) del libro. */
    observaciones?: string | null;
  }) => Promise<{
    corrida: { id: string; lineNo: number };
    piezas: number;
    volumenM3: number;
    rechazadas: TrozaRechazada[];
  }>;
  /**
   * Sumar piezas a una corrida que todavía NO declaró (ADR-364): el turno que
   * entra en tandas es una sola corrida. Sobre una ya declarada el servidor
   * responde 422 — cambiarle el denominador del rendimiento a un asiento cerrado
   * es lo que el ADR prohíbe.
   */
  sumarACorrida: (input: {
    loteId: string;
    corridaId: string;
    trozaIds: string[];
    fecha?: string;
  }) => Promise<{ piezas: number; volumenM3: number; volumenTotalM3: number; loteCerrado: boolean }>;
  /**
   * El reverso (ADR-364): piezas mal tildadas que salen de una corrida abierta.
   * No las puede sacar todas — una corrida sin materia prima se anula, no se
   * vacía.
   */
  quitarDeCorrida: (input: { corridaId: string; trozaIds: string[] }) => Promise<{
    piezas: number;
    volumenM3: number;
    volumenTotalM3: number;
    lotesReabiertos: string[];
  }>;
  /**
   * Cerrar un lote parcial que no va a terminar de aserrarse: su madera libre
   * vuelve al patio y deja de figurar como trabajo pendiente. Motivo obligatorio.
   */
  cerrarLote: (input: { loteId: string; motivo: string }) => Promise<{
    code: string;
    liberadas: number;
    volumenM3: number;
    teniaCorridas: boolean;
  }>;
  /**
   * Vuelve a abrir un lote ya ASERRADO para seguirle cargando madera
   * (2026-09-02). Las piezas que ya entraron a una corrida no se tocan: siguen
   * atadas a ella. Un lote CERRADO no se reabre — el servidor lo rechaza.
   */
  reabrirLote: (loteId: string) => Promise<{ code: string; piezasConsumidas: number }>;
  quitarTroza: (loteId: string, trozaId: string) => Promise<void>;
  /** Código, especie, programación y nota — lo que se puede corregir de un lote ya creado. */
  editarLote: (loteId: string, cambios: CambiosLote) => Promise<void>;
  deshacer: (loteId: string) => Promise<void>;
  /**
   * DESHACER un lote consumido cuya corrida sigue viva (Brandon, 2026-08-31):
   * anula la corrida (con motivo) y suelta el lote, en un solo paso desde
   * Lotes. Sin `forzar`, falla si la corrida ya tiene despacho o reproceso
   * registrado — con `forzar: true` (Brandon, 2026-09-01: "sin excepción")
   * anula igual y ese despacho/reproceso queda sin corrida de origen.
   */
  deshacerForzado: (loteId: string, motivo: string, forzar?: boolean) => Promise<{ code: string; corridaAnulada: boolean }>;
}
