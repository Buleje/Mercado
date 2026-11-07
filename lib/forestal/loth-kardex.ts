/**
 * Kárdex del permiso — cada movimiento del Libro TH en orden, con lo que queda
 * después de cada uno (pedido de Brandon, 2-10-2026: «llevar el control de
 * volumen, madera y kárdex completo de cada permiso»).
 *
 * La MISMA madera se asienta tres veces: en la tala (el árbol), en el trozado
 * (sus trozas) y en el despacho (las trozas que salen con GTF). Un kárdex que
 * sumara esas columnas inflaría el volumen ~3×. Acá cada movimiento mueve
 * volumen de un casillero al siguiente —el mismo modelo que `cascadaDelPlan`—:
 *
 *   Por talar (la base)  ─ tala ─▶  Talado sin trozar (monte)  ─ trozado ─▶  En patio  ─ despacho / consumo ─▶ fuera
 *
 *   · Por talar         = base − talado                       (negativo = se taló de más)
 *   · Talado sin trozar = talado − trozado                    (lo que sigue en el monte, con la merma)
 *   · En patio          = trozado − despachado como troza − consumido
 *
 * «Entra» y «Sale» se miden contra la madera que está en el área (monte +
 * patio): la tala ENTRA, el despacho y el consumo SALEN, y el trozado no entra
 * ni sale — la transforma (pasa del monte al patio). Así `Σ entra − Σ sale` es
 * lo que hay hoy en el área, y el cierre del kárdex es, por construcción, la
 * cascada del permiso (`cascadaDelPlan`): las mismas líneas (las del plan + las
 * sin plan, como `balanceExtraccion`), la misma especie por línea
 * (`claveEnElPlan`, común o científico) y las mismas reglas que `computeBalance`.
 *
 * Una línea anulada se ve (tachada) pero no cuenta.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { claveEnElPlan, claveEspecie, type LothEntryDTO, type LothSection } from "./loth-constants";
import {
  TOLERANCIA_CASCADA_M3,
  cascadaDeFila,
  cascadaDelPlan,
  type CascadaEspecie,
  type CascadaPlan,
  type FilaBalanceCascada,
} from "./loth-saldo-cascada";
import { diaDelLibro } from "./loth-tablero-trozas";

export type MovimientoKardex =
  | "tala"
  | "trozado"
  | "despacho"
  | "consumo"
  | "producto"
  | "despacho_producto";

export const MOVIMIENTO_KARDEX: Record<
  MovimientoKardex,
  { label: string; efecto: string; orden: number }
> = {
  tala: { label: "Tala", efecto: "Entra al monte: deja de estar por talar", orden: 1 },
  trozado: { label: "Trozado", efecto: "Transforma: pasa del monte al patio", orden: 2 },
  despacho: { label: "Despacho", efecto: "Sale del patio con GTF", orden: 3 },
  consumo: { label: "Consumo", efecto: "Sale del patio: se usa dentro del TH", orden: 4 },
  producto: {
    label: "Producto",
    efecto: "Sale de trozas ya consumidas: no mueve el saldo",
    orden: 5,
  },
  despacho_producto: {
    label: "Despacho de producto",
    efecto:
      "Sale con GTF como producto: suma a lo despachado, no al patio (la troza ya salió como consumo)",
    orden: 6,
  },
};

const DE_SECCION: Record<LothSection, MovimientoKardex> = {
  tala: "tala",
  trozado: "trozado",
  despacho_troza: "despacho",
  consumo_troza: "consumo",
  producto_terminado: "producto",
  despacho_producto: "despacho_producto",
};

/** Una especie del registro (plantación) o de lo autorizado (bosque): `GET /plan/species`. */
export interface EspecieDelPermiso {
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean;
  volumenAutorizadoM3: number | string | null;
}

