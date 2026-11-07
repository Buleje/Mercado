/**
 * El CONTENIDO del papel de resultado de «Revisar a todos» (Cumplimiento ›
 * Proveedores en OSINFOR y SERFOR): una fila por ficha revisada con su
 * resultado, la resolución de SERFOR y lo que dijo OSINFOR de cada permiso, las
 * fechas de las dos fuentes y el código corto del papel. Puro (sin jsPDF): el
 * dibujo vive en `revision-proveedores-pdf.ts`.
 *
 * Para cobrar la revisión suelta (S/ 49 hasta 30 proveedores, Brandon 04-11):
 * el papel dice qué figura en las listas públicas y a qué fecha; NUNCA si la
 * madera es legal.
 */
import { emitidoEnLima, fechaDelDocumento } from "@/lib/documentos/membrete-pdf";
import { nombreComparable } from "./serfor-infractores";
import {
  ordenarFilas,
  type FilaRevision,
  type NivelRevision,
  type PermisoRevisado,
  type ResumenRevision,
} from "./revision-proveedores";

/** Lo que el papel necesita de la respuesta de «Revisar a todos». */
export interface RevisionParaPapel {
  resumen: ResumenRevision;
  filas: FilaRevision[];
  sinAlerta?: FilaRevision[];
  corteSerfor: string | null;
  revisadoEn: string;
}

export interface ResultadoFila {
  texto: string;
  tono: NivelRevision;
  /** Por qué, en una frase corta (o null si el texto ya lo dice). */
  porque: string | null;
}

export interface FilaPapel {
  n: number;
  nombre: string;
  /** «RUC 20393286238 · Proveedor» / «sin RUC/DNI · solo en el permiso». */
  quien: string;
  resultado: ResultadoFila;
  serfor: string[];
  osinfor: string[];
}

export interface CuentaPapel {
  tono: NivelRevision;
  etiqueta: string;
  cantidad: number;
}

export interface PapelRevision {
  codigo: string;
  /** YYYY-MM-DD (Lima) del día de la revisión. */
  fecha: string;
  filas: FilaPapel[];
  cuentas: CuentaPapel[];
  /** «Registro de Infractores de SERFOR (datos abiertos), lista al 13/10/2026». */
  fuenteSerfor: string;
  /** «Mapa de supervisiones de OSINFOR (lista roja y PAU), consultado el …». */
  fuenteOsinfor: string;
  /** Permisos que OSINFOR no contestó o que no se consultaron: el papel sale «incompleto». */
  pendientesOsinfor: number;
}

const ROLES: Record<string, string> = {
  proveedor: "Proveedor",
  destinatario: "Destinatario",
  transportista: "Transportista",
  cliente: "Cliente",
  establecimiento: "Establecimiento",
};

/** YYYY-MM-DD → «27/02/2023». */
function fechaCorta(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** El día de Lima (YYYY-MM-DD) de un instante. */
function diaLima(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** El mismo rótulo que la pantalla («Sancionado» solo si SERFOR lo dice) + el porqué. */
export function resultadoDe(f: FilaRevision): ResultadoFila {
  const osinfor = f.permisos.map((p) => p.osinfor?.nivel);
  switch (f.nivel) {
    case "rojo":
      return f.certeza === "segura"
        ? { texto: "Sancionado", tono: "rojo", porque: "Figura en el Registro de Infractores de SERFOR" }
        : { texto: "Lista roja OSINFOR", tono: "rojo", porque: "Un permiso suyo está en la lista roja" };
    case "ambar":
      return {
        texto: "Revisar",
        tono: "ambar",
        porque: osinfor.includes("ambar")
          ? "PAU en trámite en OSINFOR"
          : "Su permiso tiene una sanción a nombre de otra persona",
      };
    case "nombre":
      return { texto: "Posible: mismo nombre", tono: "nombre", porque: "Confirmar con su RUC/DNI" };
    case "limpio":
      return { texto: "Sin alertas", tono: "limpio", porque: null };
    default:
      return { texto: "Sin datos", tono: "sin_datos", porque: "Sin RUC/DNI, nombre ni permiso para buscar" };
  }
}

function quienEs(f: FilaRevision): string {
  const doc = f.documento ? `${f.documento.length === 8 ? "DNI" : "RUC"} ${f.documento}` : "sin RUC/DNI";
  const roles = (f.roles ?? []).map((r) => ROLES[r] ?? r);
  const papel = f.parteId ? roles.join(" · ") : "solo en el permiso";
  return papel ? `${doc} · ${papel}` : doc;
}

/** Hasta 3 resoluciones (la más nueva primero) con fecha, órgano y si es por nombre o de otra persona. */
export function lineasSerfor(f: FilaRevision): string[] {
  if (f.sanciones.length === 0) return [f.certeza === "sin_datos" ? "No se pudo buscar" : "No figura"];
  const propio = nombreComparable(f.nombre);
  const lineas = f.sanciones.slice(0, 3).map((s) => {
    const partes = [
      s.resolucion,
      fechaCorta(s.fecha) ?? "sin fecha",
      s.organo,
      s.ambito,
      s.motivo === "nombre" ? "solo por el nombre" : null,
      s.motivo === "permiso_otro" ? `a otra persona: ${s.infractor}` : null,
      s.motivo !== "permiso_otro" && nombreComparable(s.infractor) !== propio ? `figura como ${s.infractor}` : null,
    ];
    return partes.filter(Boolean).join(" · ");
  });
  if (f.sanciones.length > 3) lineas.push(`y ${f.sanciones.length - 3} más`);
  return lineas;
}

/** Lo mismo que la pantalla dice de cada permiso. */
export function textoOsinfor(p: PermisoRevisado): string {
  const o = p.osinfor;
  if (p.sinConsultar) return "no se consultó";
  if (!o) return "OSINFOR no respondió";
  if (o.nivel === "rojo") return `lista roja (${o.enRoja})`;
  if (o.nivel === "ambar") return `PAU en trámite (${o.pauEnTramite})`;
  if (o.nivel === "verde") return "supervisado sin alertas";
  return o.esPlantacion ? "plantación (OSINFOR no la publica)" : "sin supervisión";
}

export function lineasOsinfor(f: FilaRevision): string[] {
  if (f.permisos.length === 0) return ["Sin permisos cargados"];
  return f.permisos.map((p) => `${p.codigo} · ${textoOsinfor(p)}`);
}

/** De cuándo es el dato de OSINFOR: la caché guarda 12 h, así que puede ser de antes del clic. */
export function fuenteOsinforDe(filas: FilaRevision[], revisadoEn: string): string {
  const fechas = filas
    .flatMap((f) => f.permisos.map((p) => p.osinfor?.consultadoEn))
    .filter((x): x is string => typeof x === "string" && Number.isFinite(new Date(x).getTime()))
    .sort();
  const base = "Mapa de supervisiones de OSINFOR (lista roja y PAU)";
  if (filas.every((f) => f.permisos.length === 0)) return `${base}: sin permisos que consultar`;
  if (fechas.length === 0) return `${base}, consultado el ${emitidoEnLima(new Date(revisadoEn))}`;
  const desde = fechas[0] as string;
  const hasta = fechas[fechas.length - 1] as string;
  return diaLima(desde) === diaLima(hasta) && hasta.slice(0, 16) === desde.slice(0, 16)
    ? `${base}, consultado el ${emitidoEnLima(new Date(desde))}`
    : `${base}, consultado entre el ${emitidoEnLima(new Date(desde))} y el ${emitidoEnLima(new Date(hasta))}`;
}

/** FNV-1a de 32 bits → 4 cifras hexadecimales: identifica el papel (no es un sello de seguridad). */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 16).toString(16).toUpperCase().padStart(4, "0");
}

