/**
 * Lo puro de «Importar guías despachadas» (ADR-461): leer los N° de registro
 * pegados, agrupar la vista previa por permiso, la decisión inicial de cada
 * grupo, el estado con o sin tala y el orden de importación. Lo usan el hook
 * (`use-importar-guias`) y las partes del modal; los tests, sin montar nada.
 */

import { esNumeroRegistroValido, normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";
import type {
  EstadoVistaPrevia,
  GuiaVistaPrevia,
  PermisoDetectado,
  PlanDestino,
  PlanNuevoPropuesto,
  RespuestaImportar,
  ResultadoImportarGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";

export type PestanaFuente = "recibidas" | "registro" | "foto";
export type FaseImportar = "elegir" | "vista" | "resultado";

/** Forma de un N° de GTF impreso (`019-001-0000004`, `019-0000001`): NO es un registro. */
const FORMA_GTF = /^\d{3}(-\d{3})?-\d{7}$/;

/**
 * Los N° de registro de lo pegado: uno por línea, o separados por coma, punto y
 * coma o espacios. Los rótulos («N° REGISTRO:») se ignoran; el número va tal
 * cual, con sus guiones (SERFOR no lo encuentra sin ellos).
 */
export function registrosDelTexto(texto: string): {
  validos: string[];
  invalidos: string[];
  gtf: string[];
} {
  const validos: string[] = [];
  const invalidos: string[] = [];
  const gtf: string[] = [];
  const vistos = new Set<string>();
  for (const crudo of texto.split(/[\s,;]+/)) {
    const t = crudo.replace(/^[^\d]+|[^\d]+$/g, "");
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    if (FORMA_GTF.test(t)) gtf.push(t);
    else if (esNumeroRegistroValido(t)) validos.push(normalizarNumeroRegistro(t));
    else invalidos.push(crudo.trim());
  }
  return { validos, invalidos, gtf };
}

/** El código de un título para comparar: mayúsculas y sin espacios. */
const claveTitulo = (t: string | null | undefined) => (t ?? "").toUpperCase().replace(/\s+/g, "");

/** Las guías de la vista previa con el mismo permiso: UNA decisión de permiso por grupo. */
export interface GrupoVista {
  clave: string;
  titulo: string | null;
  permiso: PermisoDetectado | null;
  guias: GuiaVistaPrevia[];
}

export function claveDeGrupo(g: GuiaVistaPrevia): string {
  if (!g.permiso) return "sin-permiso";
  if (g.permiso.estado === "existente") return `plan:${g.permiso.plan.planId}`;
  return `titulo:${claveTitulo(g.guia?.numeroTitulo)}`;
}

/** Agrupa por permiso en el orden en que llegaron; lo que no tiene permiso, al final. */
export function agruparPorPermiso(guias: readonly GuiaVistaPrevia[]): GrupoVista[] {
  const grupos = new Map<string, GrupoVista>();
  for (const g of guias) {
    const clave = claveDeGrupo(g);
    const grupo = grupos.get(clave) ?? {
      clave,
      titulo: g.guia?.numeroTitulo ?? null,
      permiso: g.permiso,
      guias: [],
    };
    grupo.guias.push(g);
    grupos.set(clave, grupo);
  }
  const lista = [...grupos.values()];
  return [
    ...lista.filter((x) => x.clave !== "sin-permiso"),
    ...lista.filter((x) => x.clave === "sin-permiso"),
  ];
}

/** El estado con el interruptor de la tala como está: apagado, cuenta el de «sin tala». */
export const estadoEfectivo = (g: GuiaVistaPrevia, crearTala: boolean): EstadoVistaPrevia =>
  crearTala ? g.estado : (g.estadoSinTala ?? g.estado);

/** ¿La guía se puede importar (con el permiso decidido)? */
export const esImportable = (g: GuiaVistaPrevia, crearTala = true) => {
  const e = estadoEfectivo(g, crearTala);
  return e === "lista" || e === "elegir_permiso";
};

/** Por fecha y N° de guía, como las revisa y las importa el servidor (`ordenDeImportacion`). */
export function enOrdenDeImportacion<T extends { fecha: string | null; gtfNumber: string | null }>(
  xs: readonly T[],
): T[] {
  return [...xs].sort(
    (a, b) =>
      (a.fecha ?? "9999-99-99").localeCompare(b.fecha ?? "9999-99-99") ||
      (a.gtfNumber ?? "").localeCompare(b.gtfNumber ?? "", "es", { numeric: true }),
  );
}

/** Los conteos del resultado, de lo que ya volvió. */
export function respuestaDe(resultados: ResultadoImportarGuia[]): RespuestaImportar {
  return {
    resultados,
    importadas: resultados.filter((r) => r.estado === "importada").length,
    yaEstaban: resultados.filter((r) => r.estado === "ya_estaba").length,
    rechazadas: resultados.filter((r) => r.estado === "rechazada").length,
  };
}

/** Lo que el grupo decide: a qué plan va y si se arma la tala referencial. */
export interface DecisionGrupo {
  destino: PlanDestino | null;
  crearTala: boolean;
  /** La persona tocó el interruptor: cambiar el tipo de plan ya no lo mueve. */
  talaTocada: boolean;
}

export function decisionInicial(grupo: GrupoVista): DecisionGrupo {
  const p = grupo.permiso;
  const destino: PlanDestino | null =
    p?.estado === "existente"
      ? { tipo: "existente", planId: p.plan.planId }
      : p?.estado === "nuevo"
        ? { tipo: "nuevo", plan: p.propuesta }
        : null;
  const base = grupo.guias.find((g) => esImportable(g)) ?? grupo.guias[0];
  return { destino, crearTala: base?.crearTalaPorDefecto ?? false, talaTocada: false };
}

/** Un plan nuevo necesita titular y código para crearse. */
export function planNuevoCompleto(p: PlanNuevoPropuesto): boolean {
  const codigo = p.planType === "PLANTACION" ? p.planNumber : p.tituloHabilitante;
  return Boolean(p.titularName.trim() && codigo?.trim());
}
