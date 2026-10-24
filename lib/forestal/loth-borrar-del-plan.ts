/**
 * Borrar las operaciones de UN plan de manejo del Libro TH (pedido de Brandon
 * 07-10-2026: «eliminar todas las operaciones de ese plan, sea tala, trozado,
 * despacho») y de lo elegido en «Secciones» (filtro o casillas, de varios
 * planes). Seguro para cliente y servidor: sin Prisma.
 *
 * El borrado es lógico (`deletedAt`) y respeta, línea por línea, las mismas
 * guardas que borrar UNA línea (`ForestLothDB.softDelete`):
 *
 *   · mes cerrado        → no se toca (el acta es inmutable hasta reabrir);
 *   · ya en el Libro CTP → no se toca (la troza del CTP perdería su origen);
 *
 * y una más, propia del bloque: nunca deja una línea viva colgando de otra
 * borrada. Se borra de la salida hacia la fuente —despachos y consumo, producto
 * terminado, trozado, tala— y una línea cuya hija registrada QUEDA viva (porque
 * no se pidió su sección o porque se saltó) también se salta. Así una tala con
 * trozado vivo no se borra: el trozado quedaría sin árbol (T4) y su troza sin
 * origen.
 */

import type { LothSection } from "@/lib/forestal/loth-constants";

/** De la salida a la fuente: lo que depende de otra línea se borra antes. */
export const ORDEN_DE_BORRADO: readonly LothSection[] = [
  "despacho_troza",
  "consumo_troza",
  "despacho_producto",
  "producto_terminado",
  "trozado",
  "tala",
];

export type MotivoSalto = "mes_cerrado" | "en_ctp" | "tiene_trozado" | "tiene_salida" | "tiene_despacho_producto";

export interface ConteoSeccionBorrar {
  section: LothSection;
  /** Líneas no borradas del plan (registradas + anuladas). */
  lineas: number;
  anuladas: number;
  /** Volumen de las registradas (las anuladas no cuentan en ningún saldo). */
  m3: number;
  /** De ésas, cuántas están en un mes cerrado: no se van a borrar. */
  cerradas: number;
}

export interface ConteoBorrarDelPlan {
  planId: string;
  total: number;
  m3: number;
  secciones: ConteoSeccionBorrar[];
}

export interface SaltoBorrar {
  section: LothSection;
  motivo: MotivoSalto;
  n: number;
  /** Hasta 5 referencias (árbol, troza o N° de línea) para que se encuentren. */
  ejemplos: string[];
  /** Sólo `mes_cerrado`: los meses. */
  periodos?: string[];
}

export interface ResultadoBorrarDelPlan {
  planId: string;
  borradas: number;
  m3: number;
  porSeccion: Array<{ section: LothSection; borradas: number; m3: number }>;
  saltadas: SaltoBorrar[];
  /** Árboles del censo que volvieron a «en pie» al quedar sin tala vigente. */
  arbolesLiberados: number;
}

/**
 * Lo borrado elegido línea por línea en «Secciones» (pueden ser varias
 * secciones y varios planes). `simulado` = vista previa: nada se escribió.
 */
export interface ResultadoBorrarLineas {
  simulado: boolean;
  /** Ids que llegaron (incluidos los que se sumaron por «lo que cuelga»). */
  pedidas: number;
  /** Ids que no son líneas vivas de este negocio: no se miran ni se cuentan. */
  ignoradas: number;
  /** Líneas que se sumaron por «incluir lo que cuelga» (trozado, despachos). */
  agregadas: number;
  borradas: number;
  m3: number;
  porSeccion: Array<{ section: LothSection; borradas: number; m3: number }>;
  porPlan: Array<{ planId: string | null; borradas: number; m3: number }>;
  saltadas: SaltoBorrar[];
  arbolesLiberados: number;
}

export interface LineaParaBorrar {
  id: string;
  section: string;
  status: string;
  lineNo: number;
  treeCode: string | null;
  trozaCode: string | null;
  volumeM3: number;
  entryDate: Date;
  /** El plan de la línea: una hija sólo frena a la fuente de su mismo plan (o sin plan). */
  planId?: string | null;
  /** Se pidió borrarla. Las demás sólo frenan (son hijas que quedan vivas). */
  pedida?: boolean;
  /** `planearBorradoDelPlan`: `false` = línea sin plan que cuelga de este plan. */
  delPlan?: boolean;
}

const SALIDAS_DE_TROZA = new Set(["despacho_troza", "consumo_troza"]);
const codigo = (c: string | null | undefined) => c?.trim() || null;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function esSeccion(s: string): s is LothSection {
  return (ORDEN_DE_BORRADO as readonly string[]).includes(s);
}

