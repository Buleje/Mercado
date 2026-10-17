/**
 * loth-import-plan — contra QUÉ permiso se importa un cuadro de líneas, y qué
 * pasaría con su saldo (ADR-459, ronda 2).
 *
 * Antes el importador no mandaba `planId`: cada línea entraba sin plan, así que
 * (1) T6 y T7 no la revisaban —ambos corren sólo con plan— y (2) contaba en el
 * saldo de TODOS los planes a la vez (`balanceExtraccion` suma plan + sin plan).
 *
 * Acá vive lo que la vista previa necesita para decirlo ANTES de asentar:
 *  - el rótulo del plan (para elegirlo);
 *  - el aviso por fila (la especie no está en el registro → T7 la frenará);
 *  - el saldo que dejaría la importación por especie.
 *
 * La especie se reconoce con `especieEnRegistro` / `resolverEspecie`, la MISMA
 * regla que T7, T6 y el saldo del servidor. PURO y client-safe.
 */

import { claveEspecie, resolverEspecie, type LothSection } from "./loth-constants";
import type { FilaImport } from "./loth-import-lineas";
import { esPlanDePlantacion } from "./loth-poa";

/** Un plan vivo del negocio, tal como lo lista `GET /api/admin/forestal/plan`. */
export interface PlanImportOpcion {
  id: string;
  planType: string;
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string;
  isActive: boolean;
}

/** Una especie del plan con lo que ya se taló de ella (del balance del servidor). */
export interface EspecieDelPlanImport {
  speciesCommon: string;
  speciesScientific?: string | null;
  /** Autorizado (bosque) o registrado (plantación), en m³. */
  volumenAutorizadoM3: number;
  /** Ya talado en el libro para ese plan (más las líneas sin plan: cuentan en todos). */
  taladoM3: number;
}

/** El plan elegido, con lo necesario para juzgar las filas. */
export interface PlanParaImportar {
  id: string;
  esPlantacion: boolean;
  rotulo: string;
  especies: readonly EspecieDelPlanImport[];
}

/**
 * «Plan PO 12 — Maderera El Aguajal SAC» o, en una plantación,
 * «Plantación REG-PLT-001 — Titular». El número muchas veces ya trae el tipo
 * («PO 12»): pegarle el tipo adelante daba «PO PO 12».
 */
export function rotuloPlanImport(p: PlanImportOpcion): string {
  const numero = (p.planNumber ?? p.tituloHabilitante ?? "").trim();
  const nombre = esPlanDePlantacion(p)
    ? `Plantación${numero ? ` ${numero}` : ""}`
    : (() => {
        const tipo = numero.toLowerCase().startsWith(p.planType.toLowerCase()) ? "" : p.planType;
        return [tipo, numero].filter(Boolean).join(" ") || "Plan sin número";
      })();
  return `${nombre} — ${p.titularName}`;
}

/**
 * El plan que se propone al abrir: el activo si hay UNO claro; si no hay activo,
 * el único que existe. Con varios activos (o varios sin activo) no se adivina:
 * se elige — una línea atada al plan equivocado descuenta del saldo equivocado.
 */
export function planPorDefecto(planes: readonly PlanImportOpcion[]): string | null {
  const activos = planes.filter((p) => p.isActive);
  if (activos.length === 1) return activos[0].id;
  if (activos.length === 0 && planes.length === 1) return planes[0].id;
  return null;
}

export interface AvisoPlan {
  /** `freno`: el servidor la va a rechazar (T7). `aviso`: pasa, pero conviene saberlo. */
  nivel: "freno" | "aviso";
  texto: string;
}

export interface SaldoImportEspecie {
  species: string;
  autorizadoM3: number;
  taladoM3: number;
  importadoM3: number;
  /** autorizado − ya talado − lo que entra. Negativo = se pasa. */
  quedariaM3: number;
  excede: boolean;
}

