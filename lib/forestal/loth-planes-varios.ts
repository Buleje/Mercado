/**
 * «Varios» en el Plan de manejo (Brandon 15-10-2026: «la opción de escoger
 * Varios y aparecen recuadros bien hechos, clasificados, de todos, para verlo
 * ampliamente»). Esto es sólo la CLASIFICACIÓN: qué grupos hay, en qué orden y
 * qué plan va en cuál. Las tarjetas las dibuja `LothPlanesVarios`.
 *
 * Tres formas de clasificar, porque cada una contesta otra pregunta:
 *   · estado  → ¿cuál me apura? Vencidos y por vencer arriba (la vigencia es
 *               la de la ficha del permiso: `construirFichaPermiso`, la misma
 *               cuenta de días que la cabecera y «Planes vivos»).
 *   · tipo    → ¿cuántos de bosque y cuántos de plantación? (un registro de
 *               plantación se reconoce también por el código REG-PLT).
 *   · titular → ¿qué tiene cada comunidad? (la clave de `agruparPlanesPorTitular`).
 *
 * Adentro de cada grupo: el que vence antes primero; sin fecha, al final.
 */

import { construirFichaPermiso, type EstadoFicha, type FichaPermiso, type PlanFicha } from "./loth-ficha-permiso";
import { agruparPlanesPorTitular } from "./loth-planes-por-titular";
import { esPlanDePlantacion } from "./loth-poa";
import { TIPOS_PLAN, TIPOS_PLAN_META, permisoConSigla, siglaDePlan, type TipoPlan } from "./loth-tipos-plan";

export type ModoClasificar = "estado" | "tipo" | "titular";

export const MODOS_CLASIFICAR: readonly { value: ModoClasificar; label: string }[] = [
  { value: "estado", label: "Por vigencia" },
  { value: "tipo", label: "Por tipo" },
  { value: "titular", label: "Por titular" },
];

/** Lo mínimo de un plan para clasificarlo y dibujar su tarjeta. */
export interface PlanClasificable extends PlanFicha {
  id: string;
  alias?: string | null;
}

export interface PlanConFicha<P> {
  plan: P;
  ficha: FichaPermiso;
  /** «PO-2026-001», «Plantación 19-SEC/…»: la sigla como la dice la norma. */
  nombre: string;
  tipo: TipoPlan | null;
  /** «Plan Operativo», «Registro de plantación forestal». */
  tipoNombre: string;
  esPlantacion: boolean;
}

export interface GrupoDePlanes<P> {
  clave: string;
  titulo: string;
  /** El estado que pinta el punto del grupo (sólo al clasificar por vigencia). */
  estado: EstadoFicha | null;
  planes: PlanConFicha<P>[];
}

/** Lo que apura primero. */
const ORDEN_ESTADO: readonly EstadoFicha[] = ["vencido", "suspendido", "por_vencer", "vigente", "sin_vigencia", "cerrado"];

const TITULO_ESTADO: Record<EstadoFicha, string> = {
  vencido: "Vencidos",
  suspendido: "Suspendidos",
  por_vencer: "Por vencer",
  vigente: "Vigentes",
  sin_vigencia: "Sin vigencia cargada",
  cerrado: "Cerrados",
};

function tipoDe(p: PlanClasificable): TipoPlan | null {
  if (esPlanDePlantacion(p)) return "PLANTACION";
  const k = (p.planType ?? "").trim().toUpperCase();
  return (TIPOS_PLAN as readonly string[]).includes(k) ? (k as TipoPlan) : null;
}

export function conFicha<P extends PlanClasificable>(p: P, ahora: Date | number = Date.now()): PlanConFicha<P> {
  const tipo = tipoDe(p);
  return {
    plan: p,
    ficha: construirFichaPermiso(null, p, ahora),
    nombre: permisoConSigla(tipo ?? p.planType, p.planNumber) || "Plan sin número",
    tipo,
    tipoNombre: tipo ? TIPOS_PLAN_META[tipo].nombre : siglaDePlan(p.planType) || "Sin tipo",
    esPlantacion: tipo === "PLANTACION",
  };
}

/** El que vence antes primero; sin fecha al final; a igual fecha, por nombre. */
function porVencimiento<P>(a: PlanConFicha<P>, b: PlanConFicha<P>): number {
  const da = a.ficha.diasQuedan;
  const db = b.ficha.diasQuedan;
  if (da != null && db != null && da !== db) return da - db;
  if (da == null && db != null) return 1;
  if (db == null && da != null) return -1;
  return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
}

export function clasificarPlanes<P extends PlanClasificable>(
  planes: readonly P[],
  modo: ModoClasificar,
  ahora: Date | number = Date.now(),
): GrupoDePlanes<P>[] {
  const fichas = planes.map((p) => conFicha(p, ahora));

  if (modo === "titular") {
    const porId = new Map(fichas.map((f) => [f.plan.id, f]));
    return agruparPlanesPorTitular(planes).map((g) => ({
      clave: `titular:${g.clave}`,
      titulo: g.titular,
      estado: null,
      planes: g.planes.map((p) => porId.get(p.id)!).sort(porVencimiento),
    }));
  }

  const grupos = new Map<string, GrupoDePlanes<P>>();
  for (const f of fichas) {
    const clave = modo === "estado" ? f.ficha.estado : f.tipo ?? `otro:${f.tipoNombre}`;
    let g = grupos.get(clave);
    if (!g) {
      g = modo === "estado"
        ? { clave: `estado:${clave}`, titulo: TITULO_ESTADO[f.ficha.estado], estado: f.ficha.estado, planes: [] }
        : { clave: `tipo:${clave}`, titulo: f.tipoNombre, estado: null, planes: [] };
      grupos.set(clave, g);
    }
    g.planes.push(f);
  }
  for (const g of grupos.values()) g.planes.sort(porVencimiento);

  const rango = (clave: string): number => {
    const k = clave.slice(clave.indexOf(":") + 1);
    const i = modo === "estado"
      ? (ORDEN_ESTADO as readonly string[]).indexOf(k)
      : (TIPOS_PLAN as readonly string[]).indexOf(k);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...grupos.values()].sort((a, b) => rango(a.clave) - rango(b.clave) || a.titulo.localeCompare(b.titulo, "es"));
}
