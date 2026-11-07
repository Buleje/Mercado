/**
 * loth-chequeo-arboles — los chequeos de árboles, bloques y del plan del Libro
 * TH (26-10). PURO, como `loth-chequeo-guias`: recibe lo leído y devuelve una
 * frase por caso.
 *
 *  · Árbol talado fuera del censo, bajo el DMC sin justificar o sin
 *    coordenadas (ni en el censo ni en la línea).
 *  · Bloques del plan pasados (`porBloque.excesos` de las preliminares: la
 *    MISMA cuenta que muestra el plan, con `excedeTechoM3` a 3 decimales).
 *  · Las razones del semáforo del plan (`semaforoDelPlan`): vigencia, estado,
 *    papeles y ficha. No se recalculan acá: se leen.
 */

import type { ExcesoDeBloque } from "./loth-plan-bloques-saldo";
import type { RazonSemaforo } from "./loth-plan-semaforo";
import type { ArbolCensoChequeo, BajoDmcChequeo, LineaChequeo } from "./loth-chequeo-tipos";
import { fechaDelCaso } from "./loth-chequeo-guias";

const clave = (planId: string, treeCode: string) => `${planId}|${treeCode.trim().toUpperCase()}`;

/** m³ a 3 decimales, como el saldo («12.345», es-PE). */
export function m3(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export interface TalasYCenso {
  /** Líneas de Tala registradas. */
  talas: readonly LineaChequeo[];
  /** Los árboles del censo con el código de alguna tala. */
  censo: readonly ArbolCensoChequeo[];
  /** Planes con censo cargado (al menos un árbol): sin censo no se juzga. */
  planesConCenso: ReadonlySet<string>;
  /** Plantaciones: no llevan censo comercial. */
  plantaciones: ReadonlySet<string>;
  /** planId → «PO 12». */
  nombres: ReadonlyMap<string, string>;
}

/** Una tala por árbol (la primera): un árbol trozado en cuatro sigue siendo uno. */
function talasPorArbol(talas: readonly LineaChequeo[]): LineaChequeo[] {
  const vistas = new Set<string>();
  const out: LineaChequeo[] = [];
  for (const t of talas) {
    if (t.section !== "tala" || !t.planId || !t.treeCode?.trim()) continue;
    const k = clave(t.planId, t.treeCode);
    if (vistas.has(k)) continue;
    vistas.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Árboles talados que NO están en el censo de su plan. Sólo en planes de
 * bosque con censo cargado: una plantación no lleva censo comercial y un plan
 * sin censo todavía no dice nada (no se inventa el rojo).
 */
export function taladosSinCenso(d: TalasYCenso): string[] {
  const enCenso = new Set(d.censo.map((a) => clave(a.planId, a.treeCode)));
  return talasPorArbol(d.talas)
    .filter((t) => t.planId && d.planesConCenso.has(t.planId) && !d.plantaciones.has(t.planId))
    .filter((t) => !enCenso.has(clave(t.planId as string, t.treeCode as string)))
    .map((t) => `Árbol ${t.treeCode?.trim()} (${d.nombres.get(t.planId as string) ?? "plan"}, tala #${t.lineNo} del ${fechaDelCaso(t.fecha)}): no está en el censo`);
}

/**
 * Árboles del censo talados sin coordenadas en ningún lado: ni UTM en el censo
 * ni GPS en la línea de tala. Los que no están en el censo ya salen en
 * `taladosSinCenso` (no se cuenta dos veces el mismo árbol).
 */
export function taladosSinCoordenadas(d: TalasYCenso): string[] {
  const porArbol = new Map(d.censo.map((a) => [clave(a.planId, a.treeCode), a]));
  const conGps = new Set(
    d.talas.filter((t) => t.gps && t.planId && t.treeCode).map((t) => clave(t.planId as string, t.treeCode as string)),
  );
  return talasPorArbol(d.talas).flatMap((t) => {
    const k = clave(t.planId as string, t.treeCode as string);
    const a = porArbol.get(k);
    if (!a || a.conCoordenadas || conGps.has(k)) return [];
    return [`Árbol ${t.treeCode?.trim()} (${d.nombres.get(t.planId as string) ?? "plan"}): sin UTM en el censo ni GPS en la tala`];
  });
}

/** Talados bajo el DMC cuya tala NO trae la justificación escrita en el libro. */
export function taladosBajoDmc(talas: readonly LineaChequeo[], bajo: readonly BajoDmcChequeo[], nombres: ReadonlyMap<string, string>): string[] {
  const justificados = new Set(
    talas.filter((t) => t.section === "tala" && t.justificadaDmc && t.planId && t.treeCode).map((t) => clave(t.planId as string, t.treeCode as string)),
  );
  const dec = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
  return bajo
    .filter((b) => !justificados.has(clave(b.planId, b.treeCode)))
    .map((b) => `Árbol ${b.treeCode} (${b.especie}, ${nombres.get(b.planId) ?? "plan"}): DAP ${dec(b.dapCm)} cm y el DMC es ${dec(b.dmcCm)} cm, sin justificación`);
}

/**
 * Los bloques pasados de su volumen: con lo registrado solo (`excedeHoy`) es
 * un hecho; con las preliminares pendientes, es lo que pasaría si se registran.
 */
export function excesosDeBloques(porPlan: readonly { plan: string; excesos: readonly ExcesoDeBloque[] }[]): {
  hoy: string[];
  conPreliminares: string[];
} {
  const hoy: string[] = [];
  const conPreliminares: string[] = [];
  for (const { plan, excesos } of porPlan) {
    for (const e of excesos) {
      const donde = `${/^bloque\b/i.test(e.bloque.trim()) ? e.bloque.trim() : `Bloque ${e.bloque.trim()}`} · ${e.especie} (${plan})`;
      if (e.excedeHoy) {
        hoy.push(`${donde}: ${m3(e.usadoM3)} de ${m3(e.autorizadoM3)} m³, se pasa por ${m3(e.usadoM3 - e.autorizadoM3)} m³`);
      } else {
        conPreliminares.push(`${donde}: con las preliminares se pasaría por ${m3(e.pasaPorM3)} m³ (autorizado ${m3(e.autorizadoM3)} m³)`);
      }
    }
  }
  return { hoy, conPreliminares };
}

export interface RazonesDelPlan {
  /** Vencido o suspendido: no se tala ni se moviliza. */
  vencido: string[];
  /** Por vencer (≤ 90 días) o sin fecha cargada. */
  porVencer: string[];
  papelesVencidos: string[];
  papelesFaltan: string[];
  ficha: string[];
}

/** Las razones del semáforo de cada plan, repartidas por chequeo. Las «info» no son un problema. */
export function razonesDelPlan(planes: readonly { nombre: string; razones: readonly RazonSemaforo[] }[]): RazonesDelPlan {
  const r: RazonesDelPlan = { vencido: [], porVencer: [], papelesVencidos: [], papelesFaltan: [], ficha: [] };
  for (const p of planes) {
    for (const z of p.razones) {
      const caso = `${p.nombre}: ${z.texto.replace(/\.$/, "")}`;
      if ((z.clave === "vigencia" || z.clave === "estado") && z.nivel === "rojo") r.vencido.push(caso);
      else if (z.clave === "vigencia" && z.nivel === "ambar") r.porVencer.push(caso);
      else if (z.clave === "papeles" && z.nivel === "rojo") r.papelesVencidos.push(caso);
      else if (z.clave === "papeles" && z.nivel === "ambar") r.papelesFaltan.push(caso);
      else if (z.clave === "ficha" && z.nivel === "ambar") r.ficha.push(caso);
    }
  }
  return r;
}
