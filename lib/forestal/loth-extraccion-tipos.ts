/**
 * loth-extraccion-tipos — el contrato de la vista «Extracción» del Libro TH
 * (ADR-454). Lo comparten la función pura (`loth-extraccion.ts`), la ruta
 * `GET /api/admin/forestal/loth/extraccion` y la pantalla.
 *
 * Una regla atraviesa todo: la MISMA madera se asienta en tala, en trozado y
 * en despacho. Cada operación se suma por separado y su saldo es
 * `base − esa operación`; nunca se suman filas de secciones distintas.
 *
 * Client-safe: sólo tipos y constantes.
 */

import type { EtapaArbol, TipoAviso } from "./loth-etapa-arbol";

/** Avance que enciende el aviso amarillo sobre la base del permiso. */
export const UMBRAL_AVISO_PCT = 80;
/** Avance que dice «se llegó al tope». */
export const UMBRAL_TOPE_PCT = 100;
/** Diferencia de m³ que se considera cero (redondeo de 4 decimales del libro). */
export const TOLERANCIA_M3 = 0.01;
/** Sin tantos días de actividad no se proyecta un ritmo (sería ruido). */
export const DIAS_MINIMOS_PARA_RITMO = 14;

/** Cómo se unió el plan con su permiso: por el vínculo guardado, por el permiso o por el código gemelo. */
export type VinculoPermiso = "plan" | "permiso" | "gemelo";
/** Contra qué se mide el tope: lo autorizado por especie o, si no hay, el censo aprovechable. */
export type BaseDelTope = "autorizado" | "censo";
export type NivelAvance = "sin_base" | "ok" | "atencion" | "tope" | "exceso";

/** m³ y cuántas piezas (árboles o trozas); `sinVolumen` = piezas sin m³ declarado. */
export interface Suma {
  m3: number;
  n: number;
  sinVolumen: number;
}

export interface CensoFila {
  censadoM3: number;
  censados: number;
  semillerosRegente: number;
  semillerosPoa: number;
  semillerosM3: number;
  excluidos: number;
  excluidosM3: number;
  /** La BASE «aprobado según censo»: aprovechables, sin semilleros ni bajo DMC; incluye los ya talados. */
  aprovechableM3: number;
  aprovechables: number;
  enPieAprovechables: number;
  /** Σ `ForestPlanSpecies.volumenAutorizadoM3`; `null` si el plan no tiene especies. */
  autorizadoM3: number | null;
  arbolesAutorizados: number | null;
}

export interface SaldoContra {
  m3: number;
  pct: number | null;
  nivel: NivelAvance;
}

export interface FilaExtraccion {
  clave: string;
  etiqueta: string;
  cites: boolean;
  /** Especie con operaciones en el libro que el plan no autoriza. */
  fueraDelPlan: boolean;
  censo: CensoFila;
  talado: Suma;
  trozado: Suma & { arboles: number };
  despachado: Suma;
  consumidoTh: Suma;
  /** Trozas trozadas que no salieron ni se consumieron: siguen en el monte. */
  enElMonte: Suma;
  taladosSinTrozar: Suma;
  recibido: Suma & { m3Guia: number };
  aserrado: Suma;
  /** Saldo = base − operación, uno por operación. */
  saldo: { tala: SaldoContra; trozado: SaldoContra; despacho: SaldoContra };
  movilizadoM3: number;
  saldoAutorizado: SaldoContra | null;
  tope: { base: BaseDelTope; m3: number } | null;
  avance: SaldoContra;
}

export interface PermisoExtraccion {
  planId: string | null;
  planNumber: string | null;
  planType: string | null;
  titular: string | null;
  alias: string | null;
  estado: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  permiso: { contratoId: string; codigo: string; vinculo: VinculoPermiso } | null;
  /**
   * `configurado` = el % lo guardó el negocio en Parámetros del POA; si no,
   * rige el defecto del plan. `plantacion` = el plan es el registro de una
   * plantación: su defecto es 0 % (ADR-455).
   */
  poa: { semillerosPct: number; configurado: boolean; semillerosRegente: number; plantacion: boolean };
  total: FilaExtraccion;
  especies: FilaExtraccion[];
  arboles: {
    porEtapa: Partial<Record<EtapaArbol, number>>;
    conAviso: number;
    avisos: Partial<Record<TipoAviso, number>>;
  };
}