/** Cuántas líneas tiene el plan por sección, para decirlo ANTES de borrar. */
export function contarLineasDelPlan(
  planId: string,
  lineas: ReadonlyArray<Pick<LineaParaBorrar, "section" | "status" | "volumeM3" | "entryDate">>,
  mesCerrado: (d: Date) => string | null,
): ConteoBorrarDelPlan {
  const porSeccion = new Map<LothSection, ConteoSeccionBorrar>();
  for (const l of lineas) {
    if (!esSeccion(l.section)) continue;
    const s = porSeccion.get(l.section) ?? { section: l.section, lineas: 0, anuladas: 0, m3: 0, cerradas: 0 };
    porSeccion.set(l.section, s);
    s.lineas += 1;
    if (l.status === "anulado") s.anuladas += 1;
    else s.m3 = r4(s.m3 + (l.volumeM3 || 0));
    if (mesCerrado(l.entryDate)) s.cerradas += 1;
  }
  /* En el orden del libro (tala primero), que es como se lee la pantalla. */
  const secciones = [...ORDEN_DE_BORRADO].reverse().flatMap((s) => porSeccion.get(s) ?? []);
  return {
    planId,
    total: secciones.reduce((a, s) => a + s.lineas, 0),
    m3: r4(secciones.reduce((a, s) => a + s.m3, 0)),
    secciones,
  };
}

function referencia(l: LineaParaBorrar): string {
  return codigo(l.trozaCode) ?? codigo(l.treeCode) ?? `#${l.lineNo}`;
}

/** Mismo árbol o troza sólo dentro del mismo plan; una línea sin plan puede ser de cualquiera. */
const mismoPlan = (a: string | null | undefined, b: string | null | undefined) => a == null || b == null || a === b;

/**
 * Decide qué se borra y qué se salta (con su motivo). Puro: la DB le pasa las
 * líneas pedidas (`pedida`) y las hijas vivas que podrían quedar colgando, el
 * mes cerrado de cada fecha y las líneas que el Libro CTP frena.
 */
export function planearBorrado(input: {
  lineas: readonly LineaParaBorrar[];
  mesCerrado: (d: Date) => string | null;
  enCtp: ReadonlySet<string>;
}): { porSeccion: Map<LothSection, LineaParaBorrar[]>; saltadas: SaltoBorrar[] } {
  const borradas = new Set<string>();
  /* Registrada y que no se va: la única que deja colgando a su fuente. */
  const quedaViva = (l: LineaParaBorrar) => l.status === "registrado" && !borradas.has(l.id);
  const porSeccion = new Map<LothSection, LineaParaBorrar[]>();
  const saltos = new Map<string, SaltoBorrar & { _periodos: Set<string> }>();
  const saltar = (l: LineaParaBorrar, section: LothSection, motivo: MotivoSalto, periodo?: string) => {
    const k = `${section}|${motivo}`;
    const s = saltos.get(k) ?? { section, motivo, n: 0, ejemplos: [], _periodos: new Set<string>() };
    saltos.set(k, s);
    s.n += 1;
    if (s.ejemplos.length < 5) s.ejemplos.push(referencia(l));
    if (periodo) s._periodos.add(periodo);
  };

  /* Índices por código: con 5.000 líneas elegidas, buscar la hija recorriendo
     todo el libro por cada una eran ~25 M comparaciones dentro de la tx. */
  const indice = (pred: (x: LineaParaBorrar) => boolean, clave: (x: LineaParaBorrar) => string | null) => {
    const m = new Map<string, LineaParaBorrar[]>();
    for (const x of input.lineas) {
      const k = pred(x) ? clave(x) : null;
      if (k == null) continue;
      const lista = m.get(k);
      if (lista) lista.push(x);
      else m.set(k, [x]);
    }
    return m;
  };
  const trozadosPorArbol = indice((x) => x.section === "trozado", (x) => codigo(x.treeCode));
  const salidasPorTroza = indice((x) => SALIDAS_DE_TROZA.has(x.section), (x) => codigo(x.trozaCode));
  const despProductoPorPlan = indice((x) => x.section === "despacho_producto", (x) => x.planId ?? "∅");

  const dependencia = (l: LineaParaBorrar, section: LothSection): MotivoSalto | null => {
    /* Una anulada ya no sostiene nada en el libro: se puede borrar sin mirar. */
    if (l.status !== "registrado") return null;
    const hijaViva = (x: LineaParaBorrar) => x.id !== l.id && mismoPlan(x.planId, l.planId) && quedaViva(x);
    if (section === "tala") {
      const arbol = codigo(l.treeCode);
      if (arbol && (trozadosPorArbol.get(arbol) ?? []).some(hijaViva)) return "tiene_trozado";
    }
    if (section === "trozado") {
      const troza = codigo(l.trozaCode);
      if (troza && (salidasPorTroza.get(troza) ?? []).some(hijaViva)) return "tiene_salida";
    }
    /* T5 (Σ despacho de producto ≤ Σ producto terminado) es del plan entero: el MISMO plan. */
    if (section === "producto_terminado" && (despProductoPorPlan.get(l.planId ?? "∅") ?? []).some(quedaViva)) {
      return "tiene_despacho_producto";
    }
    return null;
  };

  for (const section of ORDEN_DE_BORRADO) {
    const delaSeccion = input.lineas.filter((l) => l.pedida && l.section === section).sort((a, b) => a.lineNo - b.lineNo);
    for (const l of delaSeccion) {
      const periodo = input.mesCerrado(l.entryDate);
      if (periodo) { saltar(l, section, "mes_cerrado", periodo); continue; }
      if (input.enCtp.has(l.id)) { saltar(l, section, "en_ctp"); continue; }
      const motivo = dependencia(l, section);
      if (motivo) { saltar(l, section, motivo); continue; }
      borradas.add(l.id);
      const lista = porSeccion.get(section) ?? [];
      lista.push(l);
      porSeccion.set(section, lista);
    }
  }

  const saltadas = [...saltos.values()].map(({ _periodos, ...s }) =>
    _periodos.size > 0 ? { ...s, periodos: [..._periodos].sort() } : s,
  );
  return { porSeccion, saltadas };
}

