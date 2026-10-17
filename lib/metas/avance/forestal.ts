/**
 * lib/metas/avance/forestal.ts — avance de las metas del aserradero y del
 * bosque (ADR-488): ingreso, producción, despacho y venta del Libro CTP, los
 * lotes cubicados, el Cubicador de madera y la tala/trozado del Libro TH.
 *
 * Todo se lee por las clases de siempre; nada se escribe. Reglas:
 *   · m³ ↔ PT SOLO con `PT_POR_M3` (424) y la unidad de cada lote con `unidadDe`.
 *   · Una cifra incompleta nunca se muestra como 0: va con su `parcial`.
 *   · Las fechas del libro son date-only: el día se compara en UTC, como el
 *     libro las muestra (ver `rangoDelLibro`).
 *   · Ingreso, producción y despacho comparten UNA lectura del libro por
 *     ventana (`ctp:mov:`); tala y trozado, otra (`loth:`).
 * Sin plazos ni score de cumplimiento: eso es del libro, no de una meta.
 */
import "server-only";
import type { CategoriaMeta } from "@/lib/admin/metas-tareas";
import type { VentanaMeta } from "@/lib/admin/metas-periodo";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestCubicacionesDB } from "@/lib/db/forest-cubicaciones.db";
import { MetasAvanceForestalDB } from "@/lib/db/metas-avance-forestal.db";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { unidadDe } from "@/lib/forestal/cubicacion-cuenta";
import { esFormulaComercial } from "@/lib/forestal/cubicacion-comercial-tipos";
import { ventasDeMadera } from "@/lib/finance/resultado-del-negocio";
import { limaDateKey } from "@/lib/utils";
import type { Calculadora, Medicion, MemoLectura } from "./tipos";

type Volumen = "m3" | "pt";

/** «m³», «M3 », «m3» → m3; «PT», «pt», «p2» → pt; cualquier otra cosa no es volumen. */
function claveVolumen(u: string | null | undefined): Volumen | null {
  const k = (u ?? "").trim().toLowerCase().replace("³", "3").replace(/\s+/g, "");
  if (k === "m3") return "m3";
  if (k === "pt" || k === "p2" || k === "piestablares") return "pt";
  return null;
}

/** La línea del libro sin unidad es m³ (el default del libro, `movimiento-libro.ts`). */
const claveDeLinea = (u: string | null | undefined): Volumen | null => claveVolumen(u?.trim() ? u : "m3");

const esSoles = (u: string) => ["s/", "s/.", "pen", "soles"].includes(u.trim().toLowerCase());

function convertir(v: number, de: Volumen, a: Volumen): number {
  if (de === a) return v;
  return de === "m3" ? v * PT_POR_M3 : v / PT_POR_M3;
}

/** m³ con 4 decimales (como el libro), PT y soles con 2: sin ruido de float en la cifra. */
function redondear(v: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}
const redondearVol = (v: number, u: Volumen) => redondear(v, u === "m3" ? 4 : 2);

