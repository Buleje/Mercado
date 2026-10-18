/**
 * Ordenar y agrupar lo que muestra el explorador del Archivo, como «Ordenar
 * por ›» y «Agrupar por ›» del clic derecho de Windows. Las carpetas van
 * siempre antes que los archivos dentro de cada grupo.
 *
 * El sentido (ascendente / descendente) se guarda como «invertido» respecto
 * del natural de cada orden: nombre y tipo de la A a la Z, lo más nuevo y lo
 * más pesado primero, lo que vence antes arriba. Así, al cambiar de orden,
 * vuelve a su sentido de siempre.
 */

import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { extensionDe, familiaDe, type FamiliaArchivo } from "@/lib/documents/tipos-archivo";
import type { OrdenArchivo } from "./menus-explorador";

export type AgruparPor = "ninguno" | "tipo" | "fecha" | "estado";

export const AGRUPACIONES: readonly { id: AgruparPor; label: string }[] = [
  { id: "ninguno", label: "Ninguno" },
  { id: "tipo", label: "Tipo" },
  { id: "fecha", label: "Fecha" },
  { id: "estado", label: "Estado" },
];

export interface Grupo {
  clave: string;
  /** Vacío = sin agrupar (no se dibuja cabecera). */
  titulo: string;
  carpetas: DbDocumentFolder[];
  docs: DbDocument[];
}

/** El sentido de siempre de cada orden. */
export function ascendentePorDefecto(o: OrdenArchivo): boolean {
  return o === "name" || o === "type" || o === "expiry";
}

/** ¿Va de menor a mayor (A→Z, viejo→nuevo, liviano→pesado)? */
export const esAscendente = (o: OrdenArchivo, invertido: boolean) => ascendentePorDefecto(o) !== invertido;

const TIPO_DE_FAMILIA: Record<FamiliaArchivo, string> = {
  pdf: "Documento PDF",
  planilla: "Hoja de cálculo",
  texto: "Documento de texto",
  imagen: "Imagen",
  presentacion: "Presentación",
  comprimido: "Archivo comprimido",
  video: "Video",
  audio: "Audio",
  correo: "Correo",
  plano: "Plano",
  otro: "Otro archivo",
};

const ORDEN_FAMILIAS: readonly FamiliaArchivo[] = [
  "pdf", "planilla", "texto", "imagen", "presentacion", "comprimido", "video", "audio", "correo", "plano", "otro",
];

const WORD = new Set(["doc", "docx", "odt", "rtf"]);

/** «Documento de Word», «Hoja de cálculo»… lo que dice la columna Tipo de Windows. */
export function tipoDeArchivo(d: Pick<DbDocument, "name" | "mimeType">): string {
  const familia = familiaDe(d.name, d.mimeType);
  if (familia === "texto" && WORD.has(extensionDe(d.name))) return "Documento de Word";
  return TIPO_DE_FAMILIA[familia];
}

const porNombre = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
const tiempo = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

function comparadorDocs(o: OrdenArchivo): (a: DbDocument, b: DbDocument) => number {
  switch (o) {
    case "name": return porNombre;
    case "type": return (a, b) => tipoDeArchivo(a).localeCompare(tipoDeArchivo(b), "es") || porNombre(a, b);
    case "size": return (a, b) => a.size - b.size || porNombre(a, b);
    case "expiry": return (a, b) => {
      // Lo que no vence va al final en los dos sentidos.
      const av = a.expiresAt ? tiempo(a.expiresAt) : Infinity;
      const bv = b.expiresAt ? tiempo(b.expiresAt) : Infinity;
      return av === bv ? porNombre(a, b) : av - bv;
    };
    case "recent":
    default: return (a, b) => tiempo(a.uploadedAt) - tiempo(b.uploadedAt) || porNombre(a, b);
  }
}

export function ordenarDocs(docs: readonly DbDocument[], o: OrdenArchivo, invertido: boolean): DbDocument[] {
  // «Más parecidos» ya viene ordenado por la búsqueda: sólo se da vuelta.
  if (o === "relevancia") return invertido ? [...docs].reverse() : [...docs];
  const cmp = comparadorDocs(o);
  const asc = esAscendente(o, invertido);
  const lista = [...docs].sort((a, b) => (asc ? cmp(a, b) : cmp(b, a)));
  if (o === "expiry") {
    // Dado vuelta, lo que no vence seguiría arriba: se manda al final igual.
    return [...lista.filter((d) => d.expiresAt), ...lista.filter((d) => !d.expiresAt)];
  }
  return lista;
}