export interface VentanaExtraccion {
  desde: string;
  hasta: string;
  talado: Suma;
  trozado: Suma;
  despachado: Suma;
  diasConActividad: number;
}

export interface SemanaExtraccion {
  /** Lunes de la semana, `YYYY-MM-DD` (calendario de Lima). */
  semana: string;
  taladoM3: number;
  trozadoM3: number;
  despachadoM3: number;
  taladoAcumM3: number;
  /** Lo que debería llevarse talado a esa semana para agotar la base al cierre de la vigencia. */
  metaAcumM3: number | null;
}

export interface KpisExtraccion {
  extraido: { pct: number | null; taladoM3: number; baseM3: number; plazoPct: number | null };
  porTalar: { m3: number; arbolesEnPie: number; ptAserrableRef: number };
  ritmoSemanal: { m3: number | null; anteriorM3: number | null; variacionPct: number | null; motivoSinDato: string | null };
  agotamiento: { fecha: string | null; dias: number | null; vigenciaHasta: string | null; llegaAlCierre: boolean | null; motivoSinDato: string | null };
  trozasEnElMonte: { n: number; m3: number; diasMasVieja: number | null };
  llegoAPlanta: { pct: number | null; recibidas: number; despachadas: number };
}

export type PasoCadena = "censo" | "autorizado" | "talado" | "trozado" | "despachado" | "recibido" | "aserrado";

export interface EtapaEmbudo {
  paso: PasoCadena;
  label: string;
  m3: number | null;
  n: number | null;
  pctDelAnterior: number | null;
}

export type TipoAvisoExtraccion =
  | "avance_80"
  | "avance_100"
  | "exceso_autorizado"
  | "medido_sobre_censo"
  | "talados_sin_trozar"
  | "salida_sin_trozado"
  | "recibida_sin_despacho"
  | "censo_libro_distinto"
  | "semilleros_sistema_vs_regente"
  | "especie_fuera_del_plan"
  | "autorizado_sin_respaldo"
  | "lineas_sin_plan"
  | "plan_sin_permiso"
  | "permiso_sin_plan"
  | "libro_truncado"
  | "agota_pronto";

export interface AvisoExtraccion {
  tipo: TipoAvisoExtraccion;
  nivel: "error" | "warning" | "info";
  planId: string | null;
  especie: string | null;
  texto: string;
  cifraM3: number | null;
  /**
   * Sólo en `plan_sin_permiso`: el permiso con el MISMO código que se puede
   * unir en un clic (`permisoGemeloDelPlan`), o `null` si no hay uno solo y hay
   * que elegirlo. Agregado el 29-09 (ADR-455); opcional para lo ya servido.
   */
  permisoSugerido?: { contratoId: string; codigo: string } | null;
}

export interface ExtraccionFiltro {
  planId?: string;
  contratoId?: string;
  /** `YYYY-MM-DD`, inclusive. */
  desde?: string;
  hasta?: string;
  /** Ventana anterior para comparar el ritmo (misma longitud). */
  antDesde?: string;
  antHasta?: string;
}

export interface ExtraccionResponse {
  generadoEn: string;
  alcance: { planId: string | null; contratoId: string | null };
  permisos: PermisoExtraccion[];
  total: FilaExtraccion;
  especies: FilaExtraccion[];
  periodo: VentanaExtraccion;
  anterior: VentanaExtraccion | null;
  semanas: SemanaExtraccion[];
  kpis: KpisExtraccion;
  embudo: EtapaEmbudo[];
  avisos: AvisoExtraccion[];
  limites: { arbolesLeidos: number; lineasLeidas: number; truncado: boolean };
  /**
   * Recibido en planta y aserrado son el estado de HOY en el Libro CTP: no se
   * cortan en `hasta` (la recepción tiene su propia fecha en el otro libro).
   * Lo demás es acumulado a `hasta`. Opcional: agregado el 29-09.
   */
  recibidoAlDia?: true;
}