export interface RevisionContraPlan {
  /** Avisos por número de fila del archivo. */
  avisos: Map<number, AvisoPlan[]>;
  /** Sólo en Tala: lo que dejaría la importación, por especie del registro. */
  saldos: SaldoImportEspecie[];
  /** Filas que el servidor va a rechazar (nivel `freno`) y que siguen tildadas. */
  frenadas: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Revisa las filas contra el plan elegido. Sin plan, o con un plan sin
 * especies cargadas, no se acusa nada: el servidor tampoco puede juzgar (acusar
 * por falta de datos es peor que no avisar).
 */
export function revisarContraPlan(
  filas: readonly FilaImport[],
  section: LothSection,
  plan: PlanParaImportar | null,
  omitidas: ReadonlySet<number> = new Set(),
): RevisionContraPlan {
  const avisos = new Map<number, AvisoPlan[]>();
  const vacio: RevisionContraPlan = { avisos, saldos: [], frenadas: 0 };
  if (!plan || plan.especies.length === 0) return vacio;

  const agregar = (fila: number, a: AvisoPlan) => {
    const lista = avisos.get(fila);
    if (lista) lista.push(a);
    else avisos.set(fila, [a]);
  };

  const importado = new Map<string, number>();
  let frenadas = 0;
  for (const f of filas) {
    if (!f.speciesCommon) continue;
    const dePlan = resolverEspecie(plan.especies, f.speciesCommon, null);
    if (!dePlan) {
      /* Tala de plantación y despacho de PRODUCTO (lleva la especie del archivo):
         T7 los rechaza seguro. En el despacho de troza la especie es la de su
         trozado, así que el archivo sólo avisa. */
      if ((plan.esPlantacion && section === "tala") || section === "despacho_producto") {
        agregar(f.fila, {
          nivel: "freno",
          texto: section === "tala"
            ? `«${f.speciesCommon}» no está en el registro: la tala se frenará (T7)`
            : `«${f.speciesCommon}» no está ${plan.esPlantacion ? "en el registro" : "autorizada en el plan"}: el despacho se frenará (T7)`,
        });
        if (f.estado === "ok" && !omitidas.has(f.fila)) frenadas += 1;
      } else {
        agregar(f.fila, {
          nivel: "aviso",
          texto: plan.esPlantacion
            ? `«${f.speciesCommon}» no está en el registro: su despacho se frenará (T7)`
            : `«${f.speciesCommon}» no figura en el plan de manejo`,
        });
      }
      continue;
    }
    if (section !== "tala" || f.estado !== "ok" || omitidas.has(f.fila) || !f.volumeM3 || f.volumeM3 <= 0) continue;
    const k = claveEspecie(dePlan.speciesCommon);
    const acumulado = r4((importado.get(k) ?? 0) + f.volumeM3);
    importado.set(k, acumulado);
    // La tala se pasa del saldo pero no se frena (T6 corre al despachar): se avisa en la fila donde cruza.
    if (dePlan.taladoM3 + acumulado > dePlan.volumenAutorizadoM3 + 1e-6) {
      agregar(f.fila, {
        nivel: "aviso",
        texto: `con esta fila ${dePlan.speciesCommon} pasa lo ${plan.esPlantacion ? "registrado" : "autorizado"}`,
      });
    }
  }

  const saldos: SaldoImportEspecie[] =
    section === "tala"
      ? plan.especies
          .filter((e) => (importado.get(claveEspecie(e.speciesCommon)) ?? 0) > 0)
          .map((e) => {
            const imp = importado.get(claveEspecie(e.speciesCommon)) ?? 0;
            const quedaria = r4(e.volumenAutorizadoM3 - e.taladoM3 - imp);
            return {
              species: e.speciesCommon,
              autorizadoM3: e.volumenAutorizadoM3,
              taladoM3: e.taladoM3,
              importadoM3: imp,
              quedariaM3: quedaria,
              excede: quedaria < -1e-6,
            };
          })
      : [];

  return { avisos, saldos, frenadas };
}

/**
 * El servidor numera los errores por la posición en lo que se mandó («Fila 3»);
 * el usuario mira el número de fila de SU archivo. Reetiqueta cada uno con la fila
 * del archivo y el código/especie, para que «Fila 2: …» no apunte a otra línea
 * cuando se destildó alguna.
 */
export function reetiquetarErroresImport(
  errores: readonly string[],
  enviadas: readonly Pick<FilaImport, "fila" | "treeCode" | "trozaCode" | "speciesCommon">[],
): string[] {
  return errores.map((e) => {
    const m = /^Fila (\d+): ([\s\S]*)$/.exec(e);
    if (!m) return e;
    const f = enviadas[Number(m[1]) - 1];
    if (!f) return e;
    const quien = [f.trozaCode ?? f.treeCode, f.speciesCommon].filter(Boolean).join(" · ");
    return `Fila ${f.fila}${quien ? ` (${quien})` : ""}: ${m[2]}`;
  });
}

/**
 * Las filas que el servidor va a rechazar seguro (T7: especie fuera del
 * registro en la tala de una plantación). Arrancan SIN tildar: importarlas sólo
 * produce un error previsible. La persona puede volver a tildarlas.
 */
export function filasQueFrenan(
  filas: readonly FilaImport[],
  section: LothSection,
  plan: PlanParaImportar | null,
): Set<number> {
  const { avisos } = revisarContraPlan(filas, section, plan);
  const out = new Set<number>();
  for (const [fila, lista] of avisos) if (lista.some((a) => a.nivel === "freno")) out.add(fila);
  return out;
}
