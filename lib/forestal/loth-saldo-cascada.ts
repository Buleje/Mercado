/**
 * Dónde está HOY el volumen de un plan, especie por especie (ADR-459).
 *
 * Brandon (2-10-2026), sobre la plantación: «con esos m³ y especie se trabaja
 * […] de acuerdo a los procesos se descontará el volumen». Una plantación no
 * tiene censo: su base es lo REGISTRADO por especie, y cada proceso del libro
 * mueve volumen de un casillero al siguiente:
 *
 *   registrado ─ tala ─▶ talado ─ trozado ─▶ en patio ─ despacho ─▶ fuera
 *
 *   · En pie            = registrado − talado          (negativo = se taló de más)
 *   · Talado sin trozar = talado − trozado              (≥ 0)
 *   · Trozas en patio   = trozado − movilizado COMO TROZA − consumido (≥ 0)
 *   · Despachado        = movilizado (GTF)
 *   · Consumido en el TH
 *
 * La MISMA madera se asienta en tala, trozado y despacho: nunca se suman entre
 * sí (sería ~3× el volumen real). Cada casillero es una RESTA de la etapa
 * anterior, así que en pie + sin trozar + patio + despachado + consumido
 * reconstruye el registrado salvo la merma (lo talado que no llegó a troza).
 *
 * Sirve igual para un PO (su base es lo autorizado): el nombre de la base lo
 * pone la pantalla («registrado» en plantación, «autorizado» en bosque).
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { computeBalance, claveEnElPlan, claveEspecie, type BalanceMovement, type BalanceSpeciesInput, type EspecieReconocible } from "./loth-constants";
import { claveT6, excedeT6, excedeTechoM3, excesoT6, ningunPlanAutorizaT6, tePasasT6, type MedidaT6 } from "./loth-t6";

/** Lo que hace falta de una fila del balance del plan (`computeBalance`). */
export interface FilaBalanceCascada {
  species: string;
  cites: boolean;
  autorizado: number;
  talado: number;
  trozado: number;
  movilizado: number;
  /**
   * Sólo el despacho de trozas (`computeBalance.movilizadoTroza`). El producto
   * despachado salió de trozas que ya se restan como consumidas: con
   * `movilizado` el patio las restaba dos veces. Sin el campo (respuesta
   * vieja), se usa `movilizado`.
   */
  movilizadoTroza?: number;
  consumido: number;
}

export interface CascadaEspecie {
  especie: string;
  cites: boolean;
  /** La base: registrado (plantación) o autorizado (bosque). */
  baseM3: number;
  taladoM3: number;
  trozadoM3: number;
  /** base − talado. Negativo = se taló más de lo registrado. */
  enPieM3: number;
  taladoSinTrozarM3: number;
  enPatioM3: number;
  despachadoM3: number;
  consumidoM3: number;
  /** talado ÷ base × 100; `null` sin base. */
  pctTalado: number | null;
  /**
   * Se taló o se movilizó más que la base. Los dos lados con LA regla del techo,
   * `excedeTechoM3` (a 3 decimales: la de la guía, el 422 T6 y el semáforo):
   * 3,0004 talado sobre 3 no pasa; 3,002 sí.
   */
  excedido: boolean;
}

/** 0,01 m³ = 10 litros: lo fino de una cinta en el monte, no el epsilon del float. */
export const TOLERANCIA_CASCADA_M3 = 0.01;

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const pos = (n: number): number => (n > TOLERANCIA_CASCADA_M3 ? r4(n) : 0);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function cascadaDeFila(f: FilaBalanceCascada): CascadaEspecie {
  const base = num(f.autorizado);
  const talado = num(f.talado);
  const trozado = num(f.trozado);
  const movilizado = num(f.movilizado);
  const salioComoTroza = f.movilizadoTroza == null ? movilizado : num(f.movilizadoTroza);
  const consumido = num(f.consumido);
  return {
    especie: f.species,
    cites: f.cites,
    baseM3: r4(base),
    taladoM3: r4(talado),
    trozadoM3: r4(trozado),
    enPieM3: r4(base - talado),
    taladoSinTrozarM3: pos(talado - trozado),
    enPatioM3: pos(trozado - salioComoTroza - consumido),
    despachadoM3: r4(movilizado),
    consumidoM3: r4(consumido),
    pctTalado: base > TOLERANCIA_CASCADA_M3 ? Math.round((talado / base) * 1000) / 10 : null,
    excedido: excedeTechoM3(talado, base) || excedeTechoM3(movilizado, base),
  };
}