/** «1 240,5»: miles con espacio y coma decimal, como el resto del módulo forestal. */
function fmtNum(v: number, decimales: number): string {
  const [ent, frac] = redondear(v, decimales).toFixed(decimales).split(".");
  const fracLimpia = (frac ?? "").replace(/0+$/, "");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${miles}${fracLimpia ? `,${fracLimpia}` : ""}`;
}
const fmtVol = (v: number, u: Volumen) => `${fmtNum(v, u === "m3" ? 3 : 2)} ${u === "m3" ? "m³" : "PT"}`;
const fmtSoles = (v: number) => `S/ ${fmtNum(v, 2)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function unidadNoEsVolumen(unidad: string): Medicion {
  return { valor: null, parcial: `La meta está en «${unidad}»: este dato se mide en m³ o PT.` };
}

/**
 * La ventana como la filtra el libro: `entryDate` es date-only y el libro lo
 * muestra en UTC, así que el día va de 00:00 a 23:59:59.999 UTC (los tres
 * métodos usan `lte`). Medido 09-10: Blas guardó sus 7 ingresos del 03-10 a
 * las 04:08 UTC; con el día de Lima caerían el 02-10, que no es lo que dice
 * el libro.
 */
function rangoDelLibro(v: VentanaMeta): { fromDate: Date; toDate: Date } {
  return {
    fromDate: new Date(`${v.desde}T00:00:00.000Z`),
    toDate: new Date(`${v.hasta}T23:59:59.999Z`),
  };
}

const leerMovimiento = (tenantId: string, v: VentanaMeta, memo: MemoLectura) =>
  memo.una(`ctp:mov:${v.desde}:${v.hasta}`, () => ForestCtpDB.movimientoDelLibro(tenantId, rangoDelLibro(v)));

const leerPorUnidad = (tenantId: string, v: VentanaMeta, memo: MemoLectura) =>
  memo.una(`ctp:unidad:${v.desde}:${v.hasta}`, () => MetasAvanceForestalDB.ctpPorUnidad(tenantId, v.desde, v.hasta));

const leerLoth = (tenantId: string, v: VentanaMeta, memo: MemoLectura) =>
  memo.una(`loth:${v.desde}:${v.hasta}`, () => {
    const { fromDate, toDate } = rangoDelLibro(v);
    return ForestLothDB.resumenPeriodo(tenantId, fromDate, toDate);
  });

const EJE_CORTADO = "El libro cortó el período por largo: puede faltar movimiento.";

// ── Libro CTP ────────────────────────────────────────────────────────────────

const maderaIngresada: Calculadora = async (tenantId, v, unidad, memo) => {
  const u = claveVolumen(unidad);
  if (!u) return unidadNoEsVolumen(unidad);
  const mov = await leerMovimiento(tenantId, v, memo);
  const especies = mov.porEspecie.filter((e) => e.ingresoM3 > 0).sort((a, b) => b.ingresoM3 - a.ingresoM3);
  const top = especies.slice(0, 3).map((e) => `${e.especie} ${fmtVol(convertir(e.ingresoM3, "m3", u), u)}`);
  if (especies.length > 3) top.push(`${plural(especies.length - 3, "especie", "especies")} más`);
  return {
    valor: redondearVol(convertir(mov.totales.ingresoM3, "m3", u), u),
    ...(mov.truncado ? { parcial: EJE_CORTADO } : {}),
    ...(top.length ? { detalle: top.join(" · ") } : {}),
  };
};

/**
 * Producción o despacho. El tablero del libro suma lo producido SIN convertir
 * y dice la unidad sólo si el período usa una (`unidadProducido`). Con una sola
 * unidad de volumen se convierte ese total; si mezcla (o declara en «unidad»,
 * «kg»…), se separa por unidad: m³ y PT suman, lo demás va al `parcial`.
 */
function lineasDelLibro(section: "produccion" | "despacho"): Calculadora {
  const [uno, varios] = section === "produccion" ? ["corrida", "corridas"] : ["despacho", "despachos"];
  return async (tenantId, v, unidad, memo) => {
    const u = claveVolumen(unidad);
    if (!u) return unidadNoEsVolumen(unidad);
    const mov = await leerMovimiento(tenantId, v, memo);
    const total = section === "produccion" ? mov.totales.producido : mov.totales.despachado;
    const unidadDelLibro = section === "produccion" ? mov.totales.unidadProducido : mov.totales.unidadDespachado;
    const una = unidadDelLibro == null ? null : claveVolumen(unidadDelLibro);
    if (una) {
      return {
        valor: redondearVol(convertir(total, una, u), u),
        ...(mov.truncado ? { parcial: EJE_CORTADO } : {}),
        ...(una !== u && total > 0 ? { detalle: `En el libro: ${fmtVol(total, una)}` } : {}),
      };
    }

    const filas = (await leerPorUnidad(tenantId, v, memo)).filter((f) => f.section === section);
    const porUnidad: Record<Volumen, number> = { m3: 0, pt: 0 };
    let suman = 0;
    let otras = 0;
    const otrasUnidades = new Set<string>();
    for (const f of filas) {
      const k = claveDeLinea(f.unidad);
      if (!k) {
        otras += f.lineas;
        otrasUnidades.add((f.unidad ?? "").trim());
        continue;
      }
      porUnidad[k] += f.cantidad;
      suman += f.lineas;
    }
    const valor = convertir(porUnidad.m3, "m3", u) + convertir(porUnidad.pt, "pt", u);
    const detalle = (["m3", "pt"] as const)
      .filter((k) => porUnidad[k] > 0)
      .map((k) => fmtVol(porUnidad[k], k))
      .join(" + ");
    return {
      // Nada convertible y algo que no suma: «sin dato», no un 0 que parezca medido.
      valor: suman === 0 && otras > 0 ? null : redondearVol(valor, u),
      ...(otras > 0
        ? { parcial: `${plural(otras, uno, varios)} en otra unidad (${[...otrasUnidades].join(", ")}) no ${otras === 1 ? "suma" : "suman"}` }
        : {}),
      ...(detalle ? { detalle: `En el libro: ${detalle}` } : {}),
    };
  };
}

/**
 * La madera vendida del período, en soles: la MISMA cifra que «Madera vendida»
 * de Mi Plata (ADR-451). Despachos y cargos de venta de la cuenta del cliente
 * pasan por `ventasDeMadera`: se juntan por guía y, si la guía tiene cargo,
 * manda el cargo (es lo que se le cobra), aunque el despacho no tenga precio.
 *
 * Como en Mi Plata: la venta cuenta el día de su `fecha` de grupo (la del
 * cargo si hay; si no, el primer despacho), la madera de servicio (ajena,
 * ADR-437) no es venta ni faltante, y lo que no está en soles va al `parcial`.
 */
const ventaMadera: Calculadora = async (tenantId, v, unidad, memo) => {
  if (!esSoles(unidad)) return { valor: null, parcial: `La meta está en «${unidad}»: la venta se mide en S/.` };
  const [filas, cargos] = await memo.una(`ctp:venta:${v.desde}:${v.hasta}`, () =>
    Promise.all([
      ForestCtpDespachoDB.filasPnlDelPeriodo(tenantId, rangoDelLibro(v)),
      MetasAvanceForestalDB.cargosVentaMadera(tenantId, v.desde, v.hasta),
    ]),
  );
  const despachos = filas.map((f) => ({ ...f, fecha: f.fecha ?? "" }));
  let soles = 0;
  let ventas = 0;
  let deLaCuenta = 0;
  let sinPrecio = 0;
  let enOtraMoneda = 0;
  for (const g of ventasDeMadera(despachos, cargos)) {
    // Un grupo sin día sólo puede ser un despacho de la ventana (los cargos siempre tienen fecha).
    if (g.deServicio || (g.fecha && (g.fecha < v.desde || g.fecha > v.hasta))) continue;
    if (g.venta == null) {
      sinPrecio += g.sinPrecio || 1;
      continue;
    }
    if (g.moneda !== "PEN") {
      enOtraMoneda++;
      continue;
    }
    sinPrecio += g.sinPrecio;
    soles += g.venta;
    ventas++;
    if (g.origenVenta === "cuenta") deLaCuenta++;
  }
  const faltan = [
    sinPrecio > 0 ? `${plural(sinPrecio, "despacho", "despachos")} sin precio` : "",
    enOtraMoneda > 0 ? `${plural(enOtraMoneda, "venta", "ventas")} en otra moneda` : "",
  ].filter(Boolean);
  const detalle = ventas
    ? `${plural(ventas, "venta", "ventas")}: ${fmtSoles(soles)}` + (deLaCuenta ? ` (${deLaCuenta} con el cargo de la cuenta del cliente)` : "")
    : "";
  return {
    valor: ventas === 0 && faltan.length > 0 ? null : redondear(soles, 2),
    ...(faltan.length ? { parcial: `${faltan.join(" y ")}: no ${sinPrecio + enOtraMoneda === 1 ? "suma" : "suman"}` } : {}),
    ...(detalle ? { detalle } : {}),
  };
};

// ── Cubicación ───────────────────────────────────────────────────────────────

/**
 * Lotes aplicados de la ventana. Cada grupo en la unidad de SU fórmula
 * (smalian m³; oxapampina y tablar PT). Un lote de aserrada armado desde una
 * cubicación del Cubicador de madera no suma: esa madera ya está en la meta
 * «Madera aserrada cubicada» y contarla acá la duplicaría.
 */
const cubicacion: Calculadora = async (tenantId, v, unidad, memo) => {
  const u = claveVolumen(unidad);
  if (!u) return unidadNoEsVolumen(unidad);
  const grupos = await memo.una(`cub:${v.desde}:${v.hasta}`, () =>
    MetasAvanceForestalDB.cubicadoDelRango(tenantId, v.desde, v.hasta),
  );
  let compra = 0;
  let venta = 0;
  let lotes = 0;
  let aserrada = 0;
  let sinFormula = 0;
  let delCubicador = 0;
  for (const g of grupos) {
    if (g.deCubicador) {
      delCubicador += g.lotes;
      continue;
    }
    if (!esFormulaComercial(g.formula)) {
      sinFormula += g.lotes;
      continue;
    }
    const de: Volumen = unidadDe(g.formula) === "m³" ? "m3" : "pt";
    const x = convertir(g.volumen, de, u);
    if (g.sentido === "venta") venta += x;
    else compra += x;
    lotes += g.lotes;
    if (g.material === "aserrada") aserrada += g.lotes;
  }
  const detalle = lotes
    ? [
        plural(lotes, "lote", "lotes") + (aserrada ? ` (${aserrada} de aserrada)` : ""),
        `compra ${fmtVol(compra, u)}`,
        `venta ${fmtVol(venta, u)}`,
      ].join(" · ")
    : "";
  const yaContado = delCubicador
    ? `${plural(delCubicador, "lote", "lotes")} del Cubicador de madera ya ${delCubicador === 1 ? "cuenta" : "cuentan"} en «Madera aserrada cubicada»`
    : "";
  return {
    valor: lotes === 0 && sinFormula > 0 ? null : redondearVol(compra + venta, u),
    ...(sinFormula > 0
      ? { parcial: `${plural(sinFormula, "lote", "lotes")} con una fórmula que no se conoce no ${sinFormula === 1 ? "suma" : "suman"}` }
      : {}),
    ...(detalle || yaContado ? { detalle: [detalle, yaContado].filter(Boolean).join(" · ") } : {}),
  };
};

/**
 * El Cubicador de madera (aserrada, KV). Cada cubicación lleva la fecha del
 * trabajo; las viejas sin fecha caen en el día (Lima) en que se guardaron.
 * En PT se usa `totales.pieTablar`, que es el dato que publica el Cubicador:
 * su m³ ya sale de ahí ÷ `PT_POR_M3`, y volver a multiplicarlo sólo suma ruido.
 */
const cubicador: Calculadora = async (tenantId, v, unidad, memo) => {
  const u = claveVolumen(unidad);
  if (!u) return unidadNoEsVolumen(unidad);
  const lista = await memo.una("cubicador:lista", () => ForestCubicacionesDB.list(tenantId));
  let total = 0;
  let n = 0;
  let piezas = 0;
  for (const c of lista) {
    // `limaDateKey(undefined)` es HOY (parámetro por defecto): sin ninguna fecha, la cubicación no entra.
    const dia = /^\d{4}-\d{2}-\d{2}/.test(c.fecha ?? "") ? c.fecha.slice(0, 10) : c.createdAt ? limaDateKey(c.createdAt) : "";
    if (!dia || dia < v.desde || dia > v.hasta) continue;
    const m3 = Number(c.totales?.m3) || 0;
    const pt = Number(c.totales?.pieTablar) || 0;
    total += u === "pt" ? pt || convertir(m3, "m3", "pt") : m3;
    piezas += Number(c.totales?.piezas) || 0;
    n++;
  }
  return {
    valor: redondearVol(total, u),
    ...(n ? { detalle: `${plural(n, "cubicación", "cubicaciones")} · ${plural(piezas, "pieza", "piezas")}` } : {}),
  };
};

// ── Libro TH (bosque) ────────────────────────────────────────────────────────

function seccionLoth(seccion: "tala" | "trozado"): Calculadora {
  return async (tenantId, v, unidad, memo) => {
    const u = claveVolumen(unidad);
    if (!u) return unidadNoEsVolumen(unidad);
    const r = await leerLoth(tenantId, v, memo);
    const m3 = seccion === "tala" ? r.taladoM3 : r.trozadoM3;
    const otra = seccion === "tala" ? r.trozadoM3 : r.taladoM3;
    return {
      valor: redondearVol(convertir(m3, "m3", u), u),
      ...(otra > 0
        ? { detalle: `${seccion === "tala" ? "Trozado" : "Tala"} del mismo período: ${fmtVol(convertir(otra, "m3", u), u)}` }
        : {}),
    };
  };
}

export const CALCULADORAS_FORESTALES: Partial<Record<CategoriaMeta, Calculadora>> = {
  madera_ingresada: maderaIngresada,
  produccion: lineasDelLibro("produccion"),
  despacho: lineasDelLibro("despacho"),
  venta_madera: ventaMadera,
  cubicacion,
  cubicador,
  loth_tala: seccionLoth("tala"),
  loth_trozado: seccionLoth("trozado"),
};