export interface FilaKardex {
  id: string;
  /** Día del libro en Pucallpa (`YYYY-MM-DD`). */
  dia: string | null;
  lineNo: number;
  movimiento: MovimientoKardex;
  gtf: string | null;
  /** Nombre a mostrar: el del registro si la línea es de una especie del permiso. */
  especie: string | null;
  /** Clave de la especie (`''` = la línea no dice especie). */
  clave: string;
  /** La especie está en el registro / lo autorizado del permiso. */
  delRegistro: boolean;
  arbol: string | null;
  troza: string | null;
  /** Volumen del movimiento (despacho y consumo: el de SU troza en el trozado, como el saldo). */
  m3: number | null;
  /** Lo que entra a la madera del área (la tala). */
  entraM3: number | null;
  /** Lo que sale de la madera del área (despacho de troza, consumo). */
  saleM3: number | null;
  /** «120 pt», para el producto que no se mide en m³. */
  cantidad: string | null;
  anulada: boolean;
  motivoAnulacion: string | null;
  /** Línea sin plan: cuenta en el saldo de todos los permisos (como `balanceExtraccion`). */
  sinPlan: boolean;
  /** Movió volumen del saldo. */
  cuenta: boolean;
  avisos: string[];
  /** Cómo queda SU especie después del movimiento; `null` si está anulada o no dice especie. */
  saldoEspecie: CascadaEspecie | null;
  /** Cómo queda el permiso; `null` si está anulada o la especie no es del registro. */
  saldoTotal: CascadaEspecie | null;
}

export interface EspecieKardex {
  clave: string;
  nombre: string;
  delRegistro: boolean;
  baseM3: number;
}

export interface KardexPermiso {
  filas: FilaKardex[];
  especies: EspecieKardex[];
  /** El permiso no tiene especies en su registro: no hay «por talar». */
  sinBase: boolean;
  /** Lo que queda al final: la cascada de las especies del registro (= «Volumen del permiso»). */
  cierre: CascadaPlan;
  /** Especies que el libro movió y el registro no tiene: no suman al saldo del permiso. */
  fueraDelRegistro: CascadaEspecie[];
}

interface Acum {
  talado: number;
  trozado: number;
  movilizado: number;
  movilizadoTroza: number;
  consumido: number;
}

const VACIO: Acum = { talado: 0, trozado: 0, movilizado: 0, movilizadoTroza: 0, consumido: 0 };
const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

interface TrozaDelLibro {
  species: string | null;
  scientific: string | null;
  vol: number;
  treeCode: string | null;
}

/** Las líneas que cuentan en el saldo de un plan: las suyas y las sin plan (`balanceExtraccion`). */
export function lineasDelPermiso(entries: readonly LothEntryDTO[], planId: string): LothEntryDTO[] {
  return entries.filter((e) => e.planId === planId || e.planId == null);
}

/** Orden del kárdex: día, la etapa (en un mismo día la tala va antes que su trozado) y el N° de línea. */
function ordenar(
  a: { dia: string | null; mov: MovimientoKardex; e: LothEntryDTO },
  b: typeof a,
): number {
  const da = a.dia ?? "";
  const db = b.dia ?? "";
  if (da !== db) return da < db ? -1 : 1;
  const oa = MOVIMIENTO_KARDEX[a.mov].orden;
  const ob = MOVIMIENTO_KARDEX[b.mov].orden;
  if (oa !== ob) return oa - ob;
  if (a.e.lineNo !== b.e.lineNo) return a.e.lineNo - b.e.lineNo;
  return (a.e.createdAt ?? a.e.entryDate).localeCompare(b.e.createdAt ?? b.e.entryDate);
}

/**
 * Arma el kárdex de un permiso con el libro ya cargado y las especies de su
 * registro. Las cuentas son las de `computeBalance`, en el orden del libro.
 */
