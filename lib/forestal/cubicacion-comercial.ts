/**
 * cubicacion-comercial — las cuentas de la cubicación COMERCIAL (ADR-483,
 * contrato K7): trozas en Oxapampina/Smalian y madera aserrada en pie tablar,
 * con los descuentos con los que se compra y se vende («descontando huecos y
 * demás»), para pagarla o cobrarla en la cuenta de una persona (ADR-478).
 *
 * PURO y client-safe: el servidor congela con esto y la pantalla previsualiza
 * con lo MISMO (`lineasDeEspecie` + `aplicarDescuentoLote`), así lo que se ve
 * es lo que se cobra. Lo que vale es SIEMPRE lo del servidor.
 *
 *   - Bruto y neto en la unidad del lote (PT a 2 decimales, m³ a 4). Ningún
 *     descuento deja un volumen < 0 ni un neto > bruto: lo que no cuadra es
 *     `DescuentoInvalidoError` (422 `DESCUENTO_INVALIDO` en el servidor).
 *   - El servidor nunca convierte m³ → PT para pagar: `ptSugeridoDeM3` es sólo
 *     para el rótulo «≈ sugerido» de la pantalla.
 */
import { cubicarSegun, UNIDADES_FORMULA, type FormulaTrozas } from "./cubicacion-trozas-formula";
import { cubicarPieza, PT_POR_M3, toFeet, toInches } from "./cubicacion";
import { claveEspecie } from "./loth-constants";
import { agruparPorEspecie, cubicarEnServidor, redondearComercial, type LineaEspecie, type TrozaCongelada, type TrozaEntrada } from "./cubicacion-cuenta";
import type {
  DescuentoLote,
  DescuentoTroza,
  FormulaComercial,
  LineaTotalCongelada,
  LineaTotalEntrada,
  MaterialCubicacion,
  ModoCubicacion,
  PiezaComercialEntrada,
  PiezaCongelada,
} from "./cubicacion-comercial-tipos";

/** La unidad, los decimales y el nombre de cada fórmula, también la de la aserrada. */
export function unidadesComercial(f: FormulaComercial): { volumen: "PT" | "m³"; decimales: 2 | 4; nombre: string } {
  if (f === "tablar") return { volumen: "PT", decimales: 2, nombre: "Pie tablar (aserrada)" };
  return { volumen: f === "smalian" ? "m³" : "PT", decimales: f === "smalian" ? 4 : 2, nombre: UNIDADES_FORMULA[f].etiqueta };
}

/** Un descuento que deja la madera en negativo, o que no tiene a qué aplicarse. */
export class DescuentoInvalidoError extends Error {
  constructor(
    readonly donde: { troza?: number; pieza?: number; clave?: string },
    message: string,
  ) {
    super(message);
    this.name = "DescuentoInvalidoError";
  }
}

const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtNum = (n: number) => String(n).replace(".", ",");
const hayDescuentoTroza = (d: DescuentoTroza | null | undefined): d is DescuentoTroza =>
  Boolean(d && ((d.hueco ?? 0) > 0 || (d.menosLargo ?? 0) > 0 || (d.pct ?? 0) > 0));

/**
 * El volumen de UNA troza con su descuento, en la unidad de su fórmula
 * (pulgadas/pies en Oxapampina, cm/m en Smalian). Orden: largo neto (L′ =
 * largo − lo que no sirve) → menos el cilindro del hueco con ese L′ → castigo %.
 * Cada `cubicarSegun` ya viene redondeado (así cuadra con lo que se ve por
 * troza) y el neto se redondea otra vez a la fórmula.
 *
 * 20″ × 20″ × 10′ = 163,27 PT; hueco 6″ = 14,69 → 148,58 PT.
 */
