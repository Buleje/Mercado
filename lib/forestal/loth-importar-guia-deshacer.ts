/**
 * «Deshacer la importación» de una guía del Libro TH (ADR-461 §12, 02-10-2026).
 *
 * Anular una guía del TH cuya madera ya está en el Libro CTP se frena con 409
 * (`guia_ya_en_el_ctp`): la guía la EMITIÓ el TH y el ingreso del CTP cuelga de
 * ella. Una guía IMPORTADA es al revés: el ingreso del CTP existía antes, vino
 * de SERFOR, y el TH sólo la copió. Deshacer la copia no deja al CTP sin origen.
 * Por eso tiene su propio camino —que NO afloja el 409 de las guías normales— y
 * deshace exactamente lo que esa importación asentó:
 *
 *  - la guía y sus despachos;
 *  - los trozados que creó ESA importación (su observación es la del importador
 *    con ese N° y ese registro; los que ya estaban antes quedan);
 *  - sus talas referenciales: si sólo esta guía la sostenía, se anula; si otra
 *    guía también la amplió, se REDUCE a lo que aportan las trozas que siguen
 *    vivas (la misma regla del importador, `medidasDeTala`) — así T4 sigue
 *    cerrando exacto y nadie tiene que acordarse de corregirla a mano;
 *  - el permiso, si lo creó una importación y queda sin nada.
 *
 * Una tala medida en campo nunca se toca. PURO y client-safe: la pantalla usa
 * `importacionDeLaGuia` para saber dónde mostrar el botón.
 */

import { mismoNumeroGtf } from "./gtf-talonario";
import {
  medidasDeTala,
  observacionGuia,
  observacionTala,
  observacionTrozado,
  type MarcaReferencial,
  type PiezaDeTala,
} from "./loth-importar-guia";

const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/**
 * ¿La guía la asentó una importación? Se lee la observación que escribe el
 * importador (`observacionGuia`) y se vuelve a armar: sólo cuenta si coincide
 * letra por letra. Devuelve el N° de registro que cita (o `null`).
 */
export function importacionDeLaGuia(
  observations: string | null | undefined,
): { registro: string | null; verificada: boolean } | null {
  const obs = txt(observations);
  if (!obs.startsWith("Importada al Libro TH desde ") || !obs.endsWith("(ADR-461).")) return null;
  const registro = /registro SERFOR (\S+?)(?:,| \(ADR-461\)\.$)/.exec(obs)?.[1] ?? "";
  for (const verificada of [true, false]) {
    if (observacionGuia(registro, verificada) === obs) return { registro: registro || null, verificada };
  }
  return null;
}

/** ¿Este trozado lo creó la importación de esta guía? (la observación exacta del importador) */
export function esTrozadoDeLaImportacion(
  observations: string | null | undefined,
  gtfNumber: string,
  registro: string | null,
): boolean {
  const obs = txt(observations);
  if (!obs) return false;
  const r = registro ?? "";
  return obs === observacionTrozado({ sinCodigo: false }, gtfNumber, r) || obs === observacionTrozado({ sinCodigo: true }, gtfNumber, r);
}

/** ¿El plan lo creó una importación (cualquiera)? Su nota es la de `notaPlanImportado`. */
export function esPlanDeImportacion(notes: string | null | undefined): boolean {
  const n = txt(notes);
  return /^Creado al importar la GTF \S+( \(registro SERFOR \S+\))? \(ADR-461\)\.$/.test(n);
}

/** Lo que se hace con una tala del árbol al deshacer la guía. */
export type AccionSobreTala =
  | { accion: "dejar" }
  | { accion: "anular" }
  | {
      accion: "reducir";
      medidas: ReturnType<typeof medidasDeTala>;
      marca: MarcaReferencial;
      observacion: string;
      otrasGuias: string[];
    };

/**
 * La tala de un árbol frente a la guía que se deshace. `restantes` = las trozas
 * VIVAS del árbol en el plan que quedan después de deshacer (sin las que se
 * anulan). Una tala medida en campo, o que no cita esta guía, se deja.
 */
export function accionSobreTala(
  referencial: { gtfs: string[]; registros: string[]; trozas: string[] } | null,
  gtfNumber: string,
  registro: string | null,
  restantes: readonly PiezaDeTala[],
): AccionSobreTala {
  if (!referencial) return { accion: "dejar" };
  if (!referencial.gtfs.some((g) => mismoNumeroGtf(g, gtfNumber))) return { accion: "dejar" };
  const otras = [...new Set(referencial.gtfs.filter((g) => !mismoNumeroGtf(g, gtfNumber)).map(txt).filter(Boolean))];
  if (otras.length === 0 || restantes.length === 0) return { accion: "anular" };
  const medidas = medidasDeTala(restantes);
  const trozas = restantes.map((p) => p.code).filter(Boolean);
  const registros = [...new Set(referencial.registros.filter((r) => r && r !== registro))];
  return {
    accion: "reducir",
    medidas,
    marca: {
      forma: "promedio",
      mayor: [],
      menor: [],
      totalM: medidas.lengthM,
      descuentos: [],
      referencial: { gtfs: otras, registros, trozas },
    },
    observacion: observacionTala(otras, trozas),
    otrasGuias: otras,
  };
}

/** Lo que cuelga del plan DESPUÉS de deshacer (sin lo que se anula). */
export interface ConteosDelPlan {
  lineasVivas: number;
  guiasVigentes: number;
  especies: number;
  censo: number;
  permisos: number;
}

/**
 * ¿Se da de baja el plan? Sólo si lo creó una importación y no le queda nada:
 * ni líneas vivas, ni guías vigentes, ni especies, ni censo, ni permisos. Lo
 * que alguien le cargó después (las especies autorizadas, el censo) es trabajo
 * de una persona: el plan queda y se dice por qué.
 */
export function bajaDelPlan(
  plan: { notes: string | null; deletedAt: Date | string | null },
  c: ConteosDelPlan,
): { baja: boolean; motivo: string } {
  if (plan.deletedAt) return { baja: false, motivo: "El permiso ya estaba dado de baja." };
  if (!esPlanDeImportacion(plan.notes)) return { baja: false, motivo: "El permiso no lo creó una importación: queda." };
  const queda = [
    c.lineasVivas > 0 && `${c.lineasVivas} línea(s) vivas en el libro`,
    c.guiasVigentes > 0 && `${c.guiasVigentes} guía(s) vigentes`,
    c.especies > 0 && `${c.especies} especie(s) cargadas`,
    c.censo > 0 && `${c.censo} árbol(es) del censo`,
    c.permisos > 0 && `${c.permisos} permiso(s) atados`,
  ].filter((x): x is string => typeof x === "string");
  if (queda.length) return { baja: false, motivo: `El permiso lo creó una importación pero queda: tiene ${queda.join(", ")}.` };
  return { baja: true, motivo: "Lo creó la importación y queda vacío: se da de baja." };
}
