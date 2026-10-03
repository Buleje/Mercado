/**
 * reparto-cuadre — el cuadre de CIFRAS entre las vistas de la distribución.
 *
 * Brandon, 2026-10-03: «un apartado o modal donde se analiza, encuentre
 * variaciones, comparaciones entre la distribución, medidas y demás para saber
 * si hay diferencia, si es exacto, cuánto es la diferencia y cuadrar todo».
 *
 * La misma madera se cuenta en seis lugares de la pantalla —el lote cubicado,
 * las tarjetas Distribuido / Falta, la tabla de bloques, las medidas que
 * imprime el PDF, los Anexos 04 por permiso y el resumen por especie— y cada
 * uno suma por su cuenta. Este módulo cruza esas sumas y dice, control por
 * control, si dan lo mismo.
 *
 * NO es `reparto-revision` (bloque sin GTF, guía duplicada…: problemas de
 * DATOS) ni `cuadreDeDistribucion` (falta/libre/reprocesos). Esto es la
 * aritmética: que ninguna pieza se pierda ni se cuente dos veces entre vistas.
 *
 * Mismo criterio y vocabulario que «Comparar con el resumen» del Anexo 04
 * (`anexo04-comparar.ts`): Exacto / Redondeo / Difiere, tolerancia 0,01 PT y
 * 0,001 m³. Tolerancias en la unidad del negocio (regla
 * `verificacion-de-verdad` §4): las piezas son EXACTAS —una pieza de menos no
 * es redondeo—; el PT tolera el arrastre de redondear cada fila a 2 decimales
 * (hasta 0,5 PT) y el m³ el de redondear a 4 (hasta 0,01 m³ = diez litros).
 * Lo que pasa de eso es «Difiere» y se muestra con su número.
 */

import { toFeet, toInches, type PiezaCubicada, type Unidad } from "./cubicacion";
import {
  claveEspecie, esAserradaDirecta, esManual,
  type BloqueDistribuido, type Distribucion,
} from "./cubicacion-reparto";
import { fmtM3, fmtPct } from "./cubicacion-formato";
import { tipoDePieza } from "./cubicacion-tipo";
import { anexosPorPermiso, type AnexoDePermiso } from "./anexo-por-permiso";
import { TOLERANCIA_COMPARAR, type EstadoComparado } from "./anexo04-comparar";
import { TOL_REVISION_M3 } from "./reparto-revision";
import { filasDeMedidas } from "./distribucion-export";
import { esVariado } from "./variado-desglose";

export type EstadoCuadre = EstadoComparado;

/** La misma madera en las tres unidades con que se declara. */
export interface Trio {
  piezas: number;
  pt: number;
  m3: number;
}

export type IdControl =
  | "cubicado" | "lote" | "medidas" | "capacidad" | "anexos" | "medida" | "especie" | "huerfanas";

export type PestanaCuadre = "bloque" | "permiso" | "medida" | "especie";

export interface FilaCuadre {
  clave: string;
  /** Dónde mirar: «GTF 0231», «CON-25-UCA-0142», «Tornillo · 2×8×10». */
  rotulo: string;
  /** El contexto de una línea: especie, tipo, en cuántos bloques está… */
  nota?: string;
  esperado: Trio;
  obtenido: Trio;
  /** Obtenido − esperado, con signo. */
  diferencia: Trio;
  estado: EstadoCuadre;
  /** «tope» = lo obtenido tiene que ser ≤ lo esperado (capacidad), no igual. */
  relacion: "igual" | "tope";
  /** Para mirar, sin descuadre de cifras (rolliza que no ampara nada). */
  aviso?: boolean;
  /** Unidades que en este lado «esperado» no significan nada (un bloque sin tope de piezas). */
  omitir?: ("piezas" | "pt")[];
  comoCuadrar?: string;
}

export interface ControlCuadre {
  id: IdControl;
  titulo: string;
  /** La regla en una línea: «Lote cubicado = Distribuido + Falta». */
  regla: string;
  pestana: PestanaCuadre;
  /** Cómo se llaman las dos columnas en este control. */
  ladoEsperado: string;
  ladoObtenido: string;
  esperado: Trio;
  obtenido: Trio;
  diferencia: Trio;
  /** El peor entre el agregado y sus filas. */
  estado: EstadoCuadre;
  /** Sólo el del total (la fila de abajo de la tabla). */
  estadoTotal: EstadoCuadre;
  relacion: "igual" | "tope";
  /** La diferencia que se cita en la etiqueta: la de la fila que más difiere. */
  peor: Trio;
  filas: FilaCuadre[];
  /** Filas que difieren (0 si el control no tiene filas y cuadra). */
  difieren: number;
  avisos: number;
  comoCuadrar: string;
  /** Unidades sin sentido en el «esperado» del total (la capacidad no tiene PT). */
  omitir?: ("piezas" | "pt")[];
  /** Sin fila de total: el control es una lista (especies sin pareja). */
  sinTotal?: boolean;
}

