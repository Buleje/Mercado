/**
 * loth-poa — el cerebro del PLAN OPERATIVO ANUAL sobre el censo forestal.
 *
 * Traduce las tres reglas que deciden si un árbol censado se puede tumbar o no,
 * y que hoy vivían solo en la cabeza del regente:
 *
 *   1. **DMC — Diámetro Mínimo de Corta.** Un árbol por debajo del DMC de su
 *      especie NO es aprovechable, por más que esté en el censo y valga plata.
 *      Base: RJ N° 458-2002-INRENA (SERFOR la mantiene vigente); el resto de
 *      especies va al general de 41 cm. Es EDITABLE por plan: la ARFFS puede
 *      aprobar otro DMC y las listas regionales cambian.
 *   2. **Semilleros.** De los árboles aprovechables hay que dejar en pie un
 *      porcentaje como porta-semillas (criterio estándar: los de mayor DAP, que
 *      son los mejores fenotipos). Sin eso el bosque no se regenera y la
 *      fiscalización lo observa.
 *   3. **Intensidad.** m³ y árboles por hectárea sobre el área autorizada: lo
 *      que mira OSINFOR para saber si el aprovechamiento fue razonable.
 *
 * PURO y client-safe (sin DOM, sin `lib/db/*`, sin `Date.now`): lo consumen el
 * panel del POA, el censo y la lámina imprimible.
 */

import { claveEspecie } from "./loth-constants";

/** DMC general para las especies no listadas (RJ 458-2002-INRENA). */
export const DMC_GENERAL_CM = 41;

/**
 * DMC oficial por especie (cm) — RJ N° 458-2002-INRENA.
 * Las claves están normalizadas (sin tildes, minúsculas).
 */
export const DMC_OFICIAL: Record<string, number> = {
  capirona: 41,
  topa: 41,
  capinuri: 46,
  marupa: 46,
  moena: 46,
  shihuahuaco: 51,
  pumaquiro: 53,
  copaiba: 56,
  ishpingo: 56,
  catahua: 60,
  "lagarto caspi": 61,
  tornillo: 61,
  lupuna: 64,
  cedro: 65,
  caoba: 75,
};

/**
 * Normaliza un nombre común para comparar ("Azúcar Huayo" → "azucar huayo").
 *
 * FIX 2026-08-22: delega en `claveEspecie` (`loth-constants.ts`) — antes NO
 * quitaba el científico entre paréntesis, así que un árbol censado como
 * «Tornillo» nunca matcheaba contra la especie autorizada del plan, escrita
 * como figura en la resolución: «Tornillo (Cedrelinga catenaeformis)». Mismo
 * bug que [[loth-clave-especie-plan-vs-libro]] (censado 0.00 falso, «fuera del
 * plan» falso), reaparecido acá porque el POA tiene su propia normalización
 * en vez de usar la única fuente.
 */
export function normEspecie(nombre: string): string {
  return claveEspecie(nombre);
}

/**
 * DMC aplicable a una especie: primero lo que el plan haya fijado (la ARFFS
 * puede aprobar otro), después la lista oficial, y si no, el general.
 */
