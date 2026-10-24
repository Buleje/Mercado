/**
 * guias-sin-registrar-pantalla — lo que la pantalla «Guías sin registrar»
 * (ADR-446) dice de cada guía, sin React: textos, qué guía va primero y cómo
 * viajan las elecciones de origen al servidor.
 *
 * La pantalla no calcula ningún m³: todos salen de la propuesta del servidor
 * (`proponerTanda`). Acá sólo se decide CÓMO se lee.
 */
import type {
  BloqueoDeGuia,
  CandidataDeOrigen,
  EleccionDeOrigen,
  GrupoPropuesto,
  LineaPropuesta,
  PropuestaDeGuia,
} from "@/lib/forestal/anexo-a-despacho";
import type { ResultadoGuia } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { TOLERANCIA_ATRIBUCION } from "@/lib/forestal/atribucion-despacho";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import { formatNumber } from "@/lib/format";

/** Menos de un litro sin origen es redondeo del anexo (el servidor lo trata igual): no se pinta de rojo. */
export const haySinOrigen = (m3: number): boolean => m3 >= TOLERANCIA_ATRIBUCION;

/** Piezas con separador de miles, como el resto del panel. */
export const fmtEntero = (n: number): string => formatNumber(Math.round(n));

/** Lo que el operador cambió: por anexo, por grupo (`clave`). Un grupo ausente = la propuesta. */
export type EleccionesPorGuia = Readonly<Record<string, Readonly<Record<string, EleccionDeOrigen>>>>;

/** Valores del selector de origen que no son una corrida. */
export const PROPUESTA = "__propuesta";
export const SIN_ORIGEN = "__sin-origen";

/** Las elecciones de una guía como las pide el POST; `undefined` = la propuesta tal cual. */
export function eleccionesParaApi(porGrupo: Readonly<Record<string, EleccionDeOrigen>> | undefined): EleccionDeOrigen[] | undefined {
  const lista = Object.values(porGrupo ?? {});
  return lista.length > 0 ? lista : undefined;
}

/** Qué muestra el selector de un grupo: la propuesta, «sin origen» o la corrida elegida. */
export function valorDelSelector(elegida: EleccionDeOrigen | undefined): string {
  if (!elegida) return PROPUESTA;
  return elegida.corridas[0] ?? SIN_ORIGEN;
}

/** Resultados que cierran la guía: ya está en Despacho, o su número ya lo está sin venir de acá. */
const TERMINALES = new Set<ResultadoGuia["estado"]>(["registrada", "ya_registrada", "ya_existe"]);
export const resultadoTerminal = (r: ResultadoGuia | undefined): boolean => r != null && TERMINALES.has(r.estado);
/**
 * Un error NO cierra la guía: puede ser pasajero (medido 28-09: «otra tanda
 * está en curso» mientras otra pestaña registraba). Se reintenta a mano o con
 * la próxima fila; mientras tanto no frena a las que siguen.
 */
export const fallo = (r: ResultadoGuia | undefined): boolean => r?.estado === "error";

/**
 * La guía que se puede registrar AHORA. La propuesta de cada guía cuenta con que
 * las anteriores ya salieron (la más vieja primero); registrar una del medio
 * antes que las de arriba sacaría de otras corridas que las que se ven.
 */
export function siguienteEnFila(
  guias: readonly Pick<PropuestaDeGuia, "anexoId" | "registrable">[],
  resultados: Readonly<Record<string, ResultadoGuia>>,
): string | null {
  return guias.find((g) => g.registrable && !resultadoTerminal(resultados[g.anexoId]) && !fallo(resultados[g.anexoId]))?.anexoId ?? null;
}

/** Las que «Registrar las listas» va a mandar, en orden (las que fallaron, otra vez). */
export const listasEnFila = (
  guias: readonly Pick<PropuestaDeGuia, "anexoId" | "registrable">[],
  resultados: Readonly<Record<string, ResultadoGuia>>,
): string[] => guias.filter((g) => g.registrable && !resultadoTerminal(resultados[g.anexoId])).map((g) => g.anexoId);