export function trozaNeta(
  formula: FormulaTrozas,
  d1: number,
  d2: number,
  largo: number,
  d?: DescuentoTroza | null,
  n = 1,
): { bruto: number; neto: number } {
  const bruto = cubicarSegun(formula, d1, largo, d2);
  if (!hayDescuentoTroza(d)) return { bruto, neto: bruto };
  const u = UNIDADES_FORMULA[formula];
  const menos = d.menosLargo ?? 0;
  const largoNeto = largo - menos;
  if (!(largoNeto > 0)) {
    throw new DescuentoInvalidoError(
      { troza: n },
      `La troza ${n}: lo que no sirve (${fmtNum(menos)} ${u.largo}) es todo su largo (${fmtNum(largo)} ${u.largo}).`,
    );
  }
  const hueco = d.hueco ?? 0;
  const menor = Math.min(d1, d2);
  if (hueco > 0 && !(hueco < menor)) {
    throw new DescuentoInvalidoError(
      { troza: n },
      `La troza ${n}: el hueco de ${fmtNum(hueco)}${u.diametroCorto} no puede ser igual o más grande que su Ø menor (${fmtNum(menor)}${u.diametroCorto}).`,
    );
  }
  const conLargo = menos > 0 ? cubicarSegun(formula, d1, largoNeto, d2) : bruto;
  const delHueco = hueco > 0 ? cubicarSegun(formula, hueco, largoNeto, hueco) : 0;
  const neto = redondearComercial(Math.max(0, (conLargo - delHueco) * (1 - (d.pct ?? 0) / 100)), formula);
  return { bruto, neto: Math.min(neto, bruto) };
}

/**
 * El PT de UNA medida de madera aserrada con su descuento: las piezas
 * descartadas no se cobran (≤ cantidad) y el castigo % baja el resto.
 * 10 × 2″ × 8″ × 10′ = 133,33 PT; 2 descartadas → 106,67 PT.
 */
export function piezaNeta(p: PiezaComercialEntrada, n = 1): { bruto: number; neto: number } {
  const bruto = cubicarPieza(p).pieTablar;
  const d = p.descuento;
  const descartadas = d?.descartadas ?? 0;
  const pct = d?.pct ?? 0;
  if (!(descartadas > 0) && !(pct > 0)) return { bruto, neto: bruto };
  if (descartadas > p.cantidad) {
    throw new DescuentoInvalidoError(
      { pieza: n },
      `La medida ${n}: descartas ${fmtNum(descartadas)} piezas y sólo hay ${fmtNum(p.cantidad)}.`,
    );
  }
  const quedan = p.cantidad - descartadas;
  /* `cubicarPieza` toma la cantidad 0 como 1: sin piezas que cobrar, el PT es 0. */
  const base = quedan > 0 ? cubicarPieza({ ...p, cantidad: quedan }).pieTablar : 0;
  return { bruto, neto: Math.min(bruto, r2(Math.max(0, base * (1 - pct / 100)))) };
}

const claveDe = (texto: string) => claveEspecie(texto) || texto.trim().toLowerCase();

/**
 * El descuento del LOTE sobre las líneas por especie (ya netas de lo de cada
 * troza/pieza): por especie primero (`menos` en la unidad del lote, ≤ el neto
 * de esa especie; luego su %), al final el % general. Ninguna línea < 0; se
 * redondea por línea y el neto es Σ líneas (lo que se ve en la tabla).
 */
