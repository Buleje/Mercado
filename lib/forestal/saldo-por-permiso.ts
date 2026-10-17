/**
 * Saldo por permiso — cuánto producto puede salir todavía de un título
 * habilitante, y cuánto de eso ya se declaró SIN LOTE.
 *
 * El caso (Brandon, 2026-09-10): la producción sin lote (ADR-408) nace sin
 * materia prima atribuida. Declarar a qué permiso se va a vincular
 * —`ForestCtpEntry.originCode`, el permiso declarado del asiento, ADR-402—
 * permite responder la pregunta que hoy no tiene pantalla: *«bajo este permiso
 * entraron N m³ de rolliza; si al 56 % dan P pies tablares y ya declaré Q sin
 * lote, ¿cuánto me queda?»*.
 *
 * ## Qué es esto y qué NO es
 *
 * Es una **simulación**, y por eso vive en su propio apartado: no mueve saldos,
 * no consume trozas, no toca ninguna otra pestaña del libro. Lo que se ve acá
 * sale de dos hechos que el libro YA registra:
 *
 *   1. la rolliza que entró bajo ese permiso (`WoodEntry.originCode` de las
 *      guías, troza por troza);
 *   2. las corridas de producción **sin materia prima atribuida** que declaran
 *      ese permiso en su asiento.
 *
 * ⚠️ **El 56 % es un TECHO, no un rendimiento** (ADR-358). `aserrableM3` es
 * «no más de esto», nunca «esto va a salir». Se dice en la pantalla con esas
 * palabras: un número de cota máxima leído como promesa es madera vendida que
 * no existe.
 *
 * ⚠️ **Lo que se resta es SOLO producción sin lote.** Una corrida que consumió
 * trozas ya descontó su madera del patio —la pieza queda consumida— así que
 * restarla otra vez contaría dos veces la misma madera. Por eso la base normal
 * es la rolliza DISPONIBLE (`base: "patio"`): lo que todavía puede entrar a la
 * sierra. `base: "ingresado"` mira todo lo que entró alguna vez bajo el permiso
 * y sirve para otra pregunta —cuánto amparó el título en total—, no para saber
 * qué queda.
 *
 * PURO: sin DB y sin React. El servidor agrega la rolliza (`agregarRolliza`) y
 * el cliente arma las filas (`saldoPorPermiso`), para que cambiar de base no
 * pida datos de nuevo y la aritmética viva en un solo lugar.
 */

