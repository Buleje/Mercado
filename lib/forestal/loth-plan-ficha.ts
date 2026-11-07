/**
 * La ficha del plan de manejo, al X % (Brandon 24-10, opción B: «Ficha del
 * plan completa»).
 *
 * Medido en Blas (24-10-2026): de 4 planes, uno tiene la resolución «ERERER» y
 * 0 especies, otro el regente «-», ninguno el RUC o DNI del titular y uno casi
 * nada. Los «esenciales» del formulario (`loth-plan-esenciales`) miran si hay
 * texto; esta ficha mira si el plan dice LO QUE LA NORMA ESPERA que diga, y
 * cuenta el relleno (`loth-plan-relleno`) como faltante.
 *
 * Cada requisito dice de dónde sale. No se inventa ninguno: son los campos que
 * el sistema ya guarda y que aparecen en las normas que el código ya cita
 * (`loth-tipos-plan.ts`) o en un casillero de la GTF (`ctp-gtf-formato.ts`).
 *
 * Qué entra según el tipo (`TIPOS_PLAN_META`):
 *   · título habilitante: todos menos la plantación (que no lo tiene);
 *   · vigencia: todos menos la plantación (puede no tener período, ADR-459);
 *   · regente + N° de registro: sólo donde la norma lo pide (PGMF, PO, PMFI);
 *     en un DEMA es «según el caso» y no se cuenta; la plantación tiene un
 *     encargado, no un regente.
 *
 * PURO: lo usan la cabecera del plan, la barra de pasos del alta y el semáforo.
 */
import { metaDe, rotulosDe, esTipoPlantacion } from "./loth-tipos-plan";
import { motivoDeRelleno, type TipoCampoRelleno } from "./loth-plan-relleno";
import type { PasoPlan } from "./loth-plan-pasos";

export type RequisitoFicha =
  | "tituloHabilitante"
  | "resolucion"
  | "vigencia"
  | "titular"
  | "area"
  | "ubicacion"
  | "regente"
  | "especies";

export interface ItemFicha {
  id: RequisitoFicha;
  /** Cómo se llama en ESTE tipo de documento («N° de constancia» en una plantación). */
  rotulo: string;
  lleno: boolean;
  /** Qué falta, en una frase corta; `null` si está completo. */
  falta: string | null;
  /** El paso del alta donde se escribe; `null` si no vive en el formulario (las especies de un plan de bosque). */
  paso: PasoPlan | null;
  /** De dónde sale el requisito. */
  fuente: string;
}

export interface DatosFicha {
  planType: string;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: string | null;
  vigenciaHasta?: string | null;
  titularName?: string | null;
  /** RUC o DNI del titular: el del permiso (`ForestContrato.titularDoc`) o el del propietario. */
  titularDoc?: string | null;
  areaHa?: string | number | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  regenteName?: string | null;
  regenteRegistro?: string | null;
  /**
   * Especies con volumen autorizado (o registrado) mayor que cero. `null` = acá
   * no se sabe y no se cuenta: el alta de un plan de bosque no pide especies
   * (salen del censo después), así que la ficha del alta no puede exigirlas.
   */
  especiesConVolumen: number | null;
}

export interface FichaDelPlan {
  items: ItemFicha[];
  llenos: number;
  total: number;
  /** Entero de 0 a 100. */
  pct: number;
  faltan: ItemFicha[];
}

/** Hay dato y no es relleno. */
function dato(v: string | null | undefined, tipo: TipoCampoRelleno): boolean {
  const t = (v ?? "").trim();
  return t.length > 0 && motivoDeRelleno(t, tipo) === null;
}