const anioDe = (iso: string) => iso.slice(0, 4);
/** «01/08» si es del año de la guía; «19/10/2025» si no (la N° 20 de Blas está fechada en 2025). */
export function fechaDeCorrida(fecha: string, fechaGuia: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  if (!a || !m || !d) return fecha;
  return anioDe(fecha) === anioDe(fechaGuia) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/** «jueves 07/08» — la fecha de la guía como se habla en el patio. */
export const fechaDeGuia = (fecha: string): string => diaConNombre(fecha);

export const ptDeGuia = (p: Pick<PropuestaDeGuia, "grupos">): number => p.grupos.reduce((a, g) => a + g.pt, 0);
export const piezasDeGuia = (p: Pick<PropuestaDeGuia, "grupos">): number => p.grupos.reduce((a, g) => a + g.piezas, 0);

/** Una corrida en el selector: número, fecha, lo que le queda de ese tipo y sus marcas. */
export function etiquetaCandidata(c: CandidataDeOrigen, fechaGuia: string): string {
  const marcas = [c.usado ? "marcada «usado»" : "", c.sinOrigen ? "sin trozas de origen" : ""].filter(Boolean);
  return [`N° ${c.lineNo}`, fechaDeCorrida(c.fecha, fechaGuia), `${fmtM3(c.disponibleM3)} m³`, ...marcas].join(" · ");
}

/** «Propuesta: N° 20, 21 y 3 más» — las corridas de las que sale hoy el grupo. */
export function etiquetaPropuesta(g: Pick<GrupoPropuesto, "corridas" | "candidatas" | "sinAtribuirM3" | "m3">): string {
  if (g.corridas.length === 0) return "Propuesta: sin origen";
  const nums = g.corridas.map((id) => g.candidatas.find((c) => c.corridaId === id)?.lineNo).filter((n): n is number => n != null);
  const vistos = nums.slice(0, 2).map((n) => `N° ${n}`).join(", ");
  const resto = g.corridas.length - Math.min(2, nums.length);
  return `Propuesta: ${vistos || "corrida"}${resto > 0 ? ` y ${resto} más` : ""}`;
}

const CLASE = { monton: "montón", paquete: "paquete", corrida: "de la corrida" } as const;

/** Una línea de salida con su origen: «N° 19 · 01/08 · montón 72 · 3,002 m³ · se parte: quedan 0,261». */
export function textoDeLinea(l: LineaPropuesta, fechaGuia: string): string {
  if (!l.origen) return `Sin origen · ${fmtM3(l.m3)} m³ · ${fmtEntero(l.piezas)} pzas`;
  const o = l.origen;
  const fuente = o.clase === "corrida" ? CLASE.corrida : `${CLASE[o.clase]} ${o.codigo ?? ""}`.trim();
  const partes = [`N° ${o.lineNo}`, fechaDeCorrida(o.fecha, fechaGuia), fuente, `${fmtM3(l.origenM3)} m³`, `${fmtEntero(l.piezas)} pzas`];
  if (o.restoM3 > 0) partes.push(`se parte: quedan ${fmtM3(o.restoM3)} m³`);
  return partes.join(" · ");
}

/** «25/09/2026» — la fecha tope de una producción que falta anotar. */
const fechaLarga = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Los fallos que se arreglan solos esperando unos segundos (otra pestaña, otra operación del libro). */
export const CODIGOS_PASAJEROS: ReadonlySet<string> = new Set(["TANDA_EN_CURSO", "LIBRO_OCUPADO"]);

/** Un código del libro dicho como lo entiende el patio; si no se conoce, el mensaje del servidor. */
export function mensajeDeCodigo(codigo: string | null | undefined, delServidor: string): string {
  switch (codigo) {
    case "TANDA_EN_CURSO":
      return "Otra guía se está registrando: intenta en unos segundos.";
    case "LIBRO_OCUPADO":
      return "El libro está ocupado con otra operación: intenta en unos segundos.";
    case "ANEXO_REGISTRADO":
      return "Ese anexo ya tiene su salida en el libro: no se edita ni se borra.";
    default:
      return delServidor;
  }
}

/** «3 min 20 s», «45 s». */
export function esperaLegible(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  const min = Math.floor(s / 60);
  const resto = s % 60;
  if (min === 0) return `${resto} s`;
  return resto === 0 ? `${min} min` : `${min} min ${resto} s`;
}

export type AccionDeBloqueo =
  | { tipo: "anotar"; especie: string; fechaTope: string | null }
  | { tipo: "propuesta"; especie: string; tipoPieza: string }
  | null;

/** Por qué no se registra, en UNA línea, y qué se puede hacer. El mensaje entero del servidor va al ⓘ. */
export function resumenDeBloqueo(b: BloqueoDeGuia): { texto: string; accion: AccionDeBloqueo } {
  const especie = b.especie ?? "esa especie";
  switch (b.codigo) {
    case "SIN_STOCK_DE_LA_ESPECIE": {
      /* Con fecha posterior a la guía la producción entra, pero esa madera
         queda sin origen: la fecha tope va en la misma línea. */
      const tope = b.fechaTope ? ` Anótala con fecha hasta el ${fechaLarga(b.fechaTope)}.` : "";
      return {
        texto:
          ((b.stockM3 ?? 0) > 0
            ? `Falta producción de ${especie}: lleva ${fmtM3(b.m3 ?? 0)} m³ y quedan ${fmtM3(b.stockM3 ?? 0)} m³.`
            : `Falta la producción de ${especie}: ${fmtM3(b.m3 ?? 0)} m³ en ${fmtEntero(b.piezas ?? 0)} piezas.`) + tope,
        accion: { tipo: "anotar", especie, fechaTope: b.fechaTope ? fechaLarga(b.fechaTope) : null },
      };
    }
    case "TIPO_SIN_PRODUCTO":
      return { texto: `${especie}: ${b.piezas ?? 0} piezas «${b.tipo ?? ""}» sin producto en el libro.`, accion: null };
    case "SIN_ESPECIE":
      return { texto: `El anexo tiene ${fmtM3(b.m3 ?? 0)} m³ sin especie.`, accion: null };
    case "ORIGEN_INVALIDO":
      return { texto: b.mensaje, accion: { tipo: "propuesta", especie, tipoPieza: b.tipo ?? "" } };
    default:
      return { texto: b.mensaje, accion: null };
  }
}

export type TonoEstado = "ok" | "error" | "aviso" | "neutro";

/** La pastilla de estado de una guía. */
export function estadoDeGuia(p: Pick<PropuestaDeGuia, "registrable">, r: ResultadoGuia | undefined): { texto: string; tono: TonoEstado } {
  if (r?.estado === "registrada") return { texto: "Registrada", tono: "ok" };
  if (r?.estado === "ya_registrada") return { texto: "Ya estaba", tono: "ok" };
  if (r?.estado === "ya_existe") return { texto: "Ya en Despacho", tono: "aviso" };
  if (r?.estado === "error") return { texto: "No se registró", tono: "error" };
  return p.registrable ? { texto: "Lista", tono: "ok" } : { texto: "Bloqueada", tono: "error" };
}

const rango = (ns: readonly number[]) => {
  if (ns.length === 0) return "";
  const min = Math.min(...ns);
  const max = Math.max(...ns);
  return min === max ? `N° ${min}` : `N° ${min} ${max === min + 1 ? "y" : "a"} ${max}`;
};

/** Lo que pasó al registrar, en una línea. */
export function textoDeResultado(r: ResultadoGuia): string {
  switch (r.estado) {
    case "registrada": {
      const partes = [
        `${r.despachos.length} ${r.despachos.length === 1 ? "línea" : "líneas"} en Despacho (${rango(r.despachos.map((d) => d.lineNo))})`,
        `${fmtM3(r.atribuidoM3)} m³ con origen`,
      ];
      if (r.sinAtribuirM3 > 0) partes.push(`${fmtM3(r.sinAtribuirM3)} m³ sin origen`);
      const partidos = r.partidos.filter((p) => p.resto).length;
      if (partidos > 0) partes.push(`${partidos} ${partidos === 1 ? "montón partido" : "montones partidos"}`);
      return partes.join(" · ");
    }
    case "ya_registrada":
      return `Ya estaba en Despacho (${rango(r.despachos.map((d) => d.lineNo))}).`;
    case "error":
      return mensajeDeCodigo(r.codigo, r.mensaje);
    default:
      return r.mensaje;
  }
}