export function dmcParaEspecie(nombre: string, overrides: Record<string, number> = {}): { cm: number; fuente: "plan" | "oficial" | "general" } {
  const key = normEspecie(nombre);
  const ov = overrides[key];
  if (typeof ov === "number" && Number.isFinite(ov) && ov > 0) return { cm: ov, fuente: "plan" };
  // Coincidencia por palabra: "shihuahuaco negro" hereda el DMC de shihuahuaco.
  const exacto = DMC_OFICIAL[key];
  if (exacto) return { cm: exacto, fuente: "oficial" };
  for (const [k, v] of Object.entries(DMC_OFICIAL)) {
    if (key.startsWith(`${k} `) || key.endsWith(` ${k}`) || key.includes(` ${k} `)) return { cm: v, fuente: "oficial" };
  }
  return { cm: DMC_GENERAL_CM, fuente: "general" };
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/** Árbol del censo, en el mínimo que necesita el análisis. */
export interface PoaTree {
  id: string;
  treeCode: string;
  speciesCommon: string;
  /** Diámetro a la altura del pecho, en METROS (como lo guarda el censo). */
  dapM: number | null;
  volumenEstimadoM3: number | null;
  estado: string;
}

/** Especie autorizada del plan de manejo. */
export interface PoaSpecies {
  speciesCommon: string;
  volumenAutorizadoM3: number;
  arbolesAutorizados: number | null;
}

export interface PoaConfig {
  /** DMC por especie fijado en el plan (clave normalizada → cm). */
  dmcOverrides: Record<string, number>;
  /** % de árboles aprovechables que quedan como semilleros (0–100). */
  semillerosPct: number;
}

export function defaultPoaConfig(): PoaConfig {
  // 10% es el criterio más usado en los planes de manejo peruanos.
  return { dmcOverrides: {}, semillerosPct: 10 };
}

/** Categoría operativa de cada árbol censado. */
export type PoaCategoria = "aprovechable" | "semillero" | "bajo_dmc" | "sin_dap" | "talado" | "descartado";

export const CATEGORIA_LABEL: Record<PoaCategoria, string> = {
  aprovechable: "Aprovechable",
  semillero: "Semillero",
  bajo_dmc: "Bajo DMC",
  sin_dap: "Sin DAP",
  talado: "Talado",
  descartado: "Descartado",
};

export const CATEGORIA_COLOR: Record<PoaCategoria, string> = {
  aprovechable: "#15803d",
  semillero: "#0d9488",
  bajo_dmc: "#b45309",
  sin_dap: "#6b7280",
  talado: "#dc2626",
  descartado: "#6b7280",
};

export interface PoaArbol extends PoaTree {
  categoria: PoaCategoria;
  /** DAP en cm (el censo lo guarda en metros). */
  dapCm: number | null;
  dmcCm: number;
  dmcFuente: "plan" | "oficial" | "general";
}

export interface PoaEspecieRow {
  especie: string;
  dmcCm: number;
  dmcFuente: "plan" | "oficial" | "general";
  censados: number;
  sobreDmc: number;
  bajoDmc: number;
  sinDap: number;
  semilleros: number;
  aprovechables: number;
  talados: number;
  /** Volumen de los árboles aprovechables (sin semilleros ni bajo DMC). */
  volumenAprovechableM3: number;
  volumenAutorizadoM3: number | null;
  arbolesAutorizados: number | null;
  /** El plan autoriza más volumen del que el censo puede sostener. */
  autorizadoSinRespaldo: boolean;
  /** La especie está censada pero NO figura entre las autorizadas del plan. */
  fueraDelPlan: boolean;
}

export type PoaAlertaNivel = "error" | "warning" | "info";

export interface PoaAlerta {
  nivel: PoaAlertaNivel;
  titulo: string;
  detalle: string;
}

export interface PoaAnalisis {
  arboles: PoaArbol[];
  especies: PoaEspecieRow[];
  totales: {
    censados: number;
    aprovechables: number;
    semilleros: number;
    bajoDmc: number;
    talados: number;
    volumenAprovechableM3: number;
    volumenAutorizadoM3: number;
  };
  /** Intensidad sobre el área autorizada (null si no hay área declarada). */
  intensidad: { areaHa: number | null; m3PorHa: number | null; arbolesPorHa: number | null };
  alertas: PoaAlerta[];
  config: PoaConfig;
}

const round = (n: number, d = 4): number => Number(n.toFixed(d));

/**
 * Clasifica el censo y arma el cuadro del POA por especie.
 *
 * Semilleros: se reservan los de MAYOR DAP entre los que superan el DMC —
 * `ceil(sobreDMC × pct)`, con mínimo 1 cuando hay al menos un aprovechable.
 * Determinístico: mismo censo ⇒ mismos semilleros (sin `Math.random`).
 */
export function analizarPoa(opts: {
  trees: PoaTree[];
  species: PoaSpecies[];
  areaHa: number | null;
  config?: Partial<PoaConfig>;
}): PoaAnalisis {
  const config: PoaConfig = { ...defaultPoaConfig(), ...opts.config };
  const pct = Math.max(0, Math.min(100, Number(config.semillerosPct) || 0));
  const autorizadas = new Map(opts.species.map((s) => [normEspecie(s.speciesCommon), s]));

  // 1. Agrupar el censo por especie.
  const porEspecie = new Map<string, { nombre: string; trees: PoaTree[] }>();
  for (const t of opts.trees) {
    const key = normEspecie(t.speciesCommon);
    const g = porEspecie.get(key) ?? { nombre: t.speciesCommon, trees: [] };
    g.trees.push(t);
    porEspecie.set(key, g);
  }

  const arboles: PoaArbol[] = [];
  const especies: PoaEspecieRow[] = [];
  const alertas: PoaAlerta[] = [];

  for (const [key, grupo] of porEspecie) {
    const { cm: dmcCm, fuente } = dmcParaEspecie(grupo.nombre, config.dmcOverrides);
    const aut = autorizadas.get(key);

    const enPie = grupo.trees.filter((t) => t.estado === "en_pie");
    const talados = grupo.trees.filter((t) => t.estado === "talado").length;

    // Los que superan el DMC, de mayor a menor DAP: los primeros son semilleros.
    const conDap = enPie.filter((t) => t.dapM != null && Number.isFinite(t.dapM));
    const sinDap = enPie.filter((t) => t.dapM == null || !Number.isFinite(t.dapM));
    const sobre = conDap
      .filter((t) => (t.dapM as number) * 100 >= dmcCm)
      .sort((a, b) => (b.dapM as number) - (a.dapM as number) || a.treeCode.localeCompare(b.treeCode));
    const bajo = conDap.filter((t) => (t.dapM as number) * 100 < dmcCm);

    const nSemilleros = sobre.length > 0 ? Math.max(1, Math.ceil((sobre.length * pct) / 100)) : 0;
    const semilleros = pct > 0 ? sobre.slice(0, Math.min(nSemilleros, sobre.length)) : [];
    const aprovechables = sobre.slice(semilleros.length);

    const marcar = (t: PoaTree, categoria: PoaCategoria) => {
      arboles.push({
        ...t,
        categoria,
        dapCm: t.dapM != null && Number.isFinite(t.dapM) ? round((t.dapM as number) * 100, 1) : null,
        dmcCm,
        dmcFuente: fuente,
      });
    };
    for (const t of grupo.trees.filter((x) => x.estado === "talado")) marcar(t, "talado");
    for (const t of grupo.trees.filter((x) => x.estado === "descartado")) marcar(t, "descartado");
    for (const t of semilleros) marcar(t, "semillero");
    for (const t of aprovechables) marcar(t, "aprovechable");
    for (const t of bajo) marcar(t, "bajo_dmc");
    for (const t of sinDap) marcar(t, "sin_dap");

    const volumenAprovechableM3 = round(aprovechables.reduce((a, t) => a + (t.volumenEstimadoM3 ?? 0), 0));
    const volumenAutorizadoM3 = aut ? Number(aut.volumenAutorizadoM3) : null;
    const autorizadoSinRespaldo = volumenAutorizadoM3 != null && volumenAutorizadoM3 > volumenAprovechableM3 + 1e-6;

    especies.push({
      especie: grupo.nombre,
      dmcCm,
      dmcFuente: fuente,
      censados: grupo.trees.length,
      sobreDmc: sobre.length,
      bajoDmc: bajo.length,
      sinDap: sinDap.length,
      semilleros: semilleros.length,
      aprovechables: aprovechables.length,
      talados,
      volumenAprovechableM3,
      volumenAutorizadoM3,
      arbolesAutorizados: aut?.arbolesAutorizados ?? null,
      autorizadoSinRespaldo,
      fueraDelPlan: autorizadas.size > 0 && !aut,
    });
  }

  especies.sort((a, b) => b.volumenAprovechableM3 - a.volumenAprovechableM3 || a.especie.localeCompare(b.especie));

  // 2. Especies autorizadas SIN censo: el plan promete madera que nadie ubicó.
  for (const s of opts.species) {
    if (!porEspecie.has(normEspecie(s.speciesCommon))) {
      alertas.push({
        nivel: "warning",
        titulo: `${s.speciesCommon}: autorizada sin censo`,
        detalle: `El plan autoriza ${Number(s.volumenAutorizadoM3).toFixed(2)} m³ pero no hay ningún árbol de esta especie en el censo.`,
      });
    }
  }

  const totales = {
    censados: opts.trees.length,
    aprovechables: especies.reduce((a, e) => a + e.aprovechables, 0),
    semilleros: especies.reduce((a, e) => a + e.semilleros, 0),
    bajoDmc: especies.reduce((a, e) => a + e.bajoDmc, 0),
    talados: especies.reduce((a, e) => a + e.talados, 0),
    volumenAprovechableM3: round(especies.reduce((a, e) => a + e.volumenAprovechableM3, 0)),
    volumenAutorizadoM3: round(opts.species.reduce((a, s) => a + Number(s.volumenAutorizadoM3 ?? 0), 0)),
  };

  const areaHa = opts.areaHa != null && opts.areaHa > 0 ? opts.areaHa : null;
  const intensidad = {
    areaHa,
    m3PorHa: areaHa ? round(totales.volumenAprovechableM3 / areaHa, 4) : null,
    arbolesPorHa: areaHa ? round(totales.aprovechables / areaHa, 4) : null,
  };

  // 3. Alertas del cuadro.
  for (const e of especies) {
    if (e.fueraDelPlan) {
      alertas.push({
        nivel: "error",
        titulo: `${e.especie}: censada fuera del plan`,
        detalle: `Hay ${e.censados} árbol(es) censados de una especie que no figura entre las autorizadas. Tumbarlos sería aprovechamiento no autorizado.`,
      });
    }
    if (e.autorizadoSinRespaldo) {
      alertas.push({
        nivel: "warning",
        titulo: `${e.especie}: el censo no respalda lo autorizado`,
        detalle: `El plan autoriza ${(e.volumenAutorizadoM3 ?? 0).toFixed(2)} m³ y el censo solo sostiene ${e.volumenAprovechableM3.toFixed(2)} m³ aprovechables (sobre DMC ${e.dmcCm} cm y descontando semilleros).`,
      });
    }
    // Caso que confunde si no se explica: con pocos árboles, la reserva mínima
    // de 1 semillero se come toda la especie y el volumen aprovechable da 0.
    if (e.sobreDmc > 0 && e.aprovechables === 0 && e.semilleros > 0) {
      alertas.push({
        nivel: "info",
        titulo: `${e.especie}: sin volumen aprovechable`,
        detalle: `Los ${e.sobreDmc} árbol(es) que superan el DMC quedaron como semilleros (reserva mínima de 1 por especie). Bajá el % de semilleros o censá más árboles para poder aprovechar esta especie.`,
      });
    }
    if (e.sinDap > 0) {
      alertas.push({
        nivel: "info",
        titulo: `${e.especie}: ${e.sinDap} árbol(es) sin DAP`,
        detalle: "Sin diámetro no se puede decidir si superan el DMC: quedan fuera del volumen aprovechable.",
      });
    }
  }
  if (!areaHa) {
    alertas.push({
      nivel: "info",
      titulo: "Sin área declarada",
      detalle: "Declarala en el plan (o dibujá la parcela en el mapa) para calcular la intensidad en m³/ha.",
    });
  }
  /**
   * Semilleros en cero.
   *
   * Dejar árboles semilleros en pie es lo que permite que el bosque se
   * regenere, y los planes de manejo lo comprometen: aprovechar el 100% de lo
   * que supera el DMC deja el rodal sin fuente de semilla. El sistema no lo
   * impide —el porcentaje sale del plan aprobado, no de acá— pero poner cero y
   * que nadie diga nada convierte un olvido en una decisión silenciosa. Sólo se
   * avisa si hay algo que reservar: sin árboles sobre el DMC, el cero es
   * simplemente cierto.
   */
  if (pct === 0 && totales.aprovechables > 0) {
    alertas.push({
      nivel: "warning",
      titulo: "Sin semilleros reservados",
      detalle:
        `El porcentaje está en 0%, así que los ${totales.aprovechables} árboles sobre el DMC figuran todos como aprovechables. ` +
        "Revisá qué comprometió el plan aprobado y cargá ese porcentaje en Parámetros: los semilleros se eligen solos, " +
        "los de mayor diámetro de cada especie.",
    });
  }

  return { arboles, especies, totales, intensidad, alertas, config };
}

/** Orden de severidad para mostrar las alertas primero por gravedad. */
export function ordenarAlertas(alertas: PoaAlerta[]): PoaAlerta[] {
  const peso: Record<PoaAlertaNivel, number> = { error: 0, warning: 1, info: 2 };
  return [...alertas].sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
