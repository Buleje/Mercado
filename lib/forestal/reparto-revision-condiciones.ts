/**
 * reparto-revision-condiciones — lo que el repaso mira bloque por bloque,
 * además de los datos que el papel pide (Brandon, 2026-10-20: «cualquier cosa
 * o condición para que esté al 100 bien hecho»).
 *
 * Seis condiciones que hasta hoy sólo frenaban al registrar en el Libro, o que
 * nadie miraba. Todas AVISAN (no frenan): el operario decide; lo que no puede
 * pasar es que se entere recién cuando el Libro le rechaza la corrida, o cuando
 * un fiscalizador cruza la Sección 1 con la Sección 2.
 *
 *  1. Rendimiento por bloque sobre el referencial SERFOR (RDE D000259-2024).
 *  2. Aserrado antes de que llegue la troza (la T3 del Libro, ADR-433).
 *  3. Troza de otra especie dentro del bloque.
 *  4. La misma troza en dos bloques.
 *  5. Diámetro sin comprobar: trozas sin Ø.
 *  6. Piezas con medidas imposibles (`medidaSospechosa`, la del dictado).
 *
 * PURO y client-safe: recibe la distribución y, para 2-5, las trozas que la
 * pantalla ya tiene cargadas (patio + lotes del Libro). Sin trozas, esas cuatro
 * callan — no hay con qué comparar, y un aviso sin dato sería adivinar.
 */

import { medidaSospechosa, RANGOS_MEDIDA } from "./cubicacion";
import { claveEspecie, esAserradaDirecta, type BloqueRolliza, type Distribucion } from "./cubicacion-reparto";
import { aCm, aMetros, diametroUtilCm, trozasDelBloque, type TrozaConOrigen } from "./cuadre-medidas-rolliza";
import {
  RENDIMIENTO_REF_ASERRADA, RENDIMIENTO_TOLERANCIA_PP, rendimientoReferencial, umbralRendimientoAlto,
} from "./ctp-rendimiento";
import type { HallazgoRevision } from "./reparto-revision";

/** Diez litros: lo mismo que `TOL_REVISION_M3` (se repite para no importar en círculo). */
const TOL_M3 = 0.01;
const CM_POR_PULGADA = 2.54;
const M_POR_PIE = 0.3048;
/** Hasta cuántas filas por bloque se nombran una por una; el resto se cuenta. */
const MAX_FILAS_POR_BLOQUE = 3;