/**
 * El borrado de UN plan (Opciones › «Borrar operaciones del plan»): las líneas
 * del plan (`delPlan`) de las secciones elegidas. Las sin plan que cuelgan de
 * ellas sólo frenan.
 */
export function planearBorradoDelPlan(input: {
  lineas: readonly LineaParaBorrar[];
  secciones: readonly LothSection[];
  mesCerrado: (d: Date) => string | null;
  enCtp: ReadonlySet<string>;
}): { porSeccion: Map<LothSection, LineaParaBorrar[]>; saltadas: SaltoBorrar[] } {
  const pedidas = new Set<string>(input.secciones);
  return planearBorrado({
    lineas: input.lineas.map((l) => ({ ...l, pedida: l.delPlan === true && pedidas.has(l.section) })),
    mesCerrado: input.mesCerrado,
    enCtp: input.enCtp,
  });
}

/** Por qué una línea se quedó, en palabras de quien la va a buscar (borrado de un plan). */
export const MOTIVO_SALTO_TEXTO: Record<MotivoSalto, string> = {
  mes_cerrado: "están en un mes cerrado (reábrelo para borrarlas)",
  en_ctp: "sus trozas ya entraron a tu Libro CTP (anula ese ingreso primero)",
  tiene_trozado: "su árbol tiene trozado vivo (marca también Trozado)",
  tiene_salida: "su troza tiene despacho o consumo vivo (marca también esas secciones)",
  tiene_despacho_producto: "hay despachos de producto vivos (marca también Despacho de producto)",
};

/** Lo mismo para lo elegido en «Secciones»: ahí no hay casillas de sección, hay «lo que cuelga». */
export const MOTIVO_SALTO_TEXTO_LINEAS: Record<MotivoSalto, string> = {
  ...MOTIVO_SALTO_TEXTO,
  tiene_trozado: "su árbol tiene trozado vivo (marca «Incluir lo que cuelga»)",
  tiene_salida: "su troza tiene despacho o consumo vivo (marca «Incluir lo que cuelga»)",
  tiene_despacho_producto: "hay despachos de producto vivos de su plan (bórralos primero)",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una línea por salto: «Tala · 3 se quedaron: su árbol tiene trozado vivo (12, 13, 14)». */
export function textoDelSalto(
  s: SaltoBorrar,
  nombreSeccion: (s: LothSection) => string,
  textos: Record<MotivoSalto, string> = MOTIVO_SALTO_TEXTO,
): string {
  const cuando = s.periodos?.length ? ` · ${s.periodos.join(", ")}` : "";
  return `${nombreSeccion(s.section)} · ${plural(s.n, "se quedó", "se quedaron")}: ${textos[s.motivo]}${cuando} (${s.ejemplos.join(", ")}${s.n > s.ejemplos.length ? ", …" : ""})`;
}

/** Máximo de líneas por pedido (el filtro de una sección entera cabe de sobra). */
export const MAX_LINEAS_A_BORRAR = 5000;