export function aplicarDescuentoLote(
  lineas: readonly LineaEspecie[],
  d: DescuentoLote | null | undefined,
  f: FormulaComercial,
): { lineas: LineaEspecie[]; bruto: number; neto: number } {
  const bruto = redondearComercial(lineas.reduce((t, l) => t + l.volumen, 0), f);
  const general = d?.pct ?? 0;
  const porEspecie = d?.porEspecie ?? [];
  if (!(general > 0) && porEspecie.length === 0) return { lineas: lineas.map((l) => ({ ...l })), bruto, neto: bruto };

  const claves = new Set(lineas.map((l) => l.clave));
  const ajustes = new Map<string, { pct: number; menos: number; nombre: string }>();
  for (const e of porEspecie) {
    const clave = claveDe(e.clave);
    if (!claves.has(clave)) throw new DescuentoInvalidoError({ clave }, `La especie «${e.clave}» no está en esta cubicación: quita su descuento.`);
    if (ajustes.has(clave)) throw new DescuentoInvalidoError({ clave }, `La especie «${e.clave}» tiene dos descuentos: deja uno.`);
    ajustes.set(clave, { pct: e.pct ?? 0, menos: e.menos ?? 0, nombre: e.clave });
  }
  const { volumen: unidad, decimales } = unidadesComercial(f);
  const medio = 10 ** -decimales / 2;
  const out = lineas.map((l) => {
    const a = ajustes.get(l.clave);
    let v = l.volumen;
    if (a && a.menos > 0) {
      if (a.menos - l.volumen > medio) {
        throw new DescuentoInvalidoError(
          { clave: l.clave },
          `A ${l.nombre} le descuentas ${fmtNum(a.menos)} ${unidad} y sólo tiene ${fmtNum(l.volumen)} ${unidad}.`,
        );
      }
      v -= a.menos;
    }
    if (a && a.pct > 0) v *= 1 - a.pct / 100;
    if (general > 0) v *= 1 - general / 100;
    return { ...l, volumen: Math.min(l.volumen, redondearComercial(Math.max(0, v), f)) };
  });
  return { lineas: out, bruto, neto: redondearComercial(out.reduce((t, l) => t + l.volumen, 0), f) };
}

/**
 * Las líneas por especie de una cubicación guardada: la ÚNICA que usan
 * «aplicar» y la pantalla. Troza → `agruparPorEspecie` (con el `volumen` neto
 * de cada troza); aserrada → Σ `volumen` por especie, y `n` = las piezas
 * (`cantidad` uno por uno; `piezas` de la línea rápida, 0 si no se contaron).
 */
export function lineasDeEspecie(c: {
  material: MaterialCubicacion;
  modo: ModoCubicacion;
  formula: FormulaComercial;
  trozas: readonly unknown[];
}): LineaEspecie[] {
  if (c.material !== "aserrada") return agruparPorEspecie(c.trozas as readonly TrozaCongelada[], c.formula);
  const porClave = new Map<string, LineaEspecie>();
  for (const raw of c.trozas) {
    const x = raw as Partial<PiezaCongelada & LineaTotalCongelada>;
    const nombre = String(x.especie ?? "").trim() || "Sin especie";
    const clave = claveEspecie(nombre) || "sin especie";
    const l = porClave.get(clave) ?? { clave, nombre, n: 0, volumen: 0, precio: null, monto: null };
    l.n += c.modo === "total" ? Number(x.piezas ?? 0) : Number(x.cantidad ?? 0);
    l.volumen += Number(x.volumen ?? 0);
    porClave.set(clave, l);
  }
  return [...porClave.values()]
    .map((l) => ({ ...l, volumen: redondearComercial(l.volumen, c.formula) }))
    .sort((a, b) => b.volumen - a.volumen || a.clave.localeCompare(b.clave));
}

// ── Lo que congela el servidor (y previsualiza la pantalla) ───────────────────

/**
 * Las trozas re-cubicadas por el servidor con su descuento (troza a troza) y
 * el del lote. `volumen` de cada troza = su neto; `bruto` sólo si cambió.
 * Las medidas fuera de rango siguen siendo `MedidaFueraDeRangoError`.
 */