/** Las carpetas no pesan ni vencen: por fecha se ordenan por la última vez que cambiaron; si no, por nombre. */
export function ordenarCarpetas(carpetas: readonly DbDocumentFolder[], o: OrdenArchivo, invertido: boolean): DbDocumentFolder[] {
  const cmp = o === "recent"
    ? (a: DbDocumentFolder, b: DbDocumentFolder) => tiempo(a.updatedAt) - tiempo(b.updatedAt) || porNombre(a, b)
    : o === "size"
      ? (a: DbDocumentFolder, b: DbDocumentFolder) => (a.documentCount ?? 0) - (b.documentCount ?? 0) || porNombre(a, b)
      : porNombre;
  // Vence / Más parecidos no aplican a carpetas: van por nombre, A→Z salvo «invertido».
  const asc = o === "recent" || o === "size" || o === "name" || o === "type" ? esAscendente(o, invertido) : !invertido;
  return [...carpetas].sort((a, b) => (asc ? cmp(a, b) : cmp(b, a)));
}

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** «Hoy», «Ayer», «Esta semana»… con la semana de lunes a domingo. */
export function tramoDeFecha(iso: string, ahora: Date): { clave: string; titulo: string; orden: number } {
  const t = new Date(iso).getTime();
  const hoy = inicioDelDia(ahora);
  const dia = 86_400_000;
  const lunes = new Date(hoy.getTime() - ((hoy.getDay() + 6) % 7) * dia);
  const tramos: [string, string, number][] = [
    ["hoy", "Hoy", hoy.getTime()],
    ["ayer", "Ayer", hoy.getTime() - dia],
    ["semana", "Esta semana", lunes.getTime()],
    ["semana-pasada", "La semana pasada", lunes.getTime() - 7 * dia],
    ["mes", "Este mes", new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime()],
    ["anio", "Este año", new Date(hoy.getFullYear(), 0, 1).getTime()],
  ];
  for (let i = 0; i < tramos.length; i++) {
    const [clave, titulo, desde] = tramos[i];
    if (t >= desde) return { clave, titulo, orden: i };
  }
  return { clave: "antes", titulo: "Hace tiempo", orden: tramos.length };
}

interface OpcionesGrupo {
  ahora?: Date;
  /** «Borrador», «En revisión»… (los mismos del chip). */
  etiquetaEstado?: (estado: string) => string;
}

/** Arma los grupos ya ordenados; un grupo vacío no sale. */
export function agrupar(
  carpetas: readonly DbDocumentFolder[],
  docs: readonly DbDocument[],
  por: AgruparPor,
  opciones: OpcionesGrupo = {},
): Grupo[] {
  if (por === "ninguno") return [{ clave: "todo", titulo: "", carpetas: [...carpetas], docs: [...docs] }];
  const grupos = new Map<string, Grupo & { orden: number }>();
  const meter = (clave: string, titulo: string, orden: number, x: { carpeta?: DbDocumentFolder; doc?: DbDocument }) => {
    let g = grupos.get(clave);
    if (!g) { g = { clave, titulo, orden, carpetas: [], docs: [] }; grupos.set(clave, g); }
    if (x.carpeta) g.carpetas.push(x.carpeta);
    if (x.doc) g.docs.push(x.doc);
  };

  if (por === "fecha") {
    const ahora = opciones.ahora ?? new Date();
    for (const carpeta of carpetas) {
      const t = tramoDeFecha(carpeta.updatedAt, ahora);
      meter(t.clave, t.titulo, t.orden, { carpeta });
    }
    for (const doc of docs) {
      const t = tramoDeFecha(doc.uploadedAt, ahora);
      meter(t.clave, t.titulo, t.orden, { doc });
    }
  } else {
    // Tipo y Estado: las carpetas forman su propio grupo, arriba.
    for (const carpeta of carpetas) meter("carpetas", "Carpetas", -1, { carpeta });
    for (const doc of docs) {
      if (por === "tipo") {
        const familia = familiaDe(doc.name, doc.mimeType);
        const titulo = tipoDeArchivo(doc);
        meter(`tipo:${titulo}`, titulo, ORDEN_FAMILIAS.indexOf(familia), { doc });
      } else {
        const estado = doc.status && doc.status !== "none" ? doc.status : "none";
        const titulo = estado === "none" ? "Sin estado" : opciones.etiquetaEstado?.(estado) ?? estado;
        meter(`estado:${estado}`, titulo, estado === "none" ? 99 : 0, { doc });
      }
    }
  }
  return [...grupos.values()]
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"))
    .map(({ orden: _orden, ...g }) => g);
}

/** Todo en el orden en que se ve (para Shift+clic, flechas y Ctrl+A). */
export const enOrden = (grupos: readonly Grupo[]) => grupos.flatMap((g) => [...g.carpetas.map((c) => ({ tipo: "carpeta" as const, carpeta: c })), ...g.docs.map((d) => ({ tipo: "doc" as const, doc: d }))]);