export interface CuadreReparto {
  controles: ControlCuadre[];
  estado: EstadoCuadre;
  exactos: number;
  redondeo: number;
  /** Controles con alguna diferencia de verdad. */
  difieren: number;
  /** La diferencia más grande en m³ (valor absoluto) entre lo que difiere. */
  mayorM3: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const cero = (): Trio => ({ piezas: 0, pt: 0, m3: 0 });
const suma = (a: Trio, b: Trio): Trio => ({ piezas: a.piezas + b.piezas, pt: a.pt + b.pt, m3: a.m3 + b.m3 });
const redondear = (t: Trio): Trio => ({ piezas: Math.round(t.piezas * 1e6) / 1e6, pt: r2(t.pt), m3: r4(t.m3) });
const resta = (obtenido: Trio, esperado: Trio): Trio =>
  ({ piezas: Math.round((obtenido.piezas - esperado.piezas) * 1e6) / 1e6, pt: r4(obtenido.pt - esperado.pt), m3: r4(obtenido.m3 - esperado.m3) });
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pz = (n: number) => `${n.toLocaleString("es-PE")} ${Math.abs(n) === 1 ? "pieza" : "piezas"}`;

/** Compara en micro-unidades enteras: «≤ 0,01» sin el ruido del float. */
const dentro = (d: number, tol: number) => Math.round(Math.abs(d) * 1e6) <= Math.round(tol * 1e6);

/** Lo que el cubicador pierde por fila al guardar el PT con 2 decimales. */
const REDONDEO_PT_FILA = 0.005;
/** Lo que se pierde por fila al guardar el m³ con 4 decimales (los dos lados redondean). */
const REDONDEO_M3_FILA = 0.0001;
/** Lo que el reparto deja pasarse a un bloque para cerrar piezas sueltas (`TOL_CIERRE_M3` del motor). */
const TOL_CIERRE_M3 = 0.05;
/** Techo del redondeo: más de medio pie tablar ya no es arrastre de filas. */
const TOPE_REDONDEO_PT = 0.5;

/**
 * Exacto, redondeo o difiere. `filas` = cuántas filas redondeadas se sumaron:
 * la cota del redondeo crece con ellas, hasta su techo. Una pieza de diferencia
 * es siempre «difiere».
 */
export function estadoCuadre(dif: Trio, filas: number): EstadoCuadre {
  if (dif.piezas !== 0) return "difiere";
  if (dentro(dif.pt, TOLERANCIA_COMPARAR.pt) && dentro(dif.m3, TOLERANCIA_COMPARAR.m3)) return "exacto";
  const cotaPt = Math.min(TOPE_REDONDEO_PT, Math.max(TOLERANCIA_COMPARAR.pt, REDONDEO_PT_FILA * filas));
  const cotaM3 = Math.min(TOL_REVISION_M3, Math.max(TOLERANCIA_COMPARAR.m3, REDONDEO_M3_FILA * filas));
  return dentro(dif.pt, cotaPt) && dentro(dif.m3, cotaM3) ? "redondeo" : "difiere";
}

/** Para un tope (capacidad): pasarse es lo único que cuenta. */
function estadoTope(excesoM3: number, excesoPiezas: number): EstadoCuadre {
  if (excesoPiezas > 0) return "difiere";
  if (excesoM3 <= TOLERANCIA_COMPARAR.m3 + 1e-9) return "exacto";
  return excesoM3 <= TOL_REVISION_M3 + 1e-9 ? "redondeo" : "difiere";
}

const RANGO: Record<EstadoCuadre, number> = { exacto: 0, redondeo: 1, difiere: 2 };
const peorEstado = (xs: EstadoCuadre[]): EstadoCuadre =>
  xs.reduce<EstadoCuadre>((a, x) => (RANGO[x] > RANGO[a] ? x : a), "exacto");

/** Ordena: lo que difiere primero, después redondeo, avisos y al final lo exacto. */
const ordenFila = (f: FilaCuadre) => (f.estado === "difiere" ? 0 : f.estado === "redondeo" ? 1 : f.aviso ? 2 : 3);
const peso = (t: Trio) => Math.abs(t.m3) + Math.abs(t.piezas) * 1e3 + Math.abs(t.pt) / 424;

function fila(
  base: Omit<FilaCuadre, "diferencia" | "estado" | "relacion">,
  filasSumadas: number,
): FilaCuadre {
  const esperado = redondear(base.esperado);
  const obtenido = redondear(base.obtenido);
  const diferencia = resta(obtenido, esperado);
  return { ...base, esperado, obtenido, diferencia, estado: estadoCuadre(diferencia, filasSumadas), relacion: "igual" };
}

function control(
  base: Omit<ControlCuadre, "diferencia" | "estado" | "estadoTotal" | "peor" | "difieren" | "avisos" | "relacion" | "esperado" | "obtenido"> & {
    esperado: Trio; obtenido: Trio; filasSumadas: number; relacion?: "igual" | "tope";
  },
): ControlCuadre {
  const { filasSumadas, relacion = "igual", ...resto } = base;
  const esperado = redondear(base.esperado);
  const obtenido = redondear(base.obtenido);
  const diferencia = resta(obtenido, esperado);
  const agregado = relacion === "tope" ? "exacto" : estadoCuadre(diferencia, filasSumadas);
  const filas = [...base.filas].sort((a, b) => ordenFila(a) - ordenFila(b) || peso(b.diferencia) - peso(a.diferencia));
  const estado = peorEstado([agregado, ...filas.map((f) => f.estado)]);
  const difieren = filas.filter((f) => f.estado === "difiere").length || (agregado === "difiere" ? 1 : 0);
  const peorFila = filas.find((f) => f.estado === estado && f.estado !== "exacto");
  const peor = agregado === estado && estado !== "exacto" ? diferencia : peorFila?.diferencia ?? diferencia;
  return {
    ...resto, esperado, obtenido, diferencia, estado, estadoTotal: agregado, relacion, peor, filas, difieren,
    avisos: filas.filter((f) => f.aviso).length,
  };
}

const trioDe = (piezas: readonly PiezaCubicada[]): Trio =>
  piezas.reduce((a, p) => suma(a, { piezas: num(p.cantidad), pt: num(p.pieTablar), m3: num(p.m3) }), cero());

const trioDeBloque = (b: BloqueDistribuido): Trio => ({
  piezas: b.asignado.reduce((a, g) => a + g.piezas, 0),
  pt: b.asignado.reduce((a, g) => a + g.pieTablar, 0),
  m3: b.usadoM3,
});

/** Lo que imprime el bloque en el PDF: sus medidas, jornada por jornada. */
function trioImpreso(b: BloqueDistribuido): { trio: Trio; filas: number } {
  let trio = cero();
  let filas = 0;
  for (const d of b.porDia) for (const g of d.grupos) for (const m of g.medidas) {
    trio = suma(trio, { piezas: m.piezas, pt: m.pieTablar, m3: m.m3 });
    filas++;
  }
  return { trio, filas };
}

const rotuloBloque = (b: BloqueDistribuido) => b.bloque.etiqueta.trim() || "Bloque sin etiqueta";
/** La especie como la agrupa el motor: vacía y «Sin especie» son la misma fila. */
const claveEsp = (raw: string | null | undefined) => claveEspecie(raw?.trim() || "Sin especie");
/** La medida con sus unidades crudas — la MISMA clave con que el reparto parte un grupo. */
const claveMedida = (m: { espesor: number; ancho: number; largo: number; uEspesor: string; uAncho: string; uLargo: string }) =>
  `${m.espesor}${m.uEspesor}x${m.ancho}${m.uAncho}x${m.largo}${m.uLargo}`;
const medidaLegible = (m: { espesor: number; ancho: number; largo: number; uEspesor: string; uAncho: string; uLargo: string }) =>
  `${r2(toInches(m.espesor, m.uEspesor as Unidad))}×${r2(toInches(m.ancho, m.uAncho as Unidad))}×${r2(toFeet(m.largo, m.uLargo as Unidad))}`;

/**
 * Cruza todas las vistas de la distribución.
 *
 * @param piezas las que ENTRAN al reparto (con el Variado ya abierto).
 * @param cubicado el lote tal como se cubicó, si es distinto de `piezas`.
 * @param anexos los Anexos 04 por permiso; por defecto se arman de `dist`.
 */
export function cuadrarReparto(input: {
  dist: Distribucion;
  piezas: readonly PiezaCubicada[];
  cubicado?: readonly PiezaCubicada[];
  anexos?: readonly AnexoDePermiso[];
}): CuadreReparto {
  const { dist, piezas } = input;
  const anexos = input.anexos ?? anexosPorPermiso(dist);
  const bloques = dist.especies.flatMap((e) => e.bloques.map((b) => ({ b, especie: e.especie })));
  const t = dist.totales;
  const controles: ControlCuadre[] = [];

  /* Las dos tarjetas, con las MISMAS cuentas que `balance` en ResumenReparto. */
  const distribuido: Trio = {
    piezas: bloques.reduce((a, { b }) => a + trioDeBloque(b).piezas, 0),
    pt: t.amparadaPt,
    m3: t.amparadaM3,
  };
  const faltantes = dist.especies.flatMap((e) => e.faltante);
  const falta: Trio = {
    piezas: faltantes.reduce((a, f) => a + f.piezas, 0),
    pt: faltantes.reduce((a, f) => a + f.pieTablar, 0),
    m3: t.faltanteM3,
  };
  const lote = trioDe(piezas);
  const filasMedidas = bloques.reduce((a, { b }) => a + b.asignado.reduce((x, g) => x + g.medidas.length, 0), 0);

  // ── 0 · Cubicado = lo que entra al reparto (sólo si el Variado lo cambió) ──
  if (input.cubicado && input.cubicado !== piezas) {
    const cub = trioDe(input.cubicado);
    const dif = resta(redondear(lote), redondear(cub));
    controles.push(control({
      id: "cubicado",
      titulo: "Cubicado = lo que entra al reparto",
      regla: "Al abrir el Variado por especie no se pierde ni se suma ninguna pieza",
      pestana: "especie",
      ladoEsperado: "Cubicado",
      ladoObtenido: "Entra al reparto",
      esperado: cub,
      obtenido: lote,
      filasSumadas: input.cubicado.length + piezas.length,
      filas: [],
      comoCuadrar: dif.piezas !== 0
        ? `Al abrir el Variado ${dif.piezas < 0 ? "se perdieron" : "aparecieron"} ${pz(Math.abs(dif.piezas))}: revisa la tabla 6×6 del Variado (que no quede un paquete sin abrir ni una fila con cantidad 0).`
        : "El Variado abierto conserva todas las piezas del cubicado.",
    }));
  }

  /* Mismas piezas pero otro volumen = alguna línea con m³ escrito a mano
     (`m3Declarado`): el bloque declara lo tipeado, sus piezas dan otra cosa. */
  const conM3Escrito = (bs: readonly BloqueDistribuido[]) =>
    bs.filter((b) => b.asignado.some((g) => g.m3Declarado)).map(rotuloBloque);
  const porVolumen = (bs: readonly BloqueDistribuido[]) => {
    const escritos = conM3Escrito(bs);
    return escritos.length > 0
      ? `Mismas piezas, otro volumen: ${escritos.join(", ")} ${escritos.length === 1 ? "lleva" : "llevan"} m³ escritos a mano que no dan sus piezas. Corrígelo en «Por bloque».`
      : "Mismas piezas, otro volumen: alguna fila tiene el m³ o el PT escrito a mano. Mira «Por medida».";
  };

  // ── 1 · Lote = Distribuido + Falta ───────────────────────────────────────
  const conFalta = dist.especies.filter((e) => e.faltanteM3 > 0);
  const difLote = resta(redondear(suma(distribuido, falta)), redondear(lote));
  const estadoLote = estadoCuadre(difLote, piezas.length + filasMedidas);
  controles.push(control({
    id: "lote",
    titulo: "Lote = Distribuido + Falta",
    regla: "Cada pieza cubicada está en un bloque o en «Falta por distribuir», nunca en los dos ni en ninguno",
    pestana: "especie",
    ladoEsperado: "Lote cubicado",
    ladoObtenido: "Distribuido + falta",
    esperado: lote,
    obtenido: suma(distribuido, falta),
    filasSumadas: piezas.length + filasMedidas,
    filas: [],
    comoCuadrar: difLote.piezas !== 0
      ? `${pz(Math.abs(difLote.piezas))} ${difLote.piezas < 0 ? "no están ni en un bloque ni en la falta" : "se cuentan de más"}: mira «Por medida» para ver cuál.`
      : estadoLote === "difiere"
        ? porVolumen(bloques.map((x) => x.b))
        : conFalta.length > 0
        ? `Las cifras cuadran. Para no dejar nada sin papel: ${conFalta.map((e) => `agrega un bloque de ${e.especie} de ${fmtM3(e.rollizaFaltanteM3)} m³ de rolliza`).join("; ")} — o declara esa madera como ya aserrada.`
        : "Todo lo cubicado quedó repartido en los bloques.",
  }));

  // ── 2 · Medidas impresas = lo que ampara cada bloque ─────────────────────
  const filasBloque: FilaCuadre[] = bloques
    .filter(({ b }) => b.asignado.length > 0)
    .map(({ b, especie }) => {
      const impreso = trioImpreso(b);
      const declarada = b.asignado.find((g) => g.m3Declarado);
      const f = fila({
        clave: b.bloque.id,
        rotulo: rotuloBloque(b),
        nota: `${especie}${b.bloque.permiso ? ` · ${b.bloque.permiso}` : ""}${b.dias > 1 ? ` · ${b.dias} días` : ""}`,
        esperado: trioDeBloque(b),
        obtenido: impreso.trio,
      }, impreso.filas + b.asignado.length);
      if (f.estado === "difiere") {
        const fisico = declarada ? r4(declarada.medidas.reduce((a, m) => a + m.m3, 0)) : 0;
        f.comoCuadrar = declarada
          ? `La línea «${declarada.label}» lleva ${fmtM3(declarada.m3)} m³ escritos a mano y sus piezas dan ${fmtM3(fisico)} m³: el papel imprime las piezas. Borra el m³ escrito o corrige las piezas.`
          : "El detalle por día no suma lo que el bloque ampara: cambia los días del bloque y vuelve a ponerlos; si sigue, avísanos.";
      }
      return f;
    });
  const impresoTotal = filasDeMedidas(dist).reduce<Trio>((a, m) => suma(a, { piezas: m.piezas, pt: m.pieTablar, m3: m.m3 }), cero());
  controles.push(control({
    id: "medidas",
    titulo: "Medidas distribuidas = lo que amparan los bloques",
    regla: "Las medidas que imprime el PDF, bloque por bloque y día por día, suman lo que cada bloque ampara",
    pestana: "bloque",
    ladoEsperado: "Ampara el bloque",
    ladoObtenido: "Suman sus medidas",
    esperado: distribuido,
    obtenido: impresoTotal,
    filasSumadas: filasBloque.length + filasMedidas,
    filas: filasBloque,
    comoCuadrar: filasBloque.some((f) => f.estado === "difiere")
      ? "Revisa los bloques marcados: el papel imprimiría otra cifra que la tabla."
      : "Cada bloque imprime exactamente lo que ampara.",
  }));

  // ── 3 · Ningún bloque ampara más de lo que le cabe ───────────────────────
  const filasCapacidad: FilaCuadre[] = bloques.map(({ b, especie }) => {
    const usado = trioDeBloque(b);
    const tope = b.bloque.piezasManual != null && Number.isFinite(Number(b.bloque.piezasManual)) ? Number(b.bloque.piezasManual) : null;
    const esperado = redondear({ piezas: tope ?? usado.piezas, pt: usado.pt, m3: b.capacidadM3 });
    const obtenido = redondear(usado);
    const diferencia = resta(obtenido, esperado);
    const excesoM3 = r4(usado.m3 - b.capacidadM3);
    const excesoPz = tope == null ? 0 : usado.piezas - tope;
    const estado = estadoTope(excesoM3, excesoPz);
    let comoCuadrar: string | undefined;
    if (excesoPz > 0) comoCuadrar = `Lleva ${pz(excesoPz)} más que su tope de ${pz(tope ?? 0)}: sube el tope o quítalo.`;
    else if (estado !== "exacto") {
      const m3 = num(b.bloque.m3);
      const como = esAserradaDirecta(b.bloque)
        ? `sube su m³ (A) a ${fmtM3(Math.ceil(usado.m3 * 1000) / 1000)}`
        : esManual(b.bloque)
          ? `sube lo que declaraste que ampara a ${fmtM3(Math.ceil(usado.m3 * 1000) / 1000)} m³`
          : m3 > 0
            ? `sube el % aprovechable de ${fmtPct(b.aprovechablePct)} a ${fmtPct(Math.ceil((usado.m3 / m3) * 1000) / 10)} %`
            : "cárgale la rolliza que entró";
      const porque = b.asignado.some((g) => g.m3Declarado)
        ? "lleva m³ escritos a mano por encima de su capacidad"
        : excesoM3 <= TOL_CIERRE_M3
          ? "el reparto lo estiró unos litros para no dejar piezas sueltas sin papel"
          : "ampara más de lo que le cabe";
      comoCuadrar = `Se pasa ${fmtM3(excesoM3)} m³ de su capacidad (${fmtM3(b.capacidadM3)} m³) — ${porque}. Para cuadrarlo: ${como}, o deja que esas piezas pasen a otro bloque.`;
    }
    return {
      clave: b.bloque.id,
      rotulo: rotuloBloque(b),
      nota: `${especie} · ${esAserradaDirecta(b.bloque) ? "aserrada directa" : `${fmtM3(num(b.bloque.m3))} m³ (R) al ${fmtPct(b.aprovechablePct)} %`}${tope != null ? ` · tope ${tope} pzas` : ""}`,
      esperado, obtenido, diferencia, estado, relacion: "tope" as const, comoCuadrar,
      omitir: tope == null ? ["piezas", "pt"] : ["pt"],
    } satisfies FilaCuadre;
  });
  controles.push(control({
    id: "capacidad",
    titulo: "Cada bloque cabe en su capacidad",
    regla: "Lo que ampara un bloque es ≤ su capacidad (m³ × % aprovechable) y ≤ su tope de piezas",
    pestana: "bloque",
    ladoEsperado: "Le cabe",
    ladoObtenido: "Ampara",
    esperado: { piezas: distribuido.piezas, pt: distribuido.pt, m3: t.capacidadM3 },
    obtenido: distribuido,
    filasSumadas: bloques.length,
    relacion: "tope",
    omitir: ["piezas", "pt"],
    filas: filasCapacidad,
    comoCuadrar: filasCapacidad.some((f) => f.estado === "difiere")
      ? "Un bloque que ampara más de lo que le cabe es lo primero que mira un control: corrígelo antes de imprimir."
      : "Ningún bloque ampara más de lo que le cabe.",
  }));

  // ── 4 · Anexos 04 por permiso = Distribuido ──────────────────────────────
  const porId = new Map(bloques.map(({ b }) => [b.bloque.id, b] as const));
  const filasAnexo: FilaCuadre[] = anexos.map((a) => {
    const esperado = a.bloques.reduce<Trio>((acc, x) => {
      const b = porId.get(x.id);
      return b ? suma(acc, trioDeBloque(b)) : acc;
    }, cero());
    const f = fila({
      clave: a.permiso ?? "\u0000sin",
      rotulo: a.label,
      nota: `${a.bloques.length} ${a.bloques.length === 1 ? "bloque" : "bloques"} · ${a.especies.join(", ")}`,
      esperado,
      obtenido: { piezas: a.totalPiezas, pt: a.totalPt, m3: a.totalM3 },
    }, a.piezas.length + a.bloques.length);
    if (f.estado === "difiere") {
      f.comoCuadrar = `El detalle del anexo suma ${fmtM3(a.totalM3)} m³ y sus bloques amparan ${fmtM3(esperado.m3)} m³: revisa en «Por bloque» las líneas con m³ escrito a mano de ${a.bloques.map((b) => b.etiqueta).join(", ")}.`;
    } else if (a.permiso == null) {
      f.comoCuadrar = "Cuadra, pero el papel sale como «Sin permiso declarado»: ponle a esos bloques su N° de permiso.";
    }
    return f;
  });
  const sumaAnexos = anexos.reduce<Trio>((a, x) => suma(a, { piezas: x.totalPiezas, pt: x.totalPt, m3: x.totalM3 }), cero());
  controles.push(control({
    id: "anexos",
    titulo: "Anexos 04 por permiso = Distribuido",
    regla: "La suma de los Anexos 04 por permiso es lo distribuido, y cada anexo suma lo que sus bloques amparan",
    pestana: "permiso",
    ladoEsperado: "Amparan sus bloques",
    ladoObtenido: "Detalle del anexo",
    esperado: distribuido,
    obtenido: sumaAnexos,
    filasSumadas: anexos.reduce((a, x) => a + x.piezas.length, 0) + bloques.length,
    filas: filasAnexo,
    comoCuadrar: filasAnexo.some((f) => f.estado === "difiere")
      ? "Un anexo que no suma lo que sus bloques amparan declara un total que su detalle no sostiene: corrígelo antes de imprimir."
      : anexos.some((a) => a.permiso == null)
        ? "Las cifras cuadran; hay bloques sin N° de permiso."
        : "Cada permiso imprime lo que sus bloques amparan.",
  }));

  // ── 5 · Por medida: ninguna pieza se pierde ni se duplica ────────────────
  interface Acc { especie: string; medida: string; tipos: Set<string>; lote: Trio; dist: Trio; falta: Trio; bloques: Set<string>; filas: number }
  const medidas = new Map<string, Acc>();
  const acc = (esp: string, m: Parameters<typeof claveMedida>[0]): Acc => {
    const k = `${claveEsp(esp)}|${claveMedida(m)}`;
    let a = medidas.get(k);
    if (!a) {
      a = { especie: esp.trim() || "Sin especie", medida: medidaLegible(m), tipos: new Set(), lote: cero(), dist: cero(), falta: cero(), bloques: new Set(), filas: 0 };
      medidas.set(k, a);
    }
    return a;
  };
  for (const p of piezas) {
    const a = acc(p.especie ?? "", p);
    a.lote = suma(a.lote, { piezas: num(p.cantidad), pt: num(p.pieTablar), m3: num(p.m3) });
    a.tipos.add(tipoDePieza(p));
    a.filas++;
  }
  for (const e of dist.especies) {
    for (const b of e.bloques) for (const g of b.asignado) for (const m of g.medidas) {
      const a = acc(e.especie, m);
      a.dist = suma(a.dist, { piezas: m.piezas, pt: m.pieTablar, m3: m.m3 });
      a.bloques.add(rotuloBloque(b));
      a.filas++;
    }
    for (const f of e.faltante) for (const m of f.medidas) {
      const a = acc(e.especie, m);
      a.falta = suma(a.falta, { piezas: m.piezas, pt: m.pieTablar, m3: m.m3 });
      a.filas++;
    }
  }
  const filasMedida: FilaCuadre[] = [...medidas.entries()].map(([k, a]) => {
    const dentroDe = a.bloques.size === 0 ? "en ningún bloque" : a.bloques.size === 1 ? `en ${[...a.bloques][0]}` : `en ${a.bloques.size} bloques`;
    const f = fila({
      clave: k,
      rotulo: `${a.especie} · ${a.medida}`,
      nota: `${[...a.tipos].join(", ") || "—"} · ${a.dist.piezas} ${dentroDe}${a.falta.piezas > 0 ? ` · ${a.falta.piezas} en falta` : ""}`,
      esperado: a.lote,
      obtenido: suma(a.dist, a.falta),
    }, a.filas);
    if (f.estado === "difiere") {
      const d = f.diferencia.piezas;
      f.comoCuadrar = d !== 0
        ? `Revisa la medida ${a.medida} de ${a.especie}: ${a.lote.piezas} en el lote, ${a.dist.piezas} distribuidas${a.falta.piezas > 0 ? ` y ${a.falta.piezas} en falta` : ""} — ${d < 0 ? `faltan ${pz(-d)}` : `sobran ${pz(d)}`}.`
        : `Mismas piezas pero otro volumen: alguna fila de ${a.medida} tiene el m³ o el PT escrito a mano. Vuelve a cubicarla.`;
    }
    return f;
  });
  const sumaMedidas = filasMedida.reduce<Trio>((a, f) => suma(a, f.obtenido), cero());
  controles.push(control({
    id: "medida",
    titulo: "Por medida: ninguna pieza se pierde ni se duplica",
    regla: "Por especie y medida (E×A×L): piezas del lote = distribuidas en todos los bloques + en falta",
    pestana: "medida",
    ladoEsperado: "En el lote",
    ladoObtenido: "Distribuido + falta",
    esperado: lote,
    obtenido: sumaMedidas,
    filasSumadas: [...medidas.values()].reduce((a, x) => a + x.filas, 0),
    filas: filasMedida,
    comoCuadrar: filasMedida.some((f) => f.estado === "difiere")
      ? "Cada fila marcada dice qué medida tiene piezas de más o de menos."
      : `Las ${filasMedida.length} medidas conservan todas sus piezas.`,
  }));

  // ── 6 · Por especie: aserrada del lote = amparada + falta ────────────────
  const lotePorEspecie = new Map<string, { trio: Trio; filas: number }>();
  for (const p of piezas) {
    const k = claveEsp(p.especie);
    const v = lotePorEspecie.get(k) ?? { trio: cero(), filas: 0 };
    v.trio = suma(v.trio, { piezas: num(p.cantidad), pt: num(p.pieTablar), m3: num(p.m3) });
    v.filas++;
    lotePorEspecie.set(k, v);
  }
  const filasEspecie: FilaCuadre[] = dist.especies
    .filter((e) => e.estado !== "sin-aserrada")
    .map((e) => {
      const l = lotePorEspecie.get(claveEsp(e.especie)) ?? { trio: cero(), filas: 0 };
      const amparada: Trio = { piezas: e.bloques.reduce((a, b) => a + trioDeBloque(b).piezas, 0), pt: e.amparadaPt, m3: e.amparadaM3 };
      const faltaE: Trio = {
        piezas: e.faltante.reduce((a, f) => a + f.piezas, 0),
        pt: e.faltante.reduce((a, f) => a + f.pieTablar, 0),
        m3: e.faltanteM3,
      };
      const f = fila({
        clave: claveEsp(e.especie),
        rotulo: e.especie,
        nota: `${fmtM3(amparada.m3)} m³ amparados${faltaE.m3 > 0 ? ` · ${fmtM3(faltaE.m3)} m³ en falta` : ""}${e.libreM3 > 0 ? ` · ${fmtM3(e.libreM3)} m³ libres en sus bloques` : ""}`,
        esperado: l.trio,
        obtenido: suma(amparada, faltaE),
      }, l.filas + e.bloques.length + e.faltante.length);
      if (f.estado === "difiere") {
        f.comoCuadrar = f.diferencia.piezas === 0
          ? porVolumen(e.bloques)
          : `${e.especie} tiene ${pz(Math.abs(f.diferencia.piezas))} ${f.diferencia.piezas < 0 ? "que no están ni en un bloque ni en la falta" : "contadas de más"}: mira «Por medida».`;
      } else if (faltaE.m3 > 0) {
        f.comoCuadrar = e.bloques.length === 0
          ? `Falta amparar ${fmtM3(faltaE.m3)} m³ (${pz(faltaE.piezas)}): agrega un bloque de ${e.especie} de ${fmtM3(e.rollizaFaltanteM3)} m³ de rolliza, o declárala como ya aserrada.`
          : `Falta amparar ${fmtM3(faltaE.m3)} m³ (${pz(faltaE.piezas)}): agrega un bloque de ${e.especie} de ${fmtM3(e.rollizaFaltanteM3)} m³ de rolliza al aprovechamiento vigente, o declárala como ya aserrada.`;
      }
      return f;
    });
  controles.push(control({
    id: "especie",
    titulo: "Por especie: aserrada = amparada + falta",
    regla: "La aserrada de cada especie es lo que amparan sus bloques más lo que falta distribuir",
    pestana: "especie",
    ladoEsperado: "Aserrada del lote",
    ladoObtenido: "Amparada + falta",
    esperado: lote,
    obtenido: filasEspecie.reduce<Trio>((a, f) => suma(a, f.obtenido), cero()),
    filasSumadas: piezas.length + filasMedidas,
    filas: filasEspecie,
    comoCuadrar: filasEspecie.some((f) => f.estado === "difiere")
      ? "Alguna especie no cierra: cada fila marcada dice por qué."
      : conFalta.length > 0
        ? `Cuadra; ${conFalta.length === 1 ? "una especie tiene" : `${conFalta.length} especies tienen`} madera sin respaldo.`
        : "Cada especie quedó amparada entera.",
  }));

  // ── 7 · Huérfanas: rolliza sin aserrada y aserrada sin rolliza ───────────
  const hayAserradaHuerfana = dist.aserradaHuerfana.length > 0;
  const especiesConBloques = dist.especies.filter((e) => e.bloques.length > 0).map((e) => e.especie);
  const especiesSinBloque = dist.aserradaHuerfana.map((h) => h.especie);
  const filasHuerfana: FilaCuadre[] = [
    ...dist.aserradaHuerfana.map((h): FilaCuadre => {
      const l = lotePorEspecie.get(claveEsp(h.especie))?.trio ?? { piezas: 0, pt: 0, m3: h.m3 };
      const e = dist.especies.find((x) => claveEsp(x.especie) === claveEsp(h.especie));
      const f = fila({
        clave: `a-${claveEsp(h.especie)}`,
        rotulo: h.especie,
        nota: "Aserrada sin rolliza de su especie",
        esperado: l,
        obtenido: cero(),
      }, 1);
      f.estado = "difiere";
      f.comoCuadrar = esVariado(h.especie)
        ? "Es Variado sin abrir: ábrelo en «Variado» (tabla 6×6) para repartirlo entre las especies de los bloques."
        : `Agrega un bloque de ${h.especie}${e ? ` (≈ ${fmtM3(e.rollizaFaltanteM3)} m³ de rolliza)` : ""}${especiesConBloques.length > 0 ? `, o si es la misma madera que ${especiesConBloques.join(" / ")} con otro nombre, corrige la especie` : ""}.`;
      return f;
    }),
    ...dist.rollizaHuerfana.map((h): FilaCuadre => {
      const f = fila({
        clave: `r-${claveEsp(h.especie)}`,
        rotulo: h.especie,
        nota: "Rolliza sin aserrada cubicada",
        esperado: { piezas: 0, pt: 0, m3: h.m3 },
        obtenido: cero(),
      }, 1);
      /* Rolliza que no ampara nada no descuadra ninguna cifra (no imprime
         nada); descuadra sólo si al lado hay aserrada sin rolliza: ahí lo
         probable es la misma madera escrita de dos formas. */
      f.estado = hayAserradaHuerfana ? "difiere" : "exacto";
      f.aviso = !hayAserradaHuerfana;
      f.omitir = ["piezas", "pt"];
      f.comoCuadrar = hayAserradaHuerfana
        ? `Ningún renglón del cubicado es ${h.especie} y hay aserrada de ${especiesSinBloque.join(" / ")} sin rolliza: si es la misma madera, unifica el nombre.`
        : `Ningún renglón del cubicado es ${h.especie}: si la aserrada todavía no se cubicó, no pasa nada; si no, quita el bloque.`;
      return f;
    }),
  ];
  controles.push(control({
    id: "huerfanas",
    titulo: "Especies sin pareja",
    regla: "Toda aserrada tiene rolliza de su especie y toda rolliza tiene aserrada que amparar",
    pestana: "especie",
    ladoEsperado: "Tiene",
    ladoObtenido: "Respalda / ampara",
    esperado: cero(),
    obtenido: cero(),
    filasSumadas: 0,
    sinTotal: true,
    filas: filasHuerfana,
    comoCuadrar: filasHuerfana.length === 0
      ? "Cada especie tiene su rolliza y su aserrada."
      : hayAserradaHuerfana
        ? "Hay aserrada que ningún bloque de su especie puede amparar."
        : "Hay rolliza que no ampara nada: no cambia ninguna cifra, sólo para mirar.",
  }));

  const difieren = controles.filter((c) => c.estado === "difiere").length;
  const redondeo = controles.filter((c) => c.estado === "redondeo").length;
  const mayorM3 = controles
    .flatMap((c): { diferencia: Trio }[] => [
      ...c.filas.filter((f) => f.estado === "difiere"),
      ...(c.estadoTotal === "difiere" ? [c] : []),
    ])
    .reduce((a, x) => Math.max(a, Math.abs(x.diferencia.m3)), 0);
  return {
    controles,
    estado: peorEstado(controles.map((c) => c.estado)),
    exactos: controles.length - difieren - redondeo,
    redondeo,
    difieren,
    mayorM3: r4(mayorM3),
  };
}

/** Un control por id (las etiquetas de la pantalla abren el modal en uno). */
export const controlDe = (c: CuadreReparto, id: IdControl): ControlCuadre | undefined =>
  c.controles.find((x) => x.id === id);

/** El peor estado entre varios controles: la etiqueta de la tabla de bloques junta dos. */
export function estadoDeControles(c: CuadreReparto, ids: readonly IdControl[]): ControlCuadre | undefined {
  const xs = ids.map((id) => controlDe(c, id)).filter((x): x is ControlCuadre => !!x);
  return xs.reduce<ControlCuadre | undefined>((a, x) => (!a || RANGO[x.estado] > RANGO[a.estado] ? x : a), undefined);
}