export function construirKardex(
  entries: readonly LothEntryDTO[],
  opts: { planId: string; especies: readonly EspecieDelPermiso[] },
): KardexPermiso {
  const delPlan = opts.especies.filter((s) => claveEspecie(s.speciesCommon) !== "");
  const registro = new Map<string, { nombre: string; base: number; cites: boolean }>();
  for (const s of delPlan) {
    const k = claveEspecie(s.speciesCommon);
    if (!registro.has(k))
      registro.set(k, {
        nombre: s.speciesCommon,
        base: num(s.volumenAutorizadoM3),
        cites: s.cites === true,
      });
  }
  const sinBase = registro.size === 0;

  const propias = lineasDelPermiso(entries, opts.planId);
  /* Como `computeBalance`: el despacho y el consumo valen lo que su troza en el
     trozado VIGENTE (si un código se repite, gana el último). Las anuladas sólo
     sirven para mostrar de qué era la troza de una línea anulada. */
  const trozas = new Map<string, TrozaDelLibro>();
  const trozasAnuladas = new Map<string, TrozaDelLibro>();
  for (const e of propias) {
    if (e.section !== "trozado" || !e.trozaCode) continue;
    const t = {
      species: e.speciesCommon,
      scientific: e.speciesScientific,
      vol: num(e.volumeM3),
      treeCode: e.treeCode,
    };
    (e.status === "anulado" ? trozasAnuladas : trozas).set(e.trozaCode, t);
  }

  const acum = new Map<string, Acum>();
  const nombreDe = new Map<string, string>();
  for (const [k, r] of registro) nombreDe.set(k, r.nombre);
  const sumar = (k: string, campo: keyof Acum, v: number) => {
    const a = { ...(acum.get(k) ?? VACIO) };
    a[campo] += v;
    acum.set(k, a);
  };
  const filaBalance = (k: string): FilaBalanceCascada => {
    const a = acum.get(k) ?? VACIO;
    const r = registro.get(k);
    return {
      species: nombreDe.get(k) ?? k,
      cites: r?.cites ?? false,
      autorizado: r?.base ?? 0,
      talado: r4(a.talado),
      trozado: r4(a.trozado),
      movilizado: r4(a.movilizado),
      movilizadoTroza: r4(a.movilizadoTroza),
      consumido: r4(a.consumido),
    };
  };
  /* El permiso: las especies del registro (todas, aunque no se movieran: así
     arma sus filas el servidor). Sin registro, todo lo que el libro movió. */
  const clavesDelTotal = (): string[] => (sinBase ? [...acum.keys()] : [...registro.keys()]);
  const cascadaTotal = (): CascadaEspecie =>
    cascadaDelPlan(clavesDelTotal().map(filaBalance)).total;

  const ordenadas = propias
    .map((e) => ({ e, dia: diaDelLibro(e.entryDate), mov: DE_SECCION[e.section] }))
    .filter((x) => x.mov != null)
    .sort(ordenar);

  const filas: FilaKardex[] = [];
  for (const { e, dia, mov } of ordenadas) {
    const anulada = e.status === "anulado";
    const avisos: string[] = [];
    let comun: string | null = e.speciesCommon;
    let cientifico: string | null = e.speciesScientific;
    let arbol = e.treeCode;
    let m3: number | null = null;
    let campos: (keyof Acum)[] = [];
    let entra = false;
    let sale = false;
    let cantidad: string | null = null;

    if (mov === "tala" || mov === "trozado") {
      m3 = e.volumeM3 == null || e.volumeM3 === "" ? null : num(e.volumeM3);
      if (m3 == null) avisos.push("Sin volumen: no suma");
      campos = [mov === "tala" ? "talado" : "trozado"];
      entra = mov === "tala";
    } else if (mov === "despacho" || mov === "consumo") {
      const t = e.trozaCode
        ? (trozas.get(e.trozaCode) ?? (anulada ? trozasAnuladas.get(e.trozaCode) : undefined))
        : undefined;
      comun = t?.species ?? null;
      cientifico = t?.scientific ?? null;
      arbol = e.treeCode ?? t?.treeCode ?? null;
      m3 = t ? t.vol : null;
      if (!e.trozaCode) avisos.push("Sin código de troza: no descuenta");
      else if (!t) avisos.push("Sin trozado vigente de esta troza: no descuenta");
      campos = mov === "despacho" ? ["movilizado", "movilizadoTroza"] : ["consumido"];
      sale = true;
    } else if (mov === "despacho_producto") {
      if (e.unit === "m3") {
        m3 = num(e.quantity);
        campos = ["movilizado"];
      } else {
        cantidad = e.quantity != null ? `${e.quantity} ${e.unit ?? ""}`.trim() : null;
        avisos.push("No va en m³: no entra al saldo");
      }
    } else {
      cantidad = e.quantity != null ? `${e.quantity} ${e.unit ?? ""}`.trim() : null;
    }

    const clave = comun ? claveEnElPlan(delPlan, comun, cientifico) : "";
    if (clave && !nombreDe.has(clave)) nombreDe.set(clave, (comun ?? "").trim());
    if (
      !clave &&
      (mov === "tala" ||
        mov === "trozado" ||
        ((mov === "despacho" || mov === "consumo") && m3 != null))
    )
      avisos.push("Sin especie: no suma");
    const delRegistro = sinBase || registro.has(clave);
    const cuenta = !anulada && clave !== "" && campos.length > 0 && m3 != null;

    if (cuenta) {
      for (const c of campos) sumar(clave, c, m3 as number);
      const a = acum.get(clave) ?? VACIO;
      if (mov === "trozado" && a.trozado - a.talado > TOLERANCIA_CASCADA_M3)
        avisos.push(
          `Se trozó ${r4(a.trozado - a.talado)} m³ más de lo talado de ${nombreDe.get(clave)}: falta su tala o se registró después`,
        );
      if (
        (mov === "despacho" || mov === "consumo") &&
        a.movilizadoTroza + a.consumido - a.trozado > TOLERANCIA_CASCADA_M3
      )
        avisos.push(`Salió más de lo trozado de ${nombreDe.get(clave)}`);
    }

    filas.push({
      id: e.id,
      dia,
      lineNo: e.lineNo,
      movimiento: mov,
      gtf: e.gtfNumber?.trim() || null,
      especie: clave ? (nombreDe.get(clave) ?? comun) : comun?.trim() || null,
      clave,
      delRegistro: clave !== "" && delRegistro,
      arbol: arbol?.trim() || null,
      troza: e.trozaCode?.trim() || null,
      m3: m3 == null ? null : r4(m3),
      entraM3: entra && m3 != null ? r4(m3) : null,
      saleM3: sale && m3 != null ? r4(m3) : null,
      cantidad,
      anulada,
      motivoAnulacion: anulada ? e.annulledReason?.trim() || null : null,
      sinPlan: e.planId == null,
      cuenta,
      avisos: anulada ? [] : avisos,
      saldoEspecie: anulada || !clave ? null : cascadaDeFila(filaBalance(clave)),
      saldoTotal: anulada || (clave !== "" && !delRegistro) ? null : cascadaTotal(),
    });
  }

  const cierre = cascadaDelPlan(clavesDelTotal().map(filaBalance));
  const fueraDelRegistro = sinBase
    ? []
    : [...acum.keys()].filter((k) => !registro.has(k)).map((k) => cascadaDeFila(filaBalance(k)));

  const especies: EspecieKardex[] = [
    ...[...registro].map(([clave, r]) => ({
      clave,
      nombre: r.nombre,
      delRegistro: true,
      baseM3: r4(r.base),
    })),
    ...[...acum.keys()]
      .filter((k) => !registro.has(k))
      .map((clave) => ({
        clave,
        nombre: nombreDe.get(clave) ?? clave,
        delRegistro: sinBase,
        baseM3: 0,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  ];

  return { filas, especies, sinBase, cierre, fueraDelRegistro };
}

/** El saldo antes del primer movimiento: la base entera por talar. */
export function saldoInicial(k: KardexPermiso, clave: string | null): CascadaEspecie {
  const base =
    clave == null
      ? k.especies.filter((e) => e.delRegistro).reduce((a, e) => a + e.baseM3, 0)
      : (k.especies.find((e) => e.clave === clave)?.baseM3 ?? 0);
  return cascadaDeFila({
    species: clave == null ? "Total" : (k.especies.find((e) => e.clave === clave)?.nombre ?? clave),
    cites: false,
    autorizado: base,
    talado: 0,
    trozado: 0,
    movilizado: 0,
    consumido: 0,
  });
}

/** Las filas que se ven: todas, o las de una especie. */
export function filasDelKardex(k: KardexPermiso, clave: string | null): FilaKardex[] {
  return clave == null ? k.filas : k.filas.filter((f) => f.clave === clave);
}

/** El saldo de una fila según lo que se mira (el permiso o una especie). */
export function saldoDeFila(f: FilaKardex, clave: string | null): CascadaEspecie | null {
  return clave == null ? f.saldoTotal : f.saldoEspecie;
}

/** Cómo cierra lo que se mira: la cascada del permiso o la de una especie. */
export function cierreDelKardex(k: KardexPermiso, clave: string | null): CascadaEspecie | null {
  if (clave == null) return k.cierre.total;
  return (
    k.cierre.especies.find((e) => claveEspecie(e.especie) === clave) ??
    k.fueraDelRegistro.find((e) => claveEspecie(e.especie) === clave) ??
    null
  );
}

export interface ResumenKardex {
  /** Movimientos vigentes (los anulados aparte). */
  movimientos: number;
  anulados: number;
  /** Σ de lo que entró al área (tala) y de lo que salió (despacho de troza + consumo). */
  entraM3: number;
  saleM3: number;
  /** Σ de lo trozado: no entra ni sale, pasa del monte al patio. */
  transformadoM3: number;
}

/** Totales de unas filas. Sólo cuenta lo que mueve el saldo de lo que se mira. */
export function resumirKardex(filas: readonly FilaKardex[], clave: string | null): ResumenKardex {
  let entra = 0;
  let sale = 0;
  let transformado = 0;
  let movimientos = 0;
  let anulados = 0;
  for (const f of filas) {
    if (f.anulada) {
      anulados += 1;
      continue;
    }
    movimientos += 1;
    if (!f.cuenta || (clave == null && f.saldoTotal == null)) continue;
    entra += f.entraM3 ?? 0;
    sale += f.saleM3 ?? 0;
    if (f.movimiento === "trozado") transformado += f.m3 ?? 0;
  }
  return {
    movimientos,
    anulados,
    entraM3: r4(entra),
    saleM3: r4(sale),
    transformadoM3: r4(transformado),
  };
}

// ─── Cuadre con «Volumen del permiso» ──────────────────────────────────────

export const CAMPOS_CUADRE = [
  ["baseM3", "Base"],
  ["taladoM3", "Talado"],
  ["enPieM3", "Por talar"],
  ["taladoSinTrozarM3", "Talado sin trozar"],
  ["enPatioM3", "En patio"],
  ["despachadoM3", "Despachado"],
  ["consumidoM3", "Consumido"],
] as const satisfies readonly (readonly [keyof CascadaEspecie, string])[];

export interface DiferenciaCuadre {
  especie: string;
  campo: string;
  kardexM3: number;
  franjaM3: number;
}

export interface CuadreKardex {
  cuadra: boolean;
  diferencias: DiferenciaCuadre[];
}

/**
 * ¿El cierre del kárdex dice lo mismo que la franja «Volumen del permiso»
 * (que viene del servidor)? Tolerancia: 10 litros, lo fino de una cinta.
 */
export function cuadrarConCascada(
  cierre: CascadaPlan,
  franja: CascadaPlan,
  tol = TOLERANCIA_CASCADA_M3,
): CuadreKardex {
  const diferencias: DiferenciaCuadre[] = [];
  const comparar = (
    especie: string,
    a: CascadaEspecie | undefined,
    b: CascadaEspecie | undefined,
  ) => {
    for (const [k, label] of CAMPOS_CUADRE) {
      const va = a ? (a[k] as number) : 0;
      const vb = b ? (b[k] as number) : 0;
      if (Math.abs(va - vb) > tol)
        diferencias.push({ especie, campo: label, kardexM3: va, franjaM3: vb });
    }
  };
  const claves = new Set(
    [...cierre.especies, ...franja.especies].map((e) => claveEspecie(e.especie)),
  );
  for (const k of claves) {
    const a = cierre.especies.find((e) => claveEspecie(e.especie) === k);
    const b = franja.especies.find((e) => claveEspecie(e.especie) === k);
    comparar(a?.especie ?? b?.especie ?? k, a, b);
  }
  comparar("Total", cierre.total, franja.total);
  return { cuadra: diferencias.length === 0, diferencias };
}