/** «a y b», «a, b y c». */
function unir(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Quita lo vacío; si queda algo, «Falta X». */
function faltaDe(faltantes: (string | false)[]): string | null {
  const f = faltantes.filter((x): x is string => typeof x === "string");
  return f.length === 0 ? null : `Falta ${unir(f)}`;
}

const FUENTE_GTF = "la GTF lo imprime";

export function fichaDelPlan(d: DatosFicha): FichaDelPlan {
  const meta = metaDe(d.planType);
  const rot = rotulosDe(d.planType);
  const plantacion = esTipoPlantacion(d.planType);
  const items: ItemFicha[] = [];

  if (!plantacion) {
    const ok = dato(d.tituloHabilitante, "codigo");
    items.push({
      id: "tituloHabilitante",
      rotulo: "Título habilitante",
      lleno: ok,
      falta: ok ? null : "Falta el código del título habilitante",
      paso: "documento",
      fuente: `El ${meta.sigla} se aprueba para un título habilitante (D.S. 018-2015-MINAGRI); ${FUENTE_GTF} en el casillero 6.`,
    });
  }

  {
    const n = dato(d.resolucionNumber, "numero");
    const f = Boolean((d.resolucionDate ?? "").trim());
    items.push({
      id: "resolucion",
      rotulo: `${rot.resolucion} y ${rot.fechaResolucion.toLowerCase()}`,
      lleno: n && f,
      falta: faltaDe([!n && `el ${rot.resolucion.toLowerCase()}`, !f && `la ${rot.fechaResolucion.toLowerCase()}`]),
      paso: "documento",
      fuente: plantacion
        ? "La constancia de inscripción en el Registro Nacional de Plantaciones (D.S. 020-2015-MINAGRI y Lineamientos RNPF-SERFOR)."
        : `La resolución que aprueba el ${meta.sigla}: de ahí parte la supervisión (RJ N° 001-2018-OSINFOR); ${FUENTE_GTF} en el casillero 8.`,
    });
  }

  if (!rot.vigenciaOpcional) {
    const ok = Boolean((d.vigenciaHasta ?? "").trim());
    items.push({
      id: "vigencia",
      rotulo: "Vigencia hasta",
      lleno: ok,
      falta: ok ? null : "Falta la fecha de vencimiento",
      paso: "area",
      fuente: `La resolución aprueba el ${meta.sigla} por un período (D.S. 018-2015-MINAGRI); sin la fecha no hay aviso de vencimiento ni plazo del informe de ejecución.`,
    });
  }

  {
    const nom = dato(d.titularName, "nombre");
    const doc = dato(d.titularDoc, "numero");
    items.push({
      id: "titular",
      rotulo: "Titular y su RUC o DNI",
      lleno: nom && doc,
      falta: faltaDe([!nom && "el nombre del titular", !doc && "su RUC o DNI"]),
      paso: "titular",
      fuente: `El título está a nombre del titular, que firma el informe de ejecución con el regente (RJ N° 001-2018-OSINFOR); ${FUENTE_GTF} en los casilleros 7 y 13 a 15.`,
    });
  }

  {
    const ha = Number(String(d.areaHa ?? "").replace(",", "."));
    const ok = Number.isFinite(ha) && ha > 0;
    items.push({
      id: "area",
      rotulo: rot.area,
      lleno: ok,
      falta: ok ? null : `Falta ${plantacion ? "la superficie" : "el área"} en hectáreas`,
      paso: "area",
      fuente: plantacion
        ? "La superficie de la plantación, del registro (Lineamientos RNPF-SERFOR)."
        : `El área de manejo que aprueba la resolución del ${meta.sigla} (D.S. 018-2015-MINAGRI).`,
    });
  }

  {
    const r = dato(d.region, "texto");
    const p = dato(d.provincia, "texto");
    const di = dato(d.distrito, "texto");
    items.push({
      id: "ubicacion",
      rotulo: "Región, provincia y distrito",
      lleno: r && p && di,
      falta: faltaDe([!r && "la región", !p && "la provincia", !di && "el distrito"]),
      paso: "area",
      fuente: `La ubicación política del expediente (ADR-426); ${FUENTE_GTF} en los casilleros 10 a 12.`,
    });
  }

  if (meta.regente === "obligatorio") {
    const nom = dato(d.regenteName, "nombre");
    const reg = dato(d.regenteRegistro, "numero");
    items.push({
      id: "regente",
      rotulo: "Regente y su N° de registro",
      lleno: nom && reg,
      falta: faltaDe([!nom && "el regente", !reg && "su N° de registro"]),
      paso: "titular",
      fuente: `La norma pide un regente para un ${meta.sigla}, inscrito en el Registro Nacional de Regentes de SERFOR; firma el plan y el informe de ejecución (RJ N° 001-2018-OSINFOR).`,
    });
  }

  if (d.especiesConVolumen != null) {
    const ok = d.especiesConVolumen > 0;
    items.push({
      id: "especies",
      rotulo: plantacion ? "Especies y m³ registrados" : "Especies y volumen autorizado",
      lleno: ok,
      falta: ok ? null : `Falta al menos una especie con su volumen ${rot.base}`,
      // En una plantación las especies son un paso del alta; en un plan de bosque, salen del censo.
      paso: plantacion ? "especies" : null,
      fuente: plantacion
        ? "Las especies y sus m³ del registro de la plantación: la base del saldo (ADR-459)."
        : `El volumen por especie que aprueba el ${meta.sigla}: la tala y el despacho descuentan de ahí.`,
    });
  }

  const faltan = items.filter((i) => !i.lleno);
  const total = items.length;
  const llenos = total - faltan.length;
  return { items, llenos, total, pct: total === 0 ? 100 : Math.round((llenos / total) * 100), faltan };
}

/** «Ficha al 63 %» · «Ficha completa». */
export function textoFicha(f: Pick<FichaDelPlan, "pct" | "faltan">): string {
  return f.faltan.length === 0 ? "Ficha completa" : `Ficha al ${f.pct} %`;
}