export interface CascadaPlan {
  especies: CascadaEspecie[];
  total: CascadaEspecie;
}

/** La cascada de cada especie del plan y la del plan entero. */
export function cascadaDelPlan(filas: readonly FilaBalanceCascada[]): CascadaPlan {
  const especies = filas.map(cascadaDeFila);
  const suma = (k: keyof FilaBalanceCascada) => filas.reduce((a, f) => a + num(f[k]), 0);
  const total = cascadaDeFila({
    species: "Total",
    cites: filas.some((f) => f.cites),
    autorizado: suma("autorizado"),
    talado: suma("talado"),
    trozado: suma("trozado"),
    movilizado: suma("movilizado"),
    movilizadoTroza: filas.reduce((a, f) => a + num(f.movilizadoTroza ?? f.movilizado), 0),
    consumido: suma("consumido"),
  });
  /* El total de los casilleros que se recortan a 0 es la suma de las especies,
     no el recorte del total: una especie con patio y otra sin trozar no se
     compensan entre sí. */
  total.taladoSinTrozarM3 = r4(especies.reduce((a, e) => a + e.taladoSinTrozarM3, 0));
  total.enPatioM3 = r4(especies.reduce((a, e) => a + e.enPatioM3, 0));
  total.excedido = especies.some((e) => e.excedido);
  return { especies, total };
}

// ── El saldo grande del plan y su freno (24-10, «Saldo que no se pasa») ──────
//
// Brandon: «saldo grande por especie (autorizado · usado · queda); una guía que
// se pasa del saldo se frena: "te pasas por 3,2 m³"». No es otra cuenta: «usado»
// es lo que T6 mide (`ForestLothDB.medidasT6`, que espeja `computeBalance`) y el
// freno es `excedeT6` — siempre `≤`: justo en el borde, pasa.
//
// ADR-459: las líneas SIN plan cuentan en el saldo de TODOS los planes (la cuenta
// conservadora). El saldo lo dice aparte (`usadoSinPlanM3`) para que se vea por
// qué «atar lo suelto» devuelve saldo.


/** Una línea registrada del libro, con su plan y su guía (las del plan y las sin plan). */
export interface MovimientoDelSaldo extends BalanceMovement {
  planId: string | null;
  gtfNumber: string | null;
  /** Sólo cuenta lo registrado: una línea anulada no gasta saldo (sin el campo = registrada). */
  status?: string | null;
}

/** Cuánto de una especie se llevó una guía (o los despachos sin N° de guía). */
export interface UsoDeLaGuia {
  /** `null` = despachos sin N° de guía. */
  gtfNumber: string | null;
  m3: number;
  /** Trozas despachadas de la especie (el producto en m³ no cuenta trozas). */
  trozas: number;
  /** Sus líneas no tienen plan: cuentan en el saldo de todos los planes (ADR-459). */
  sinPlan: boolean;
}

export interface SaldoDeEspecie {
  clave: string;
  especie: string;
  cites: boolean;
  /** Lo autorizado (lo registrado, en plantación). `null` = el plan no le pone techo. */
  autorizadoM3: number | null;
  /** Lo ya movilizado que T6 mide: del plan + sin plan. */
  usadoM3: number;
  /** De `usadoM3`, lo que no tiene plan. */
  usadoSinPlanM3: number;
  /** autorizado − usado; `null` sin techo; negativo = ya se pasó. */
  quedaM3: number | null;
  /** usado ÷ autorizado × 100, a un decimal; `null` sin techo. */
  pctUsado: number | null;
  /** Ya pasó el techo (la regla de T6: `excedeTechoM3`, a 3 decimales). */
  excedido: boolean;
  /** De dónde salió lo usado, la guía que más se llevó primero. */
  guias: UsoDeLaGuia[];
}