export function cubicarTrozasComercial(
  formula: FormulaTrozas,
  entrada: readonly TrozaEntrada[],
  diametros: 1 | 2,
  descuentos?: DescuentoLote | null,
): { trozas: TrozaCongelada[]; bruto: number; neto: number; lineas: LineaEspecie[] } {
  const base = cubicarEnServidor(formula, entrada, diametros);
  let brutoTotal = 0;
  const trozas = base.trozas.map((t, i) => {
    const d = entrada[i]?.descuento;
    const { bruto, neto } = trozaNeta(formula, t.d1, t.d2, t.largo, d, t.n);
    brutoTotal += bruto;
    if (!hayDescuentoTroza(d)) return t;
    const descuento: DescuentoTroza = {
      ...((d.hueco ?? 0) > 0 ? { hueco: d.hueco } : {}),
      ...((d.menosLargo ?? 0) > 0 ? { menosLargo: d.menosLargo } : {}),
      ...((d.pct ?? 0) > 0 ? { pct: d.pct } : {}),
    };
    return { ...t, volumen: neto, bruto, descuento };
  });
  const lote = aplicarDescuentoLote(agruparPorEspecie(trozas, formula), descuentos, formula);
  return { trozas, bruto: redondearComercial(brutoTotal, formula), neto: lote.neto, lineas: lote.lineas };
}

/** Las piezas de la aserrada «uno por uno», congeladas con su bruto y su neto. */
export function cubicarPiezasComercial(
  piezas: readonly PiezaComercialEntrada[],
  descuentos?: DescuentoLote | null,
): { piezas: PiezaCongelada[]; bruto: number; neto: number; lineas: LineaEspecie[] } {
  let brutoTotal = 0;
  const congeladas = piezas.map((p, i): PiezaCongelada => {
    const n = i + 1;
    const { bruto, neto } = piezaNeta(p, n);
    brutoTotal += bruto;
    const d = p.descuento;
    const conDescuento = (d?.descartadas ?? 0) > 0 || (d?.pct ?? 0) > 0;
    return {
      n,
      especie: p.especie.trim(),
      cantidad: p.cantidad,
      espesor: p.espesor,
      ancho: p.ancho,
      largo: p.largo,
      uEspesor: p.uEspesor,
      uAncho: p.uAncho,
      uLargo: p.uLargo,
      bruto,
      ...(conDescuento
        ? { descuento: { ...((d?.descartadas ?? 0) > 0 ? { descartadas: d?.descartadas } : {}), ...((d?.pct ?? 0) > 0 ? { pct: d?.pct } : {}) } }
        : {}),
      volumen: neto,
    };
  });
  const lote = aplicarDescuentoLote(lineasDeEspecie({ material: "aserrada", modo: "pieza", formula: "tablar", trozas: congeladas }), descuentos, "tablar");
  return { piezas: congeladas, bruto: r2(brutoTotal), neto: lote.neto, lineas: lote.lineas };
}

/** Las líneas de la aserrada «rápida»: el PT que se escribe ES lo que se cobra; el m³ es informativo. */
export function cubicarLineasComercial(
  lineas: readonly LineaTotalEntrada[],
  descuentos?: DescuentoLote | null,
): { lineas: LineaTotalCongelada[]; bruto: number; neto: number; porEspecie: LineaEspecie[] } {
  const congeladas = lineas.map((l, i): LineaTotalCongelada => ({
    n: i + 1,
    especie: l.especie.trim(),
    pt: r2(l.pt),
    m3: l.m3 ?? null,
    piezas: l.piezas ?? null,
    volumen: r2(l.pt),
  }));
  const lote = aplicarDescuentoLote(lineasDeEspecie({ material: "aserrada", modo: "total", formula: "tablar", trozas: congeladas }), descuentos, "tablar");
  return { lineas: congeladas, bruto: lote.bruto, neto: lote.neto, porEspecie: lote.lineas };
}

// ── Sólo para la pantalla ─────────────────────────────────────────────────────

/** m³ × 424 a 2 decimales: el rótulo «≈ sugerido, revísalo». El servidor NO la llama para pagar. */
export const ptSugeridoDeM3 = (m3: number): number => r2(m3 * PT_POR_M3);

/** Metros de la guía → pulgadas a 1 decimal (el prellenado de la Oxapampina; la cinta manda). */
export const pulgadasDeMetros = (m: number): number => r1(toInches(m, "m"));
/** Metros de la guía → pies a 1 decimal. */
export const piesDeMetros = (m: number): number => r1(toFeet(m, "m"));