import { PT_POR_M3, pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { estaDisponible, type TrozaConsumible } from "./consumo-trozas";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const txt = (v: unknown) => String(v ?? "").trim();

/** Cómo se nombra en pantalla lo que no declaró título habilitante. */
export const SIN_PERMISO = "Sin permiso declarado";
/** Y lo que no declaró especie — es una categoría real, no un hueco a ocultar. */
export const SIN_ESPECIE = "Sin especie declarada";

/* ── Lo que el servidor agrega ────────────────────────────────────────────── */

/** La rolliza de UNA especie bajo UN permiso, en sus dos lecturas. */
export interface RollizaDeEspecie {
  /** Etiqueta legible — la primera forma en que se escribió el nombre. */
  especie: string;
  /** Clave normalizada: «TORNILLO» y «Tornillo» son la misma madera. */
  clave: string;
  /** Piezas que todavía pueden entrar a la sierra hoy. */
  piezasDisponibles: number;
  m3Disponible: number;
  /** Todas las que entraron bajo el permiso, se hayan aserrado o no. */
  piezasIngresadas: number;
  m3Ingresado: number;
}

export interface RollizaDePermiso {
  /** `null` = trozas sin título habilitante cargado en su guía. */
  permiso: string | null;
  especies: RollizaDeEspecie[];
}

/** Una corrida de producción SIN materia prima atribuida (la que se resta). */
export interface CorridaSinOrigen {
  id: string;
  lineNo: number | null;
  /** ISO date-only o datetime; se muestra tal cual llega. */
  fecha: string;
  especie: string | null;
  /** El permiso DECLARADO del asiento (ADR-402). `null` = no declaró ninguno. */
  permiso: string | null;
  cantidad: number;
  /** `m3 | pt | kg | unidad`. Sólo `m3` se puede restar de un volumen. */
  unidad: string | null;
  /** Referencia libre de materia prima — para reconocer la corrida en la lista. */
  referencia: string | null;
}

/**
 * Agrupa el patio por permiso y especie. Corre en el servidor sobre la misma
 * lectura que usa Consumos (`trozasComoConsumibles`), así que una pieza
 * bloqueada cuenta como ingresada y NO como disponible — el mismo criterio con
 * el que el patio decide qué se puede llevar a la sierra.
 */
export function agregarRolliza(trozas: readonly TrozaConsumible[]): RollizaDePermiso[] {
  const porPermiso = new Map<string, Map<string, RollizaDeEspecie>>();

  for (const t of trozas) {
    const permiso = txt(t.permiso);
    const especies = porPermiso.get(permiso) ?? new Map<string, RollizaDeEspecie>();
    if (!porPermiso.has(permiso)) porPermiso.set(permiso, especies);

    const nombre = txt(t.especieComun);
    const clave = claveEspecie(nombre);
    const fila = especies.get(clave) ?? {
      especie: nombre || SIN_ESPECIE,
      clave,
      piezasDisponibles: 0,
      m3Disponible: 0,
      piezasIngresadas: 0,
      m3Ingresado: 0,
    };
    if (!especies.has(clave)) especies.set(clave, fila);

    const m3 = Number(t.volumenM3 ?? 0) || 0;
    fila.piezasIngresadas += 1;
    fila.m3Ingresado += m3;
    if (estaDisponible(t)) {
      fila.piezasDisponibles += 1;
      fila.m3Disponible += m3;
    }
  }

  return [...porPermiso.entries()]
    .map(([permiso, especies]) => ({
      permiso: permiso || null,
      especies: [...especies.values()]
        .map((e) => ({ ...e, m3Disponible: r4(e.m3Disponible), m3Ingresado: r4(e.m3Ingresado) }))
        .sort((a, b) => b.m3Ingresado - a.m3Ingresado || a.especie.localeCompare(b.especie, "es")),
    }))
    .sort((a, b) => {
      const suma = (p: RollizaDePermiso) => p.especies.reduce((x, e) => x + e.m3Ingresado, 0);
      return suma(b) - suma(a);
    });
}

/* ── Lo que el cliente arma ───────────────────────────────────────────────── */

/** Qué rolliza se mira: la que queda en patio o todo lo que entró. */
export type BaseDeSaldo = "patio" | "ingresado";

export interface FilaEspecieDePermiso {
  especie: string;
  clave: string;
  piezas: number;
  /** m³ de rolliza según la base elegida. */
  rollizaM3: number;
  /** m³ de producto que esa rolliza puede dar COMO MÁXIMO (56 %). */
  aserrableM3: number;
  /** Los mismos m³ en pies tablares — la conversión de la plaza (÷424). */
  aserrablePt: number;
  /** Lo ya declarado sin lote bajo este permiso para esta especie. */
  producidoM3: number;
  producidoPt: number;
  /** Cuánta rolliza «gastó» eso: producido ÷ 56 %. */
  rollizaEquivalenteM3: number;
  /** Lo que queda por producir bajo el permiso. Negativo = se pasó. */
  sobranteM3: number;
  sobrantePt: number;
  /** Rolliza que queda sin comprometer. Negativo = se pasó. */
  rollizaSobranteM3: number;
  /** Cuántas corridas sin lote componen `producidoM3`. */
  corridas: number;
}

export interface TotalesDePermiso {
  piezas: number;
  rollizaM3: number;
  aserrableM3: number;
  aserrablePt: number;
  producidoM3: number;
  producidoPt: number;
  sobranteM3: number;
  sobrantePt: number;
  rollizaSobranteM3: number;
}

export interface SaldoDePermiso {
  permiso: string | null;
  etiqueta: string;
  especies: FilaEspecieDePermiso[];
  totales: TotalesDePermiso;
  /** Las corridas sin lote que alimentan las restas — el detrás de la cifra. */
  corridas: CorridaSinOrigen[];
  /**
   * Corridas sin lote de este permiso que NO se pudieron restar porque no
   * declaran m³ (pt, kg, unidad). No se convierten: un m³ inventado en el libro
   * es peor que un campo vacío. Se listan para que se vean.
   */
  sinUnidadM3: CorridaSinOrigen[];
  /** `true` si alguna especie quedó en rojo: se declaró más de lo posible. */
  hayExceso: boolean;
}

/** ¿Esta corrida declara en metros cúbicos? Lo demás no se resta de un volumen. */
export const declaraEnM3 = (c: Pick<CorridaSinOrigen, "unidad">): boolean =>
  txt(c.unidad).toLowerCase() === "m3";

/**
 * Arma el saldo de cada permiso: la rolliza, su techo al 56 %, lo ya declarado
 * sin lote y lo que queda.
 *
 * Una especie aparece si tiene rolliza O si tiene producción declarada: una
 * corrida sin lote atribuida a un permiso que no tiene esa madera es
 * exactamente lo que hay que poder ver —queda con rolliza 0 y sobrante en
 * rojo—, no algo que esconder.
 */
export function saldoPorPermiso(
  rolliza: readonly RollizaDePermiso[],
  corridas: readonly CorridaSinOrigen[],
  opts: { base?: BaseDeSaldo } = {},
): SaldoDePermiso[] {
  const base = opts.base ?? "patio";
  const permisos = new Map<
    string,
    { permiso: string | null; especies: Map<string, FilaEspecieDePermiso> }
  >();

  const grupo = (permiso: string | null) => {
    const k = txt(permiso);
    const previo = permisos.get(k);
    if (previo) return previo;
    const nuevo = { permiso: permiso || null, especies: new Map<string, FilaEspecieDePermiso>() };
    permisos.set(k, nuevo);
    return nuevo;
  };

  const fila = (permiso: string | null, nombre: string, clave: string) => {
    const g = grupo(permiso);
    const previa = g.especies.get(clave);
    if (previa) return previa;
    const nueva: FilaEspecieDePermiso = {
      especie: nombre || SIN_ESPECIE,
      clave,
      piezas: 0,
      rollizaM3: 0,
      aserrableM3: 0,
      aserrablePt: 0,
      producidoM3: 0,
      producidoPt: 0,
      rollizaEquivalenteM3: 0,
      sobranteM3: 0,
      sobrantePt: 0,
      rollizaSobranteM3: 0,
      corridas: 0,
    };
    g.especies.set(clave, nueva);
    return nueva;
  };

  for (const p of rolliza) {
    for (const e of p.especies) {
      const f = fila(p.permiso, e.especie, e.clave);
      f.piezas += base === "patio" ? e.piezasDisponibles : e.piezasIngresadas;
      f.rollizaM3 = r4(f.rollizaM3 + (base === "patio" ? e.m3Disponible : e.m3Ingresado));
    }
  }

  const porPermisoCorridas = new Map<string, CorridaSinOrigen[]>();
  const sinUnidad = new Map<string, CorridaSinOrigen[]>();
  for (const c of corridas) {
    const k = txt(c.permiso);
    const lista = porPermisoCorridas.get(k) ?? [];
    lista.push(c);
    porPermisoCorridas.set(k, lista);
    if (!declaraEnM3(c)) {
      const otras = sinUnidad.get(k) ?? [];
      otras.push(c);
      sinUnidad.set(k, otras);
      /* Igual crea el grupo: un permiso cuya única producción está en pt tiene
         que aparecer en la lista, aunque no se le pueda restar nada. */
      grupo(c.permiso);
      continue;
    }
    const nombre = txt(c.especie);
    const f = fila(c.permiso, nombre, claveEspecie(nombre));
    f.producidoM3 = r4(f.producidoM3 + (Number(c.cantidad) || 0));
    f.corridas += 1;
  }

  return [...permisos.values()]
    .map(({ permiso, especies }) => {
      const filas = [...especies.values()]
        .map((f) => {
          const aserrableM3 = r4(f.rollizaM3 * RENDIMIENTO_META);
          const aserrablePt = pieTablarAserrableDe(f.rollizaM3, RENDIMIENTO_META);
          const producidoPt = Math.round(f.producidoM3 * PT_POR_M3);
          const sobranteM3 = r4(aserrableM3 - f.producidoM3);
          return {
            ...f,
            aserrableM3,
            aserrablePt,
            producidoPt,
            /* Producido ÷ 56 %: la rolliza que haría falta para sacarlo. */
            rollizaEquivalenteM3: f.producidoM3 > 0 ? r4(f.producidoM3 / RENDIMIENTO_META) : 0,
            sobranteM3,
            /* Resta de los dos PT que la pantalla ya muestra, no un tercer
               redondeo: tres cifras contiguas tienen que cerrar a la vista. */
            sobrantePt: aserrablePt - producidoPt,
            rollizaSobranteM3: r4(
              f.rollizaM3 - (f.producidoM3 > 0 ? f.producidoM3 / RENDIMIENTO_META : 0),
            ),
          };
        })
        .sort((a, b) => b.rollizaM3 - a.rollizaM3 || a.especie.localeCompare(b.especie, "es"));

      const totales = filas.reduce<TotalesDePermiso>(
        (a, f) => ({
          piezas: a.piezas + f.piezas,
          rollizaM3: r4(a.rollizaM3 + f.rollizaM3),
          aserrableM3: r4(a.aserrableM3 + f.aserrableM3),
          aserrablePt: a.aserrablePt + f.aserrablePt,
          producidoM3: r4(a.producidoM3 + f.producidoM3),
          producidoPt: a.producidoPt + f.producidoPt,
          sobranteM3: r4(a.sobranteM3 + f.sobranteM3),
          sobrantePt: a.sobrantePt + f.sobrantePt,
          rollizaSobranteM3: r4(a.rollizaSobranteM3 + f.rollizaSobranteM3),
        }),
        {
          piezas: 0,
          rollizaM3: 0,
          aserrableM3: 0,
          aserrablePt: 0,
          producidoM3: 0,
          producidoPt: 0,
          sobranteM3: 0,
          sobrantePt: 0,
          rollizaSobranteM3: 0,
        },
      );

      const k = txt(permiso);
      return {
        permiso,
        etiqueta: permiso ?? SIN_PERMISO,
        especies: filas,
        totales,
        corridas: porPermisoCorridas.get(k) ?? [],
        sinUnidadM3: sinUnidad.get(k) ?? [],
        /* Una milésima de m³ es redondeo de cubicación, no sobreproducción: la
           tolerancia sale de cómo se mide la madera, no del epsilon del float. */
        hayExceso: filas.some((f) => f.sobranteM3 < -0.001),
      };
    })
    .sort((a, b) => {
      /* Primero los que tienen algo que mirar: producción declarada, después
         rolliza. Un permiso sin nada abajo de todo. */
      const peso = (s: SaldoDePermiso) => s.totales.producidoM3 * 1000 + s.totales.rollizaM3;
      return peso(b) - peso(a) || a.etiqueta.localeCompare(b.etiqueta, "es");
    });
}

/**
 * El saldo de UN permiso como si la producción que se está por registrar ya
 * estuviera declarada — la simulación del modal «Producir sin lote».
 *
 * No hay aritmética nueva: la corrida en borrador entra como una más y todo lo
 * demás sale de `saldoPorPermiso`. Dos cuentas paralelas para el mismo número
 * divergen a la primera columna que se agregue.
 */
export function simularCorrida(
  rolliza: readonly RollizaDePermiso[],
  corridas: readonly CorridaSinOrigen[],
  borrador: CorridaSinOrigen,
  opts: { base?: BaseDeSaldo } = {},
): { antes: SaldoDePermiso | null; despues: SaldoDePermiso | null } {
  const k = txt(borrador.permiso);
  const de = (lista: readonly CorridaSinOrigen[]) =>
    saldoPorPermiso(rolliza, lista, opts).find((s) => txt(s.permiso) === k) ?? null;
  return { antes: de(corridas), despues: de([...corridas, borrador]) };
}