export interface SaldoDelPlan {
  /** Las del plan primero (en su orden); después lo movilizado de especies que no tiene. */
  especies: SaldoDeEspecie[];
  /** Sólo de las especies con techo: sumar «sin techo» al saldo inventaría uno. */
  total: { autorizadoM3: number; usadoM3: number; usadoSinPlanM3: number; quedaM3: number };
  /** Ninguna especie con volumen autorizado: el freno no tiene contra qué medir. */
  sinTecho: boolean;
}

const DESPACHOS = new Set(["despacho_troza", "despacho_producto"]);

/**
 * El saldo de UN plan por especie, con la guía de cada m³. `movimientos` = las
 * líneas registradas del plan y las sin plan (el alcance de T6; las de otro plan
 * se descartan, salvo el Trozado de una troza despachada en el alcance: el
 * despacho decide a qué plan cuenta y su volumen sale de ese Trozado aunque sea
 * de otro plan —un plan dado de baja con tala, 25-10—, como `medidasT6`).
 * `medidas` (opcional) = lo que mide `medidasT6` por clave:
 * si viene, manda en lo autorizado y lo usado — así la pantalla dice lo mismo que
 * el 422. Lo de cada guía sale de `computeBalance` con sólo SUS despachos: la
 * regla de volumen es una sola y las partes suman el total.
 */