/** «REV-20261104-7F3A»: el día de la revisión + la huella de lo revisado (mismo resultado = mismo código). */
export function codigoDelPapel(filas: FilaRevision[], fecha: string): string {
  const contenido = filas
    .map((f) => [f.clave, f.nivel, f.sanciones.map((s) => s.resolucion).join(","), f.permisos.map((p) => `${p.codigo}:${p.osinfor?.nivel ?? "-"}`).join(",")].join("|"))
    .join("\n");
  return `REV-${fecha.replace(/-/g, "")}-${huella(contenido)}`;
}

/** «REV-20261104-7F3A Revisión de proveedores - Aserradero X - 2026-11-04.pdf» (número primero, como los papeles de Blas). */
export function nombreDelArchivo(p: Pick<PapelRevision, "codigo" | "fecha">, negocio: string): string {
  const limpio = negocio.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${p.codigo} Revisión de proveedores${limpio ? ` - ${limpio}` : ""} - ${p.fecha}.pdf`;
}

const ETIQUETAS: Record<NivelRevision, string> = {
  rojo: "Sancionados o en lista roja",
  ambar: "Revisar (PAU o permiso con sanción a otro)",
  nombre: "Posible: mismo nombre",
  limpio: "Sin alertas",
  sin_datos: "Sin datos para buscar",
};

export function armarPapelRevision(d: RevisionParaPapel): PapelRevision {
  const todas = ordenarFilas([...d.filas, ...(d.sinAlerta ?? [])]);
  const fecha = diaLima(d.revisadoEn);
  const cuenta = (n: NivelRevision) => todas.filter((f) => f.nivel === n).length;
  const corte = fechaCorta(d.corteSerfor);
  return {
    codigo: codigoDelPapel(todas, fecha),
    fecha,
    filas: todas.map((f, i) => ({
      n: i + 1,
      nombre: f.nombre,
      quien: quienEs(f),
      resultado: resultadoDe(f),
      serfor: lineasSerfor(f),
      osinfor: lineasOsinfor(f),
    })),
    cuentas: (["rojo", "ambar", "nombre", "limpio", "sin_datos"] as const).map((tono) => ({
      tono,
      etiqueta: ETIQUETAS[tono],
      cantidad: cuenta(tono),
    })),
    fuenteSerfor: `Registro de Infractores de SERFOR (datos abiertos)${corte ? `, lista al ${corte}` : ", fecha de la lista no publicada"}`,
    fuenteOsinfor: fuenteOsinforDe(todas, d.revisadoEn),
    pendientesOsinfor: d.resumen.osinforSinRespuesta + d.resumen.osinforSinConsultar,
  };
}

/** «miércoles 04/11/2026», para el membrete. */
export const fechaDelPapel = (p: Pick<PapelRevision, "fecha">): string | null => fechaDelDocumento(p.fecha);