const rotulo = (b: BloqueRolliza) => b.etiqueta.trim() || "Bloque sin etiqueta";
const f3 = (n: number) => n.toFixed(3);
const f1 = (n: number) => n.toFixed(1);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** «jueves 10/09», en UTC (las fechas del libro son date-only a medianoche UTC). */
export function fechaConDia(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${DIAS[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const esDia = (v: string | null | undefined): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

// ── Las trozas que la pantalla conoce ───────────────────────────────────────

/** Una troza del Libro, con lo que hace falta para revisarla. */
export interface TrozaRevision extends TrozaConOrigen {
  /** Código de planta o del bosque, el que tenga — para nombrarla. */
  codigo?: string | null;
  /** Cuándo llegó al patio, `AAAA-MM-DD` (`fechaIngresoDeTroza`), o `null` si no se sabe. */
  llegada?: string | null;
}

export interface ContextoTrozasRevision {
  /** Patio + trozas de los lotes del Libro. */
  libro: readonly TrozaRevision[];
  /** Trozas de cada lote del Libro, por id de lote. */
  lotes: ReadonlyMap<string, { code: string; trozas: readonly TrozaRevision[] }>;
}

/**
 * Las trozas que SON del bloque —no las que podrían respaldarlo—: las elegidas
 * (`trozaIds`) o, si no, las de su lote. El respaldo amplio «las del permiso»
 * sirve para comparar medidas, pero no dice qué troza entró: con él, una
 * especie o una fecha ajena sería un aviso inventado.
 */
function trozasPropias(b: BloqueRolliza, ctx: ContextoTrozasRevision): { ids: string[]; trozas: TrozaRevision[] } {
  const porId = new Map<string, TrozaRevision>();
  for (const t of ctx.libro) if (!porId.has(t.id)) porId.set(t.id, t);
  const elegidas = (b.trozaIds ?? []).filter((x) => x.trim() !== "");
  if (elegidas.length > 0) {
    const ids = [...new Set(elegidas)];
    return { ids, trozas: ids.map((id) => porId.get(id)).filter((t): t is TrozaRevision => t != null) };
  }
  const lote = b.loteId ? ctx.lotes.get(b.loteId) : undefined;
  if (lote) return { ids: [...new Set(lote.trozas.map((t) => t.id))], trozas: [...lote.trozas] };
  return { ids: [], trozas: [] };
}

const nombreTroza = (t: TrozaRevision | undefined, id: string) => t?.codigo?.trim() || `#${id.slice(-6)}`;

// ── 1 · Rendimiento por bloque ──────────────────────────────────────────────

/**
 * Lo que el bloque ampara contra lo que su rolliza puede dar según SERFOR:
 * m³ (R) × (56 % + 3 pp), o 41 % + 3 si el bloque es de tablillas. Pasar de ahí
 * es la señal clásica de blanqueo (ctp-rendimiento.ts). Pasar de 100 % es
 * imposible: va como error, la misma regla que ya tenía la especie.
 */
export function revisarRendimientoDeBloques(dist: Distribucion): HallazgoRevision[] {
  const out: HallazgoRevision[] = [];
  for (const e of dist.especies) {
    for (const d of e.bloques) {
      const b = d.bloque;
      if (esAserradaDirecta(b)) continue; // no salió de ninguna troza: no tiene rendimiento
      const rolliza = Number(b.m3);
      if (!(rolliza > TOL_M3) || d.usadoM3 <= TOL_M3) continue;
      const ref = rendimientoReferencial(b.tipoProducto) ?? RENDIMIENTO_REF_ASERRADA;
      const umbral = umbralRendimientoAlto(b.tipoProducto);
      const techoM3 = (rolliza * umbral) / 100;
      if (d.usadoM3 - techoM3 <= TOL_M3) continue;
      const pct = (d.usadoM3 / rolliza) * 100;
      const imposible = pct > 100 + 1e-9;
      out.push({
        id: `${b.id}:rendimiento`,
        severidad: imposible ? "error" : "aviso",
        bloqueId: b.id,
        donde: rotulo(b),
        que: imposible
          ? `Ampara ${f3(d.usadoM3)} m³ de ${f3(rolliza)} m³ de rolliza (${f1(pct)} %): salió más de lo que entró.`
          : `Rinde ${f1(pct)} %: ampara ${f3(d.usadoM3)} m³ y su rolliza da hasta ${f3(techoM3)} m³ al referencial SERFOR (${ref} % + ${RENDIMIENTO_TOLERANCIA_PP}).`,
        comoArreglar: imposible
          ? "De una troza no sale más madera que la troza misma: revisa el m³ de rolliza o el «ampara» dicho a mano."
          : "Revisa el % aprovechable o el «ampara» dicho a mano. Si de verdad rindió eso, ten a mano el sustento (coeficiente de rendimiento superior).",
        info: {
          what: `Rendimiento = aserrada ÷ rolliza. El referencial SERFOR (RDE D000259-2024) es ${RENDIMIENTO_REF_ASERRADA} % para aserrada y 41 % para tablillas; se marca desde ${umbral} % por el margen de medición.`,
          example: `${f3(rolliza)} m³ de rolliza × ${umbral} % = ${f3(techoM3)} m³. Este bloque ampara ${f3(d.usadoM3)} m³.`,
        },
      });
    }
  }
  return out;
}

// ── 2-5 · Las trozas del bloque ─────────────────────────────────────────────

/**
 * El día en que arrancó el bloque: su fecha, o la jornada más temprana que ya
 * se escribió en el Libro si alguna quedó antes. `null` = no se dijo.
 */
function inicioDelBloque(b: BloqueRolliza): string | null {
  const dias = [b.fecha, ...(b.jornadasLibro ?? []).map((j) => j.fecha)].filter(esDia).map((x) => x.slice(0, 10));
  return dias.length === 0 ? null : dias.sort()[0];
}

export function revisarTrozasDeBloques(
  bloques: readonly BloqueRolliza[],
  dist: Distribucion,
  ctx: ContextoTrozasRevision | null | undefined,
): HallazgoRevision[] {
  if (!ctx || (ctx.libro.length === 0 && ctx.lotes.size === 0)) return [];
  const out: HallazgoRevision[] = [];
  const porId = new Map<string, TrozaRevision>();
  for (const t of ctx.libro) if (!porId.has(t.id)) porId.set(t.id, t);
  const usado = new Map<string, number>();
  for (const e of dist.especies) for (const d of e.bloques) usado.set(d.bloque.id, d.usadoM3);

  // 4 · La misma troza en dos bloques: troza → bloques que la nombran.
  const duenosDeTroza = new Map<string, BloqueRolliza[]>();

  for (const b of bloques) {
    if (esAserradaDirecta(b)) continue;
    const rot = rotulo(b);
    const { ids, trozas } = trozasPropias(b, ctx);
    for (const id of ids) {
      const acc = duenosDeTroza.get(id) ?? [];
      acc.push(b);
      duenosDeTroza.set(id, acc);
    }

    // 2 · Aserrado antes de que llegue la troza (T3, ADR-433).
    const inicio = inicioDelBloque(b);
    if (inicio) {
      const tarde = trozas
        .map((t) => ({ t, dia: esDia(t.llegada) ? t.llegada.slice(0, 10) : null }))
        .filter((x): x is { t: TrozaRevision; dia: string } => x.dia != null && x.dia > inicio);
      if (tarde.length > 0) {
        const ultima = tarde.map((x) => x.dia).sort()[tarde.length - 1];
        const nombres = tarde.slice(0, 3).map((x) => nombreTroza(x.t, x.t.id)).join(", ");
        out.push({
          id: `${b.id}:antes-de-llegar`,
          severidad: "aviso",
          bloqueId: b.id,
          donde: rot,
          que: `Se aserró el ${fechaConDia(inicio)} y ${plural(tarde.length, "troza llegó", "trozas llegaron")} después (${nombres}${tarde.length > 3 ? "…" : ""}; la última el ${fechaConDia(ultima)}).`,
          comoArreglar: `Corre la fecha del bloque al ${fechaConDia(ultima)} o saca esas trozas: el Libro rechaza una corrida anterior a la llegada de su troza.`,
          info: {
            what: "La llegada es la recepción de la troza; si no la tiene, la de su guía; si tampoco, el asiento de la guía. Es la misma regla con la que el Libro frena al registrar (T3).",
            example: "Bloque aserrado el lunes 07/09 con una troza de una guía recibida el miércoles 23/09.",
          },
        });
      }
    }

    // 3 · Troza de otra especie dentro del bloque.
    const kBloque = claveEspecie(b.especie);
    if (kBloque !== "") {
      const ajenas = trozas.filter((t) => claveEspecie(t.especieComun) !== "" && claveEspecie(t.especieComun) !== kBloque);
      if (ajenas.length > 0) {
        const porEspecie = new Map<string, number>();
        for (const t of ajenas) {
          const esp = (t.especieComun ?? "").trim();
          porEspecie.set(esp, (porEspecie.get(esp) ?? 0) + 1);
        }
        const lista = [...porEspecie].map(([esp, n]) => `${n} de ${esp}`).join(", ");
        out.push({
          id: `${b.id}:troza-otra-especie`,
          severidad: "aviso",
          bloqueId: b.id,
          donde: rot,
          que: `El bloque es de ${b.especie.trim()} y ${plural(ajenas.length, "troza es", "trozas son")} de otra especie (${lista}).`,
          comoArreglar: "Saca esas trozas del bloque o corrige su especie: el Anexo 04 declara la especie del bloque y el Libro no mezcla especies en un lote.",
          info: {
            what: "Compara la especie de cada troza elegida (o de su lote) con la del bloque.",
            example: "Bloque de Tornillo con 2 trozas de Capirona: su m³ amparía Tornillo que salió de Capirona.",
          },
        });
      }
    }

    // 5 · Diámetro sin comprobar. El lote Smalian del cubicador trae Ø por
    //     construcción: sólo se mira lo que viene del Libro.
    if ((usado.get(b.id) ?? 0) > TOL_M3 && !(b.origen === "trozas" && ids.length === 0 && !b.loteId)) {
      const { trozas: respaldo, fuente } = trozasDelBloque(b, { libro: ctx.libro, lotes: ctx.lotes, cubicador: [] });
      const sinD = respaldo.filter((t) => diametroUtilCm(t) == null).length;
      if (respaldo.length > 0 && sinD > 0) {
        const todas = sinD === respaldo.length;
        out.push({
          id: `${b.id}:sin-diametro`,
          severidad: "aviso",
          bloqueId: b.id,
          donde: rot,
          que: todas
            ? `Diámetro sin comprobar: ${plural(sinD, "troza sin Ø", "trozas sin Ø")}.`
            : `Diámetro sin comprobar en ${sinD} de ${respaldo.length} trozas (no tienen Ø).`,
          comoArreglar: "Mide el Ø en las dos puntas y cárgalo en la troza: sin él no se sabe si las piezas más anchas salen de esas trozas.",
          info: {
            what: `«¿Cuadran las medidas?» compara cada pieza con el largo y el Ø de ${fuente ?? "las trozas del bloque"}. Una troza sin Ø sólo se compara por el largo: el ancho se da por bueno sin mirarlo.`,
            example: "Una tabla de 12 pulgadas de ancho no sale de una troza de 25 cm de Ø; sin el Ø, el cuadre no lo ve.",
          },
        });
      }
    }
  }

  for (const [, bs] of agruparRepetidas(duenosDeTroza)) {
    const { bloques: delGrupo, trozaIds } = bs;
    const nombres = trozaIds.slice(0, 3).map((id) => nombreTroza(porId.get(id), id)).join(", ");
    out.push({
      id: `rep:${delGrupo.map((b) => b.id).join("+")}`,
      severidad: "aviso",
      bloqueId: delGrupo[0].id,
      donde: delGrupo.map(rotulo).join(" · "),
      que: `${plural(trozaIds.length, "troza está", "trozas están")} en ${delGrupo.length} bloques a la vez (${nombres}${trozaIds.length > 3 ? "…" : ""}).`,
      comoArreglar: "Una troza se asierra una sola vez: déjala en un solo bloque. Si no, su m³ de rolliza se cuenta dos veces y el Libro rechaza la segunda corrida.",
      info: {
        what: "Cruza las trozas elegidas de cada bloque (y las de su lote). El selector ya esconde las que otro bloque tomó; esto atrapa las que llegaron por otro camino (lote creado, planilla, copia).",
        example: "La troza T-014 en «Bloque 1» y en «Bloque 3»: 0,8 m³ de rolliza amparando dos veces.",
      },
    });
  }
  return out;
}

/** Trozas repetidas, agrupadas por el juego de bloques que las comparte (un aviso por juego, no por troza). */
function agruparRepetidas(duenosDeTroza: ReadonlyMap<string, BloqueRolliza[]>) {
  const grupos = new Map<string, { bloques: BloqueRolliza[]; trozaIds: string[] }>();
  for (const [trozaId, bs] of duenosDeTroza) {
    const unicos = [...new Map(bs.map((b) => [b.id, b])).values()];
    if (unicos.length < 2) continue;
    const k = unicos.map((b) => b.id).join("+");
    const g = grupos.get(k) ?? { bloques: unicos, trozaIds: [] };
    g.trozaIds.push(trozaId);
    grupos.set(k, g);
  }
  return grupos;
}

// ── 6 · Piezas con medidas imposibles ───────────────────────────────────────

interface MedidaRevisable {
  medida: string;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: string;
  uAncho: string;
  uLargo: string;
  piezas: number;
}

/**
 * Por qué una medida no puede ser, o `null` si es creíble. Pasa las unidades a
 * pulgadas y pies (las de `RANGOS_MEDIDA`) y reusa `medidaSospechosa`, la misma
 * que marca el dictado: un criterio para la misma tabla.
 */
export function motivoMedidaImposible(m: MedidaRevisable): string | null {
  const lados = [m.espesor, m.ancho, m.largo];
  if (lados.some((v) => !Number.isFinite(v) || v <= 0)) {
    const cero = [!(m.espesor > 0) && "espesor", !(m.ancho > 0) && "ancho", !(m.largo > 0) && "largo"].filter(Boolean);
    return `${cero.join(" y ")} en 0`;
  }
  const e = enPulgadas(m.espesor, m.uEspesor);
  const a = enPulgadas(m.ancho, m.uAncho);
  const l = enPies(m.largo, m.uLargo);
  if (e == null || a == null || l == null) {
    const rara = e == null ? m.uEspesor : a == null ? m.uAncho : m.uLargo;
    return `unidad «${rara || "vacía"}» desconocida`;
  }
  if (!medidaSospechosa(e, a, l)) return null;
  if (e > a) return "más gruesa que ancha (¿dictada al revés?)";
  const R = RANGOS_MEDIDA;
  if (l < R.largo.min || l > R.largo.max) return `largo de ${f1(l)} pies, fuera de ${R.largo.min}–${R.largo.max}`;
  if (e < R.espesor.min || e > R.espesor.max) return `espesor de ${f1(e)} pulg, fuera de ${R.espesor.min}–${R.espesor.max}`;
  return `ancho de ${f1(a)} pulg, fuera de ${R.ancho.min}–${R.ancho.max}`;
}

/* En su unidad, el número va tal cual; convertido, se redondea al micrón para
   que 76,2 cm no den 30,000000000000004 pulgadas y caigan fuera del rango. */
const micro = (v: number) => Math.round(v * 1e6) / 1e6;
function enPulgadas(v: number, u: string): number | null {
  if (u === "pulg") return v;
  const cm = aCm(v, u);
  return cm == null ? null : micro(cm / CM_POR_PULGADA);
}
function enPies(v: number, u: string): number | null {
  if (u === "pies") return v;
  const metros = aMetros(v, u);
  return metros == null ? null : micro(metros / M_POR_PIE);
}

const claveMedida = (m: MedidaRevisable) => `${m.espesor}${m.uEspesor}×${m.ancho}${m.uAncho}×${m.largo}${m.uLargo}`;

export function revisarMedidasImposibles(dist: Distribucion): HallazgoRevision[] {
  const out: HallazgoRevision[] = [];
  const info = {
    what: `Reusa el control del dictado: espesor ${RANGOS_MEDIDA.espesor.min}–${RANGOS_MEDIDA.espesor.max} pulg, ancho ${RANGOS_MEDIDA.ancho.min}–${RANGOS_MEDIDA.ancho.max} pulg, largo ${RANGOS_MEDIDA.largo.min}–${RANGOS_MEDIDA.largo.max} pies, nada en 0 y la tabla no más gruesa que ancha.`,
    example: "«8×2×10» (8 pulgadas de espesor y 2 de ancho) casi siempre es «2×8×10» dictado al revés.",
  };
  const revisarFilas = (idBase: string, bloqueId: string | null, donde: string, medidas: readonly MedidaRevisable[]) => {
    const vistas = new Map<string, { m: MedidaRevisable; piezas: number; motivo: string }>();
    for (const m of medidas) {
      const motivo = motivoMedidaImposible(m);
      if (!motivo) continue;
      const k = claveMedida(m);
      const v = vistas.get(k);
      if (v) v.piezas += m.piezas;
      else vistas.set(k, { m, piezas: m.piezas, motivo });
    }
    const filas = [...vistas.values()];
    filas.slice(0, MAX_FILAS_POR_BLOQUE).forEach(({ m, piezas, motivo }) => {
      out.push({
        id: `${idBase}:medida:${claveMedida(m)}`,
        severidad: "aviso",
        bloqueId,
        donde: `${donde} · ${m.medida}`,
        que: `${plural(piezas, "pieza", "piezas")} con medida imposible: ${motivo}.`,
        comoArreglar: "Corrige esa fila en el cubicador (Herramientas › Cubicador de madera): el Anexo 04 la copiaría tal cual.",
        info,
      });
    });
    if (filas.length > MAX_FILAS_POR_BLOQUE) {
      const resto = filas.slice(MAX_FILAS_POR_BLOQUE);
      out.push({
        id: `${idBase}:medida:resto`,
        severidad: "aviso",
        bloqueId,
        donde,
        que: `${plural(resto.length, "medida imposible más", "medidas imposibles más")} (${resto.slice(0, 3).map((r) => r.m.medida).join(", ")}…).`,
        comoArreglar: "Corrígelas en el cubicador: son filas con 0, unidades raras o dictadas al revés.",
        info,
      });
    }
  };
  for (const e of dist.especies) {
    for (const d of e.bloques) {
      revisarFilas(d.bloque.id, d.bloque.id, rotulo(d.bloque), d.asignado.flatMap((g) => g.medidas));
    }
    revisarFilas(`esp:${e.especie}:falta`, null, `${e.especie || "Sin especie"} · por distribuir`, e.faltante.flatMap((f) => f.medidas));
  }
  return out;
}