export function saldoDelPlan(
  species: readonly BalanceSpeciesInput[],
  movimientos: readonly MovimientoDelSaldo[],
  planId: string,
  medidas?: ReadonlyMap<string, MedidaT6>,
): SaldoDelPlan {
  const vivos = movimientos.filter((m) => m.status == null || m.status === "registrado");
  const enAlcance = (m: MovimientoDelSaldo) => m.planId == null || m.planId === planId;
  const propios = vivos.filter(enAlcance);
  const conTrozado = new Set(propios.flatMap((m) => (m.section === "trozado" && m.trozaCode ? [m.trozaCode] : [])));
  const despachadas = new Set(propios.flatMap((m) => (m.section === "despacho_troza" && m.trozaCode ? [m.trozaCode] : [])));
  /* El Trozado de otro plan de una troza despachada acá (y sin Trozado propio): sólo da el volumen. */
  const prestados = vivos.filter(
    (m) => !enAlcance(m) && m.section === "trozado" && !!m.trozaCode && despachadas.has(m.trozaCode) && !conTrozado.has(m.trozaCode),
  );
  const delAlcance = [...propios, ...prestados];
  const base = delAlcance.filter((m) => !DESPACHOS.has(m.section));
  const despachos = delAlcance.filter((m) => DESPACHOS.has(m.section));
  const lista = [...species];

  /* Lo movilizado por clave de un conjunto de despachos (mismas filas base). */
  const movilizadoDe = (ds: readonly MovimientoDelSaldo[]): Map<string, { especie: string; m3: number }> => {
    const b = computeBalance(lista, [...base, ...ds]);
    const out = new Map<string, { especie: string; m3: number }>();
    for (const r of b.rows) if (r.movilizado > 0) out.set(claveEspecie(r.species), { especie: r.species, m3: r.movilizado });
    for (const f of b.fueraDePlan) {
      const k = claveEspecie(f.species);
      const prev = out.get(k);
      out.set(k, { especie: prev?.especie ?? f.species, m3: r4((prev?.m3 ?? 0) + f.movilizadoM3) });
    }
    return out;
  };

  /* Trozas por clave: la especie de cada troza sale de su Trozado (el último, como `computeBalance`). */
  const especieDeTroza = new Map<string, { comun: string | null; cientifico: string | null }>();
  for (const m of base) {
    if (m.section === "trozado" && m.trozaCode) especieDeTroza.set(m.trozaCode, { comun: m.speciesCommon, cientifico: m.speciesScientific ?? null });
  }

  const grupos = new Map<string, MovimientoDelSaldo[]>();
  for (const d of despachos) {
    const k = `${d.gtfNumber?.trim() ?? ""}\u0000${d.planId == null ? 1 : 0}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const usosDe = new Map<string, UsoDeLaGuia[]>();
  for (const ds of grupos.values()) {
    const [primero] = ds;
    const trozasDe = new Map<string, number>();
    for (const d of ds) {
      const t = d.section === "despacho_troza" && d.trozaCode ? especieDeTroza.get(d.trozaCode) : undefined;
      if (!t?.comun) continue;
      const k = claveEnElPlan(lista, t.comun, t.cientifico);
      trozasDe.set(k, (trozasDe.get(k) ?? 0) + 1);
    }
    for (const [k, v] of movilizadoDe(ds)) {
      const uso: UsoDeLaGuia = { gtfNumber: primero.gtfNumber?.trim() || null, m3: r4(v.m3), trozas: trozasDe.get(k) ?? 0, sinPlan: primero.planId == null };
      usosDe.set(k, [...(usosDe.get(k) ?? []), uso]);
    }
  }

  const total = computeBalance(lista, delAlcance);
  const sinPlan = movilizadoDe(despachos.filter((d) => d.planId == null));
  const fila = (clave: string, especie: string, cites: boolean, autorizadoPlan: number | null, usadoPlan: number): SaldoDeEspecie => {
    /* La medida de T6 manda cuando mide (techo conocido): así la pantalla dice lo mismo que el 422. */
    const medida = medidas?.get(clave);
    const t6 = medida?.autorizado != null ? medida : null;
    const autorizado = t6 ? t6.autorizado : autorizadoPlan;
    const usado = r4(t6 ? t6.movilizado : usadoPlan);
    const guias = (usosDe.get(clave) ?? []).sort((a, b) => b.m3 - a.m3 || (a.gtfNumber ?? "").localeCompare(b.gtfNumber ?? "", "es", { numeric: true }));
    return {
      clave,
      especie,
      cites,
      autorizadoM3: autorizado == null ? null : r4(autorizado),
      usadoM3: usado,
      usadoSinPlanM3: r4(Math.min(usado, sinPlan.get(clave)?.m3 ?? 0)),
      quedaM3: autorizado == null ? null : r4(autorizado - usado),
      pctUsado: autorizado != null && autorizado > 0 ? Math.round((usado / autorizado) * 1000) / 10 : null,
      excedido: autorizado != null && excedeT6({ autorizado, movilizado: usado }, 0),
      guias,
    };
  };

  /* Las especies del plan (una por clave: dos filas de la misma suman su techo, como `medidasT6`). */
  const delPlan = new Map<string, { especie: string; cites: boolean; autorizado: number }>();
  for (const s of lista) {
    const k = claveEspecie(s.speciesCommon);
    const prev = delPlan.get(k);
    delPlan.set(k, { especie: prev?.especie ?? s.speciesCommon.trim(), cites: (prev?.cites ?? false) || s.cites, autorizado: (prev?.autorizado ?? 0) + Number(s.volumenAutorizadoM3) });
  }
  const movilizadoPlan = new Map(total.rows.map((r) => [claveEspecie(r.species), r.movilizado]));
  const especies: SaldoDeEspecie[] = [...delPlan].map(([k, e]) => fila(k, e.especie, e.cites, e.autorizado, movilizadoPlan.get(k) ?? 0));
  for (const f of total.fueraDePlan) {
    const k = claveEspecie(f.species);
    if (delPlan.has(k) || especies.some((e) => e.clave === k)) continue;
    especies.push(fila(k, f.species, false, null, f.movilizadoM3));
  }

  const conTecho = especies.filter((e) => e.autorizadoM3 != null);
  const suma = (k: "autorizadoM3" | "usadoM3" | "usadoSinPlanM3") => r4(conTecho.reduce((a, e) => a + (e[k] ?? 0), 0));
  return {
    especies,
    total: { autorizadoM3: suma("autorizadoM3"), usadoM3: suma("usadoM3"), usadoSinPlanM3: suma("usadoSinPlanM3"), quedaM3: r4(suma("autorizadoM3") - suma("usadoM3")) },
    sinTecho: conTecho.length === 0,
  };
}

/** Una pieza de la guía que se arma: su especie y su volumen (el de la troza del libro o el medido a mano). */
export interface PiezaParaFreno {
  comun: string | null;
  cientifico?: string | null;
  volumeM3: number | null;
}

export interface FrenoDeSaldo {
  /** Especies que pasan el saldo: el servidor las rechaza (422 `T6_EXCESO_AUTORIZADO`) con el mismo mensaje. */
  bloqueos: { clave: string; especie: string; guiaM3: number; quedaM3: number; excesoM3: number; mensaje: string }[];
  /** Lo que no se puede medir: el plan no le pone techo. Avisa; no frena. */
  avisos: { especie: string; guiaM3: number; mensaje: string }[];
}

/**
 * ¿La guía que se arma pasa el saldo? Por especie del plan (`claveT6`:
 * «TORNILLO» = «Tornillo» = «Tornillo (Cedrelinga …)»), Σ de sus piezas contra
 * lo que queda, con `excedeT6` (`≤` pasa). Lo que el plan no limita —sin volumen
 * autorizado, o una especie que no tiene— va a `avisos`: no hay contra qué frenar.
 */
type SumaDePiezas = Map<string, { especie: string; m3: number }>;

/** Σ de las piezas por especie DEL PLAN (`claveT6`); las que el plan no tiene, aparte por su propia clave. */
function sumarPiezas(delPlan: readonly EspecieReconocible[], piezas: readonly PiezaParaFreno[]): { porClave: SumaDePiezas; sinClave: SumaDePiezas } {
  const porClave: SumaDePiezas = new Map();
  const sinClave: SumaDePiezas = new Map();
  for (const p of piezas) {
    const v = Number(p.volumeM3 ?? 0);
    const especie = p.comun?.trim();
    if (!especie || !(v > 0)) continue;
    const clave = claveT6(delPlan, especie, p.cientifico);
    const destino = clave ? porClave : sinClave;
    const k = clave ?? claveEspecie(especie);
    const prev = destino.get(k);
    destino.set(k, { especie: prev?.especie ?? especie, m3: r4((prev?.m3 ?? 0) + v) });
  }
  return { porClave, sinClave };
}

/** Lo que frena (o avisa) de las especies que el plan SÍ tiene. */
function frenoDeLoDelPlan(saldo: Pick<SaldoDelPlan, "especies">, porClave: SumaDePiezas, plan: string | null): FrenoDeSaldo {
  const elPlan = plan?.trim() ? `plan ${plan.trim()}` : "plan";
  const bloqueos: FrenoDeSaldo["bloqueos"] = [];
  const avisos: FrenoDeSaldo["avisos"] = [];
  for (const [clave, g] of porClave) {
    const s = saldo.especies.find((e) => e.clave === clave);
    if (!s || s.autorizadoM3 == null) {
      avisos.push({ especie: g.especie, guiaM3: g.m3, mensaje: `El ${elPlan} no tiene volumen autorizado de ${g.especie}: esta guía no se frena.` });
      continue;
    }
    const m = { autorizado: s.autorizadoM3, movilizado: s.usadoM3 };
    if (!excedeT6(m, g.m3)) continue;
    bloqueos.push({
      clave,
      especie: s.especie,
      guiaM3: g.m3,
      quedaM3: r4(s.autorizadoM3 - s.usadoM3),
      excesoM3: excesoT6(m, g.m3),
      mensaje: tePasasT6(s.especie, m, g.m3, plan),
    });
  }
  return { bloqueos, avisos };
}

export function frenoDeSaldo(
  saldo: Pick<SaldoDelPlan, "especies" | "sinTecho">,
  delPlan: readonly EspecieReconocible[],
  piezas: readonly PiezaParaFreno[],
  plan: string | null,
): FrenoDeSaldo {
  const { porClave, sinClave } = sumarPiezas(delPlan, piezas);
  const elPlan = plan?.trim() ? `plan ${plan.trim()}` : "plan";
  const { bloqueos, avisos } = frenoDeLoDelPlan(saldo, porClave, plan);
  for (const g of sinClave.values()) {
    avisos.push({
      especie: g.especie,
      guiaM3: g.m3,
      mensaje: saldo.sinTecho
        ? `El ${elPlan} no tiene volumen autorizado: esta guía no se frena.`
        : `${g.especie} no está entre las especies del ${elPlan}: no tiene saldo contra qué medirse.`,
    });
  }
  return { bloqueos, avisos };
}

/** Un plan vigente contra el que se mide lo que sale sin plan (`GET /loth/saldo-plan?sinPlan=1`). */
export interface PlanParaFrenoSinPlan {
  plan: { id: string; nombre: string };
  delPlan: readonly EspecieReconocible[];
  saldo: Pick<SaldoDelPlan, "especies">;
}

/**
 * El freno de una guía SIN plan (25-10, revisión del freno): lo sin plan
 * cuenta en el saldo de CADA plan vigente (ADR-459) y el servidor la mide
 * contra todos los que le ponen techo a su especie (`enforceT6EnLote`). Frena
 * con el de cada plan que se pasa (clave `planId:clave`: la misma especie puede
 * pasar dos planes). Un plan que no tiene la especie, o sin especies cargadas,
 * no es referencia: no frena ni avisa. Hay planes con especies y ninguno tiene
 * ésta → AVISA con `ningunPlanAutorizaT6`, sin frenar: el servidor tampoco lo
 * frena (25-10, segunda revisión). Sin planes, no hay contra qué medir: no dice
 * nada.
 */
export function frenoSinPlan(planes: readonly PlanParaFrenoSinPlan[], piezas: readonly PiezaParaFreno[]): FrenoDeSaldo {
  const conEspecies = planes.filter((p) => p.delPlan.length > 0);
  const bloqueos: FrenoDeSaldo["bloqueos"] = [];
  const avisos: FrenoDeSaldo["avisos"] = [];
  if (conEspecies.length === 0) return { bloqueos, avisos };
  const enAlguno = new Set<string>();
  for (const p of conEspecies) {
    const { porClave } = sumarPiezas(p.delPlan, piezas);
    const f = frenoDeLoDelPlan(p.saldo, porClave, p.plan.nombre);
    bloqueos.push(...f.bloqueos.map((b) => ({ ...b, clave: `${p.plan.id}:${b.clave}` })));
    avisos.push(...f.avisos);
    for (const pz of piezas) if (pz.comun?.trim() && claveT6(p.delPlan, pz.comun, pz.cientifico)) enAlguno.add(claveEspecie(pz.comun));
  }
  const huerfanas: SumaDePiezas = new Map();
  for (const pz of piezas) {
    const especie = pz.comun?.trim();
    const v = Number(pz.volumeM3 ?? 0);
    if (!especie || !(v > 0) || enAlguno.has(claveEspecie(especie))) continue;
    const k = claveEspecie(especie);
    const prev = huerfanas.get(k);
    huerfanas.set(k, { especie: prev?.especie ?? especie, m3: r4((prev?.m3 ?? 0) + v) });
  }
  for (const g of huerfanas.values()) avisos.push({ especie: g.especie, guiaM3: g.m3, mensaje: ningunPlanAutorizaT6(g.especie) });
  return { bloqueos, avisos };
}
